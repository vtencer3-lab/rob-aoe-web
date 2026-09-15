# Push-to-talk admina bez WebRTC

Admin drží tlačítko s mikrofonem v hlavičce chatu (jen v režii) a účastníci
zápasu ho slyší skoro živě. Celé to jede po infrastruktuře, která už
existovala: HTTP POST nahoru a SSE stream dolů.

## Proč ne WebRTC

WebRTC by znamenalo signaling (SDP/ICE výměnu pro každou dvojici), STUN a
u části lidí za symetrickým NATem i TURN server — další služba, další místo,
kde to u někoho nepůjde. Pro pár vět za večer je zpoždění ~0,5 s a přenos
přes server přijatelná cena za nulovou novou infrastrukturu.

## Tok dat

```
admin: MediaRecorder (Opus/WebM, 32 kb/s, timeslice 250 ms)
  → každý kousek base64 → POST /api/zapas/:id/hlas { sezeni, poradi, data, mime }
  → server hlasHub.publish(KANAL_AKCE, HlasUdalost)   (nic se neukládá)
  → SSE stream téhož spojení jako stav: `event: hlas`, jen komu smí (smiSlyset)
  → posluchač: MediaSource + SourceBuffer, kousky appendBuffer v pořadí
  na konci: POST { sezeni, poradi, konec: true } → endOfStream()
```

### Nahrávání (`web/src/hlas.ts`, `vytvorNahravani`)

- `spust()`: `getUserMedia({ audio: { echoCancellation, noiseSuppression } })`
  (napoprvé se prohlížeč zeptá), `MediaRecorder` s `audio/webm;codecs=opus`,
  když ho prohlížeč umí (`isTypeSupported`), jinak výchozí; `start(250)`.
- Každý `ondataavailable` s daty → base64 (po 32 kB blocích přes
  `String.fromCharCode`) → `odesli({ sezeni, poradi, data, mime })`. Kousky se
  posílají **za sebou** (další čeká na předchozí slib), ať dorazí v pořadí;
  `poradi` je pojistka a posluchač si stejně skládá podle něj.
- `zastav()`: `recorder.stop()` → poslední kousek + značka `konec`, a
  **mikrofon se uvolní** (`track.stop()`), ať v kartě nesvítí nahrávání.
  Cena: při dalším stisku ~100–300 ms na nové `getUserMedia`.
- `sezeni` = `Date.now().toString(36) + náhoda`; každé stisknutí je nové sezení.

### Tlačítko (`web/src/views/PushToTalk.tsx`)

Držet myší (`onPointerDown`) nebo mezerníkem/Enterem; puštění **kdekoli**
(`pointerup`/`pointercancel` na okně), ztráta fokusu okna (`blur`) a odpojení
komponenty nahrávání zastaví. Během držení pulzuje červené kolečko v rohu
(`.nahrava`), ikony jsou zlaté SVG (emoji byly malé a modré). Vedle
🔊/🔇: ztlumení **ostatních adminů** jen pro sebe (`hlas.ztlumit-adminy`
v localStorage; hráčům se nic neztlumí). Popisky jsou vlastní bublina
`.napoveda` bez prodlevy.

### Server (`src/http/routes/hlas.ts`, `src/realtime/hlas.ts`)

- `POST /api/zapas/:id/hlas` jen admin (`requireAdmin`); validace: `sezeni`
  `/^[A-Za-z0-9_-]{1,64}$/`, `poradi` celé ≥ 0, `data` ≤ 200 000 znaků
  base64 (`MAX_KOUSEK_B64`), prázdný kousek jen se `konec`.
- `HlasUdalost` (`src/shared/types.ts`): `zapasId, kdo, jmeno, sezeni,
  poradi, konec, data, mime?, prijemci` — `prijemci` jsou Steam ID účastníků
  zápasu, server je přibalí ke každému kousku (jeden `getZapas` na kousek,
  4×/s, v pořádku).
- `hlasHub` je **vlastní** `Hub<HlasUdalost>` (ne stavový hub): hlas není
  stav, přírůstky se nespojují, pro pozdní příchozí se nic nedrží.
- Stream (`src/http/routes/stream.ts`) má druhý odběr:
  ```ts
  odhlasHlas = hlasHub.subscribe(KANAL_AKCE, (u) => {
    if (smiSlyset(divak, u)) reply.raw.write(`event: hlas\ndata: ${JSON.stringify(u)}\n\n`);
  });
  ```
  `smiSlyset(divak, u)`: účastník zápasu nebo admin; anonym, divák mimo
  zápas a mluvčí sám ne (slyšel by se s ozvěnou).

### Přehrávání (`web/src/hlas.ts`, `spustPrehravacHlasu`)

`useAkceStav` událost `hlas` jen přeposílá na okno (`aoe:hlas`), přehrávač
poslouchá tam a drží `Map<kdo/sezeni, Prehravani>`:

- `Prehravani` s `MediaSource.isTypeSupported(mime)`: `new Audio()`,
  `src = URL.createObjectURL(mediaSource)`, po `sourceopen`
  `addSourceBuffer(mime)`, kousky do fronty a `appendBuffer` vždy až po
  `updateend` (SourceBuffer je asynchronní, souběžný append vyhodí výjimku).
  Přeházené kousky se drží v `odlozene` a lepí se v pořadí `poradi`.
  `konec` → `endOfStream()`.
- **Fallback** bez MediaSource s Opusem (Safari): kousky se posbírají a po
  `konec` se přehrají naráz jako jeden Blob — vysílačka.
- Vlastní hlas se nehraje (server ho ani neposílá). Admin se zapnutým
  ztlumením přeskočí kousky od jiných adminů (`!u.prijemci.includes(ja)` =
  mluvčí není hráč tohoto zápasu, tedy admin). Hlasitost = Master Volume.
- Hotové sezení se z mapy uklidí po minutě.

## Omezení a pasti

- První kousek WebM nese hlavičku (EBML); kdo se připojí uprostřed sezení,
  ten kus nepřehraje — sezení jsou krátká, nevadí.
- Zpoždění ~0,5 s (timeslice + přenos + buffer). Menší timeslice = víc
  požadavků.
- Nic se nenahrává na server ani do databáze.
- Živě se dvěma lidmi to při vývoji nešlo ověřit (jeden účet); první ostrá
  zkouška proběhla až na akci.
- Testy: `src/realtime/hlas.test.ts` (`smiSlyset`), route v
  `src/http/routes/matches.db.test.ts` (403 pro hráče, 400 bez sezení).

## Zesílení mikrofonu (1.7.2)

Tichý mikrofon jde v nastavení zesílit na 100–400 % (`hlas.zesileni-mikrofonu`
v localStorage). `zesilProud(proud, procenta)` postaví řetěz Web Audia
`createMediaStreamSource` → `GainNode` → `WaveShaper` (křivka `tanh`,
oversample 4×) → `createMediaStreamDestination` a nahrává se z jeho `stream`.

**Past (16. 9. 2026): kompresor lupe.** `DynamicsCompressor` má náběh, takže
transient projde nezkrácený a usekne se natvrdo. Měkká křivka `tanh` ohne
každý vzorek okamžitě a nikdy nepřeteče přes 1. Další tři příčiny lupání:
kontext se musí založit se vzorkovací frekvencí stopy
(`track.getSettings().sampleRate`), jinak se převzorkovává; uspaný kontext
(`state === "suspended"`) posílá ticho, proto `resume()`; a
`autoGainControl: false` v `getUserMedia`, jinak se automatika prohlížeče
pere s naším ziskem. Bitrate nahrávky 64 kb/s (32 zesílenému hlasu nestačí).
Kontext se zavírá se zastavením nahrávání; při 100 % se nic nevytváří.

`nahrajZkousku(procent, ms)` nahraje týmž řetězcem pár vteřin a vrátí
`objectURL` k přehrání — nastavení tak jde ladit bez druhého člověka.

## Hlasitost hlasu adminů (1.7.3)

Vedle úplného ztlumení (`hlas.ztlumit-adminy`) má admin i plynulý posuvník
„Hlasitost administrátora“ — podíl z Master Volume (`hlas.hlasitost-admina`,
výchozí 100). `Prehravani` nastaví `audio.volume` z `hlasitostUdalosti(podíl)`;
u hráče se posuvník nenabízí a platí plný Master Volume.
