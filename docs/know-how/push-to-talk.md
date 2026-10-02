# Push-to-talk bez WebRTC

Mluvčí drží tlačítko s mikrofonem v hlavičce chatu a účastníci zápasu ho
slyší skoro živě. Mluvit smí admin (v režii) a ten, koho pustí mód akce —
GM Diplomacie ve své kartě zápasu. Celé to jede po infrastruktuře, která už
existovala: HTTP POST nahoru a SSE stream dolů.

## Proč ne WebRTC

WebRTC by znamenalo signaling (SDP/ICE výměnu pro každou dvojici), STUN a
u části lidí za symetrickým NATem i TURN server — další služba, další místo,
kde to u někoho nepůjde. Pro pár vět za večer je zpoždění ~0,6 s a přenos
přes server přijatelná cena za nulovou novou infrastrukturu.

## Tok dat

```
mluvčí: MediaRecorder přímo z mikrofonu (Opus/WebM, 64 kb/s, timeslice 250 ms)
  → každý kousek base64 → POST /api/zapas/:id/hlas { sezeni, poradi, data, mime, zesileni? }
  → server hlasHub.publish(KANAL_AKCE, HlasUdalost)   (nic se neukládá)
  → SSE stream téhož spojení jako stav: `event: hlas`, jen komu smí (smiSlyset)
  → posluchač: MediaSource + SourceBuffer (sequence), kousky appendBuffer v pořadí,
    hrát až se zásobou 450 ms, zesílení až tady
  na konci: POST { sezeni, poradi, konec: true } → endOfStream()
```

### Nahrávání (`web/src/hlas.ts`, `vytvorNahravani`)

- `spust()`: `getUserMedia({ audio: { echoCancellation, noiseSuppression,
  autoGainControl: false } })` (napoprvé se prohlížeč zeptá), `MediaRecorder`
  s `audio/webm;codecs=opus`, když ho prohlížeč umí (`isTypeSupported`),
  jinak výchozí; `start(250)`. **Nahrává se přímo proud mikrofonu, nikdy přes
  Web Audio** — proč, je v oddílu Praskání.
- **Kousek má ve skutečnosti 300 ms, ne 250.** Chrome kóduje Opus po 60 ms
  rámcích a kousek vydá až s rámcem, kterým `timeslice` přeteče: první
  kousek nese 180–240 ms (3–4 rámce), každý další 300 ms (5 rámců), a chodí
  po 300 ms. Každý kousek je jeden celý Cluster WebM.
- Každý `ondataavailable` s daty → base64 (po 32 kB blocích přes
  `String.fromCharCode`) → `odesli({ sezeni, poradi, data, mime, zesileni? })`.
  Kousky se posílají **za sebou** (další čeká na předchozí slib), ať dorazí
  v pořadí; `poradi` je pojistka a posluchač si stejně skládá podle něj.
- Kousek, který neprošel sítí (`fetch` hodí `TypeError`), se po 150 ms pošle
  ještě jednou. Odmítnutí serverem (403, 413) se neopakuje a jednou za
  promluvu se ohlásí mluvčímu u tlačítka (`onChyba`).
- `zesileni` (101–400) nese kousek jen tehdy, když si mluvčí mikrofon
  v nastavení zesílil (`hlas.zesileni-mikrofonu`); čte se při každém stisku.
- `zastav()`: `recorder.stop()` → poslední kousek + značka `konec`, a
  **mikrofon se uvolní** (`track.stop()`), ať v kartě nesvítí nahrávání.
  Cena: při dalším stisku ~100–300 ms na nové `getUserMedia`.
- `sezeni` = `Date.now().toString(36) + náhoda`; každé stisknutí je nové sezení.

### Tlačítko (`web/src/views/PushToTalk.tsx`)

Držet myší (`onPointerDown`) nebo mezerníkem/Enterem; puštění **kdekoli**
(`pointerup`/`pointercancel` na okně), ztráta fokusu okna (`blur`) a odpojení
komponenty nahrávání zastaví. Během držení pulzuje červené kolečko v rohu
(`.nahrava`), ikony jsou zlaté SVG (emoji byly malé a modré). Admin má vedle
🔊/🔇: ztlumení **ostatních adminů** jen pro sebe (`hlas.ztlumit-adminy`
v localStorage; hráčům se nic neztlumí) — prop `ztlumeniAdminu`, GM ho nemá.
Popisky jsou vlastní bublina `.napoveda` bez prodlevy.

`Chat` tlačítko kreslí, když dostane `onHlas`. Dává mu ho `Rezie` (admin)
a `App` v chatu vlastní karty zápasu tomu, komu ho povolí mód
(`RezimKlienta.smiMluvitDoZapasu` — Diplomacie: GM, ať je hráč, nebo host).

### Server (`src/http/routes/hlas.ts`, `src/realtime/hlas.ts`)

- `POST /api/zapas/:id/hlas`: admin vždy; jinak rozhodne háček módu
  `RezimAkce.smiMluvitDoZapasu(zapasId, hracId)` (Diplomacie: `jeGmZapasu`
  v `src/diplomacie/opravneni.ts`, klasický večer `false`) → jinak 403.
  Jádro o Diplomacii neví.
- `rozeberKousek(telo)`: `sezeni` `/^[A-Za-z0-9_-]{1,64}$/`, `poradi` celé
  ≥ 0, `data` ≤ 200 000 znaků base64 (`MAX_KOUSEK_B64`), prázdný kousek jen
  se `konec`; `zesileni` ořízne na 100–400 (`src/shared/hlas.ts`) — server
  nezesiluje, jen hlídá strop.
- `HlasUdalost` (`src/shared/types.ts`): `zapasId, kdo, jmeno, jeAdmin,
  sezeni, poradi, konec, data, mime?, zesileni?, prijemci` — `prijemci` jsou
  `hracId` účastníků zápasu, server je přibalí ke každému kousku.
- `hlasHub` je **vlastní** `Hub<HlasUdalost>` (ne stavový hub): hlas není
  stav, přírůstky se nespojují, pro pozdní příchozí se nic nedrží.
- Stream (`src/http/routes/stream.ts`) má druhý odběr a posílá `event: hlas`
  jen tomu, komu `smiSlyset(divak, u)`: účastník zápasu nebo admin; anonym,
  divák mimo zápas a mluvčí sám ne (slyšel by se s ozvěnou). Pro GM platí
  totéž co pro admina.

### Přehrávání (`web/src/hlas.ts`, `spustPrehravacHlasu`)

`useAkceStav` událost `hlas` jen přeposílá na okno (`aoe:hlas`), přehrávač
poslouchá tam a drží `Map<kdo/sezeni, Prehravani>`:

- `Prehravani` s `MediaSource.isTypeSupported(mime)`: `new Audio()`,
  `src = URL.createObjectURL(mediaSource)`, po `sourceopen`
  `addSourceBuffer(mime)` v režimu `sequence`, kousky do fronty a
  `appendBuffer` vždy až po `updateend` (SourceBuffer je asynchronní,
  souběžný append vyhodí výjimku).
- **Zásoba (`ZASOBA_MS` = 450).** `play()` se volá, až je před přehrávací
  hlavou aspoň 450 ms zvuku (tj. po druhém kousku), nebo když přišla značka
  konce. Když zásoba přesto dojde (`waiting` a před hlavou je míň než
  100 ms), prvek se zastaví a zásoba se sbírá znovu celá — ne od prvního
  dalšího kousku, to by došla hned zas. `waiting` se zásobou v zádech se
  ignoruje: Chrome ho občas ohlásí hned po `play()`, když se teprve rozbíhá.
- **Ztracený kousek (`PRESKOK_MS` = 500).** Přeházené kousky se drží
  v `odlozene` a lepí v pořadí `poradi`; když před čekajícími kousek chybí
  déle než půl vteřiny, přeskočí se. Režim `sequence` řadí kousky za sebe
  bez ohledu na časové značky, takže po přeskočení v zásobě nezůstane díra.
  Opozdilec se zahodí.
- **Ztracená značka konce (`TICHO_MS` = 5000).** Po pěti vteřinách bez
  kousku se sezení uzavře samo (`endOfStream`).
- **Zesílení.** `zesilPrehravani(audio, procent)`: při > 100 % jde prvek
  přes Web Audio — `MediaElementSource` → `GainNode` → `WaveShaper` (měkké
  omezení) → výstup. Jeden kontext na stránku. Zapojí se, jen když kontext
  opravdu běží (`state === "running"`); uspaný kontext by prvek umlčel
  úplně, takže na stránce bez jediného kliknutí hraje hlas nezesílený.
- **Fallback** bez MediaSource s Opusem (Safari): kousky se posbírají a po
  `konec` se přehrají naráz jako jeden Blob — vysílačka.
- Vlastní hlas se nehraje (server ho ani neposílá). Admin se zapnutým
  ztlumením přeskočí kousky od jiných adminů (`u.jeAdmin !== false`
  a mluvčí není hráč tohoto zápasu); GM se tím neztlumí. Hlasitost je
  `hlas.hlasitost-admina`, mimo Master Volume.
- **Kdo mluví.** `kdoMluvi()` / `naZmenuMluvcich()` drží seznam právě
  přehrávaných promluv; `views/MluviTed.tsx` z něj kreslí štítek vlevo dole
  („GM Pepa mluví“ — titul dává háček módu `popisSlotu` podle barvy slotu;
  účastník zápasu má u jména čtvereček své barvy přes `JmenoSBarvou`).
- Dohrané sezení se z mapy uklidí po minutě.

## Praskání (2. 10. 2026)

Uživatel: „naše komunikace přes mikrofon momentálně praská.“ Měřeno, ne
hádáno — dvě příčiny, obě se projeví až u posluchače, a zkouška mikrofonu
v nastavení neukáže ani jednu (hraje obyčejný blob, ne `MediaSource`).

### Jak se měřilo

Headless Chrome s falešným mikrofonem
(`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=sinus.wav`,
sinus 440 Hz, 1 s ve smyčce bez švu), stránka se skutečným svazkem
`web/src/hlas.ts`: `vytvorNahravani` → POST na měřicí server, který kousky
jako ostrý server jen přepošle přes SSE (volitelně se zpožděním podle
modelu sítě) → `spustPrehravacHlasu`. Měří se:

- **nahrávka** (kousky složené a dekódované `decodeAudioData`),
- **výstup** přehrávače (odposlech přes Web Audio do `AudioWorklet`),
- **zádrhely** prvku (`currentTime` se ≥ 40 ms nehýbe, události `waiting`).

U sinusovky je zbytek `x[n+1] + x[n−1] − 2cos(ω)·x[n]` nula; useknutí nebo
šev ho vyhodí až k amplitudě — to je „skok“. „Mezera“ je okno 2 ms s RMS
pod čtvrtinou mediánu. Modely sítě: žádné zpoždění; časy požadavku na ostrý
web naměřené z vývojového stroje (medián 18 ms, p99 32 ms, max 71 ms);
syntetická horší linka (40 ms + exponenciální chvost 30 ms, 5 % zádrhelů
150–300 ms).

**Past měření:** odposlech vede prvek přes `MediaElementSource` do kontextu,
jehož výstup je ticho (zisk 0). Ve třech z devíti běhů na horší lince se po
vyčerpání zásoby hodiny toho kontextu zpomalily proti hodinám stěny
(`ctx.currentTime` nabral za 89 s jen 76 s) a prvek, který na nich visí,
hrál pomalu — zpoždění narostlo na vteřiny. Bez odposlechu (prvek hraje
přímo) ani při zesílení (aplikace si prvek vede přes Web Audio sama, výstup
není ticho) se to nestalo. Je to vlastnost falešného zvukového výstupu
headless Chrome, ne přehrávače; měření proto vypisuje oboje hodiny a běh,
kde se rozejdou, se nepočítá.

### Příčina 1: hrálo se bez zásoby

Přehrávač volal `play()` hned s prvním kouskem (~240 ms zvuku), další kousek
ale dorazí až za 300 ms. Zásoba došla, Chrome přehrávání zastavil a pustil
ho, až měl dost dat — o ~350 ms později. Ve výstupu je to useknutí v plné
amplitudě, ticho a naskočení v plné amplitudě: dvě lupnutí a díra v prvním
slově. Po zádrhelu už zásoba zbyla (~130–430 ms), takže další přišel jen
při větším zpoždění sítě.

| 6 promluv po 5 s, 100 % | před | po |
|---|---|---|
| síť bez zpoždění: promluv se zádrhelem / ticho | 5 ze 6 / 1,8 s | 0 ze 6 / 0 |
| síť jako ostrý web | 4 ze 6 / 1,4 s | 0 ze 6 / 0 |
| horší linka | 6 ze 6 / 2,0 s | 0 ze 6 / 0 |
| zpoždění ústa → ucho | 0,3 s, po zádrhelu 0,67 s | 0,6 s (občas 0,9 s) |

Zbylé zádrhely po opravě: na horší lince zhruba jeden za 80 s řeči (když
se kousek opozdí o víc než ~240 ms rezervy); pak se zásoba nasbírá znovu
a rezerva vzroste. Kdo by chtěl rezervu větší za cenu zpoždění, zvedne
`ZASOBA_MS` (600 → začátek až po třetím kousku, rezerva ~540 ms, zpoždění
~0,9 s).

### Příčina 2: zesílení mikrofonu v nahrávce

Při zesílení > 100 % šla nahrávka přes Web Audio (`MediaStreamSource` →
zisk → `WaveShaper` → `MediaStreamDestination`). Chrome pak rámcům Opusu
dává časové značky podle bloků Web Audia: rámec má 2880 vzorků, blok 128,
na rámec vychází 22,5 bloku, takže značky jdou 0, 61, 120, 181, 240… —
střídavě 61 a 59 ms místo 60. `MediaSource` značky respektuje a každý druhý
rámec, který se s předchozím o milisekundu překrývá, ořízne: skok ve
zvuku každých ~120 ms, **asi osm lupnutí za vteřinu**, dokud mluvčí mluví.
Nahrávka sama (dekódovaná bez ohledu na značky) je čistá — proto to zkouška
mikrofonu neslyšela. Mikrofon nahraný napřímo má značky přesně po 60 ms.

| 5 promluv po 10 s, zesílení 200 % | před | po |
|---|---|---|
| odchylka rozestupu značek rámců od 60 ms | ±1–2 ms u všech 81 | 0 u všech 82 |
| skoky ve výstupu posluchače | 336 (max zbytek 3,1× amplituda) | 4 (náběh mikrofonu na začátku promluvy, je i v nahrávce) |
| skutečný násobek při „200 %“ | 3,4× | 2,0× |

Stará křivka omezení `tanh(1,6·x)/tanh(1,6)` navíc neměla lineární část:
tichý signál násobila 1,74× (z „150 %“ dělala 2,6×, ze „400 %“ 7×) a vzorky
nad plný rozsah řezala natvrdo. Nová je do kolena 0,6 přímka se sklonem 1
a nad ním se plynule ohýbá k 1.

**Pasti z toho:**

- Nahrávku pro `MediaSource` nikdy nevést přes `MediaStreamDestination`.
- `SourceBuffer.mode = "sequence"` to **nespraví** — řadí za sebe segmenty,
  značky uvnitř segmentu platí dál.
- Zkouška bez `MediaSource` (blob v `<audio>`, `decodeAudioData`) chybu
  časových značek neukáže.
- `DynamicsCompressor` jako omezovač lupe (16. 9. 2026): má náběh, takže
  transient projde nezkrácený a usekne se natvrdo. Křivka náběh nemá.

### Co měření nepokrývá

Skutečný mikrofon a reproduktory (šum, ozvěna, potlačení šumu u řeči),
Firefox a Safari, mobilní prohlížeče, skutečnou síť hráčů a zátěž ostrého
serveru. Sinusovka v headless Chrome říká, že řetěz nepřidává švy a díry;
jak zní hlas, musí posoudit ucho.

## Omezení

- První kousek WebM nese hlavičku (EBML); kdo se připojí uprostřed sezení,
  ten kus nepřehraje — sezení jsou krátká, nevadí.
- Zpoždění ~0,6 s (kousek 300 ms + zásoba + přenos). Menší `KOUSEK_MS` =
  víc požadavků; pod 60 ms nemá smysl (rámec Opusu).
- Nic se nenahrává na server ani do databáze.
- Zesílení u posluchače potřebuje běžící Web Audio; na stránce, kde ještě
  nikdo neklikl, hraje hlas nezesílený (a prohlížeč ho beztak nejspíš
  nepustí vůbec — autoplay).
- Testy: `web/src/hlas.test.ts` (zásoba, přeskočení, zesílení, nahrávání),
  `src/http/routes/hlas.test.ts` (`rozeberKousek`), `src/realtime/hlas.test.ts`
  (`smiSlyset`), `src/diplomacie/opravneni.test.ts` (háček), routy
  v `matches.db.test.ts` a `diplomacie/routes.db.test.ts`,
  `web/src/App.hlas.test.tsx` a `web/src/views/MluviTed.test.tsx`.

## Hlasitost a zesílení (nastavení)

- **Hlasitost administrátora** (`hlas.hlasitost-admina`, výchozí 100, jen
  admin): `Prehravani` z ní nastaví `audio.volume` **přímo, mimo Master
  Volume** — výstup má jít naplno, aby se nemusel zesilovat mikrofon.
  Hráč posuvník nemá a hlas mu hraje naplno.
- **Zesílení mikrofonu** (`hlas.zesileni-mikrofonu`, 100–400 %, jen admin):
  jde s kouskem a zesiluje se u posluchače (viz výš). `nahrajZkousku()`
  nahraje pár vteřin a nastavení je přehraje přes tentýž `zesilPrehravani`.
