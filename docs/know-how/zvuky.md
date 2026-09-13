# Zvuky: ze hry ven a v prohlížeči

## Zvuky z Age of Empires II DE (Wwise)

Hra nemá zvuky jako soubory na disku — všechno je ve Wwise archivech
`C:\Program Files (x86)\Steam\steamapps\common\AoE2DE\wwise\*.pck`
(`Base.pck` = 5 soundbank + 73 streamů, `Base.1.pck` = 649 streamů bez bank,
`DLC*.pck`). Do instalace se nikdy nezapisuje, jen čte. Postup, který
funguje (Windows, Git Bash, Python 3.13):

**Nástroje:** `vgmstream-cli` (scoop: `scoop bucket add extras; scoop install
vgmstream`), `wwiser` (`curl -L https://github.com/bnnm/wwiser/releases/latest/download/wwiser.pyz`),
`ffmpeg`/`ffprobe`, vlastní `pck.py` (parser hlavičky AKPK: `'AKPK'`,
hsize u32, ver u32, délky tabulek lang/bnk/stm (+ externals), položky
`(id, blockSize, fileSize, offsetBlocks, langId)`) a `extract_wem.py`
(vytažení wem podle ID ze sekce DIDX/DATA banky). Oba skripty jsou ve
scratchpadu session `zvuky-hra/tmp/` — kdyby se ztratily, jde je napsat
znovu podle popisu hlavičky (~40 řádků).

**Kroky:**

1. Jméno události → ID: Wwise event ID je **FNV-1 32bit hash malých písmen
   názvu**:
   ```python
   def fnv(s):
       h = 2166136261
       for c in s.lower().encode():
           h = (h * 16777619) & 0xffffffff; h ^= c
       return h
   ```
   Názvy událostí jsou v `resources/_common/dat/sounds.json` (jen 49
   položek: `Play_Townbell_Start`, `Play_Townbell_Stop`, `Play_Chat_Received`,
   `Play_Taunt_11_Random`, …). Co tam není, se hledá hádáním vzorů a
   porovnáním hashů se seznamem `CAkEvent … ulID` z dumpu banky.
2. Banky z PCK: `pck.py parse(...)` → `banks` → zapsat každou do
   `bnk/<id>.bnk`. Ve které bance událost je: hledat LE bajty hashe
   (`struct.pack('<I', id)`) — pozor, 4 bajty v 100 MB dávají i falešné
   shody; potvrdit přes dump.
3. `python wwiser.pyz -d txt bnk/232745270.bnk` (60 MB dump HIRC) a
   `python wwiser.pyz -g -gf <id…> -go txtp bnk/232745270.bnk` → v `.txtp`
   je cesta Event → ActionPlay → RanSeqCntr → Sound → Source a řádky
   `#s<subsong> ##<wem>.wem`.
4. `python extract_wem.py bnk/232745270.bnk <wem…>` (embedded zdroje
   „Data/bnk“), nebo rovnou `vgmstream-cli -s <subsong> -o x.wav bnk/….bnk`.
5. `vgmstream-cli -i -o x.wav x.wem` (`-i` ignoruje loop), pak
   `ffmpeg -i x.wav -c:a libmp3lame -q:a 2 x.mp3` (webový zvuk),
   `ffprobe -v error -show_entries format=duration -of csv=p=0 x.wav`.

**Co v repu je a odkud:**

| soubor | událost | event ID | banka / wem | pozn. |
|---|---|---|---|---|
| `web/src/assets/zvon.mp3` | `Play_Townbell_Stop` | 2237803748 | 232745270 / 477992262 | 1,1 s slyšitelné; jediná varianta |
| `web/src/assets/poplach.mp3` | `Play_Townbell_Start` | 3748861528 | 232745270 / 594980362 | 1,7 s; svolání do radnice |
| `web/src/assets/chat.mp3` | `Play_Chat_Received` | 2568766646 | 232745270 / 468419989 | 1,3 s |
| `web/src/assets/taunty/smich-1..6.mp3` | `Play_Taunt_11_Random` | 1217387751 | 232745270 / 219413181, 304027938, 505627596, 670980093, 693140238, 971682679 | 6 náhodných variant |

Ostatní taunty jako číslované události v bankách nejsou (viz
`emoty-a-taunty.md`).

## Hlasitost v prohlížeči (`web/src/zvuk.ts`)

Model: **Master Volume** (výchozí 70 %, `zvuk.hlasitost` v localStorage) je
strop; každá událost má **podíl** z něj — zatím chat (`zvuk.hlasitost-chat`,
výchozí 50 %): `hlasitostUdalosti(podil, master) = master × podil / 100`
(70 × 50 → 35 %). Další události se mají odvozovat stejně, ne přidávat
absolutní hlasitosti. `prehraj(url, procent = hlasitost())` vytvoří `new
Audio(url)`, nastaví `volume` a spustí.

**Výjimka: poplach svolání zní vždy naplno** (`prehraj(poplachUrl, 100)`),
bez ohledu na Master Volume — má hráče vzbudit; u popisku Master Volume je
(i) s bublinou, která to říká. Adminova ozvěna po kliknutí na zvonek
(30 %) z Master Volume vychází.

Posuvníky v nastavení (`views/NastaveniUzivatele.tsx`, komponenta
`Posuvnik`): kolečko myši po procentu, po puštění se zkusí zvuk, který
posuvník řídí (zvon, resp. chat).

## Prohlížečem zadržený zvuk (autoplay policy)

Chrome bez gesta uživatele od načtení stránky `audio.play()` odmítne
(`NotAllowedError`). Typicky spící hráč, který stránku obnovil a nikam
neklikl: okno „tě shání!“ vyskočí, poplach ne. `prehraj` proto:

```ts
void slib?.catch((chyba) => {
  if (!(chyba instanceof Error) || chyba.name !== "NotAllowedError") return;
  if (cekajici.length === 0) { window.addEventListener("pointerdown", prehrajCekajici); window.addEventListener("keydown", prehrajCekajici); }
  cekajici.push({ url, procent });
  oznam(true);           // posluchači naZablokovaniZvuku(cb)
});
```

Zadržené zvuky se přehrají při prvním kliknutí/klávese; `naZablokovaniZvuku`
hlásí zadržení a uvolnění a okno svolání ukáže větu „Prohlížeč poplach bez
tvého kliknutí nepustil — ozve se, jakmile klikneš.“ Jiné chyby přehrávání
se dál jen spolknou (jsdom vrací z `play()` `undefined`, starší Safari taky).
Ztlumenou kartu ani vypnutý zvuk v systému to nevyřeší; Chrome po čase
povolí autoplay bez gesta webům, kde uživatel často pouští zvuk (Media
Engagement Index).

## Kdy co zní (`web/src/App.tsx`)

- Zvon: hráči-účastníkovi, když jeho zápas dostane lobby (host potvrdil;
  hostovi ne), adminovi při přechodu na „hraje se“, všem při důležité zprávě.
- Cinknutí: cizí zpráva v chatu (i adminovi); taunt 11 místo cinknutí smích.
- Poplach: změna `svolanV` u vlastní přihlášky (ne v prvním snímku po
  načtení, ne ve snímku, kde se vlastní přihláška teprve objevila).
- Crashout a další legrácky: `crashout.mp3`, `debil.mp3` (klik na logo).

## Doplněk 14. 9. 2026: taunty ze hry — kde opravdu jsou

Hlasové nahrávky (taunty, hlášky) nejsou v hlavním `wwise/Base.pck` (ten má
jen SFX), ale **jazykově zvlášť v `wwise/<jazyk>/Base.pck`** — anglicky
`wwise/en/Base.pck` (3 banky, 160 streamů). Události `Play_Taunt_01` až
`Play_Taunt_105` (FNV-1 hash) žijí tam. Nejrychlejší cesta k souborům je
komunitní tabulka StepS (Google Sheets `1bczdFQksnbLnjI5zAkw-mSpb9MnnxxEkHDiz1PftIHw`,
list „OLD Audio Sources - Speech“: „Taunt NN“ + jazyk → wem ID); většina
tauntů je vložená v bance (DIDX/DATA), zbytek stream v PCK. Skript
`nastroje/zvuky/taunty.py` (+ `taunty_en_wem.json`) vytáhne všech 105 do
`web/src/assets/taunty/taunt-NN.mp3`. Past: `ls | head` usekl podsložku
`en` a den se hledalo ve špatném balíku; `Play_Taunt_11_Random` v hlavní
bance NENÍ taunt 11.
