# 7TV emoty, taunty ze hry a našeptávání

## 7TV emoty

### Server: `GET /api/emoty` (`src/http/routes/emoty.ts`)

Sada emotů Robova Twitch kanálu (`ROB_TWITCH_ID = "160028137"`, login
`robdiesalot`; Twitch id jde zjistit bez klíče přes
`https://api.ivr.fi/v2/twitch/user?login=…`). Server stáhne
`https://7tv.io/v3/users/twitch/<id>` a **hodinu drží v paměti**
(`EMOTY_CACHE_MS`), ať 7TV nedostává dotaz od každého prohlížeče. Když 7TV
neodpoví, zůstane stará sada, nebo prázdná — chat bez emotů funguje.

`prevedSadu(data)` z každé položky `emote_set.emotes[]` vezme:

```ts
{ jmeno: e.name,
  url: host.startsWith("//") ? `https:${host}` : host,   // …/emote/<id>, bez velikosti
  siroky: w > 0 && h > 0 && w / h > 1.6,                  // WIDE emoty
  nulovaSirka: ((e.flags ?? 0) & 1) !== 0 || ((e.data?.flags ?? 0) & (1 << 8)) !== 0 }
```

**Past — zero-width má dva příznaky:** na položce sady je to bit 1
(`ActiveEmoteFlag.ZeroWidth`), na samotném emotu (`data.flags`) bit 1 << 8
(`EmoteFlag.ZeroWidth`). 7TV posílá oboje a liší se to podle toho, jestli
je emote označený v sadě, nebo od tvůrce. Bereme kterýkoli.

Obrázek: `${url}/${velikost}x.webp` (1x–4x). Prohlížeč si ho bere z
`cdn.7tv.app` přímo (`<img>` cross-origin je v pořádku).

### Klient: `web/src/emoty.ts`

- `nactiEmoty()` — jednou za stránku, sdílený slib; `useEmoty()` hook vrací
  `Map<jmeno, Emote>` (prázdnou, dokud sada nedorazí).
- `rozsekejNaEmoty(text, emoty)` rozseká text podle mezer (`split(/(\s+)/)`
  zachová mezery); slovo, které je **přesně** jménem emotu (velikost písmen
  rozhoduje), je `{ typ: "emote", emote, vrstvy }`, zbytek text.
- **Zero-width vrstvy:** zero-width emote hned za jiným emotem (i přes
  mezery — mezi nimi smí být jen bílé znaky) se do něj přidá jako `vrstvy`;
  víc za sebou = víc vrstev; za textem stojí jako obyčejný emote (není na co
  ho položit). Vykreslení (`Chat.tsx`, `ObrazekEmotu`):

```css
.chat .emote-obal { display: inline-grid; place-items: center; vertical-align: middle; }
.chat .emote-obal > .emote { grid-area: 1 / 1; margin: 0; }
```

Grid místo absolutního pozicování: všechny obrázky leží v jedné buňce, box
má rozměr nejširšího z nich, nic nepřetéká a řádek se přizpůsobí. Stejně to
dělá UnityChat (`.emote-stack`).

- **Řádek s emotem:** obrázek má `height: 1.7em`, `vertical-align: middle`
  a **žádné záporné okraje** — první verze měla `margin: -0.35em`, aby
  nezvedala řádek, a emote přetékal do sousedů. Řádek se má emotu
  přizpůsobit.
- Samotný `!` od admina = emote **DinkDonk** (`EMOTE_VYKRICNIK`) o kus větší
  (`.emote.velky`, 3x); bez sady se ukáže „!“.

## Taunty ze hry (`src/shared/taunty.ts`)

Zpráva, která je jen číslem 1–105, se ukáže jako taunt „**11** Laugh“
(`cisloTauntu(text)`, `TAUNTY[n]`). Texty jsou doslova z herního souboru
`resources/en/strings/key-value/key-value-strings-utf8.txt`, klíče
`11400`–`11504` = taunty 1–105 (generováno skriptem, ne opisováno ručně).

**Zvuk má jen smích (11).** Ve Wwise bankách hry existuje jediná taunt
událost `Play_Taunt_11_Random` (6 náhodných variant → `web/src/assets/taunty/smich-1..6.mp3`,
klient vybere náhodně). Ostatní taunty tam jako číslované události **nejsou**:
prohledali jsme všechna event ID všech pěti bank (FNV-1 hash kandidátů
`Play_Taunt_NNN`, `Play_Taunt_NN_Random`, `Play_VO_Taunt_…`, ~30 vzorů ×
0–129) bez jediné shody; loose soubory (`sound/taunt/*.mp3` jako v HD) v DE
nejsou. Zvuk ostatních tauntů by chtěl rozbor datového souboru hry
(`empires2_x2_p1.dat`, tabulka zvuků odkazuje na Wwise ID) — zatím jen text.
Postup extrakce je ve `zvuky.md`.

## Našeptávání (`web/src/naseptavac.ts` + `Chat.tsx`)

Po vzoru UnityChat (Chrome extension pro Twitch/Kick chat). Logika je čistá
funkce nad textem a pozicí kurzoru, klávesy a panel řeší Chat.

Chování:

- **Emoty jen na Tab.** Žádný prefix, nic se neotevírá při psaní. Tab vezme
  slovo pod kurzorem (`slovoPodKurzorem`: od poslední mezery, ne od nového
  řádku), otevře seznam a **rovnou vloží první položku + mezeru**
  (`aplikuj`). Další Tab cykluje (`posun`, modulo), Shift+Tab zpátky, ↑/↓
  totéž, → a Escape zavřou (text zůstane), Enter zprávu odešle (emote už je
  vložený). Jiná klávesa (kromě Shift/Ctrl/Alt/Meta) seznam zavře. Klik
  myší na položku ji vloží (`onMouseDown` s `preventDefault`, ať pole
  neztratí fokus).
- **@jméno** (účastníci zápasu + autoři zpráv) se otevírá **při psaní** od
  `@` + 1 znak (`zmenaTextu`); první Tab jen potvrdí (`applied = false`),
  Enter vloží/zavře a **neodešle**.
- **Fulltext** — zaškrtávátko jako první řádek panelu, jen u emotů: bez něj
  `startsWith`, s ním `includes`; přepnutí přefiltruje otevřený seznam
  proti původnímu `prefix` (`prefiltruj`). Na rozdíl od UnityChat se
  pamatuje v `localStorage` (`chat.naseptavac-fulltext`).
- **Panel** nad polem přes celou šířku, 4 viditelné položky s posuvným oknem
  kolem vybrané (`oknoOd`), počítadlo „3 / 147“ nad čtyři. Položka: obrázek
  1x + jméno + zdroj („7TV“ / „hráč“).
- **Řazení** (`najdiEmoty`): shoda začátku před shodou uprostřed (má smysl
  ve fulltextu), přesná velikost písmen před nepřesnou, pak `localeCompare`.

Klíčové výňatky:

```ts
export function otevri(text, pos, emoty, uzivatele, fulltext) {
  const { start, slovo } = slovoPodKurzorem(text, pos);
  if (!slovo) return null;
  const druh = slovo.startsWith("@") ? "uzivatel" : "emote";
  const matches = druh === "uzivatel" ? najdiUzivatele(slovo, uzivatele) : najdiEmoty(slovo, emoty, fulltext);
  return matches.length ? { start, end: pos, prefix: slovo, matches, index: 0, applied: false, druh } : null;
}
export function aplikuj(text, ac) {
  const match = ac.matches[ac.index] ?? "";
  const novy = text.slice(0, ac.start) + match + " " + text.slice(ac.end);
  const end = ac.start + match.length + 1;
  return { text: novy, pos: end, ac: { ...ac, end, applied: true } };
}
```

V Chatu: `pouzij(stav)` = `aplikuj` + `setText` + `setAc` +
`requestAnimationFrame(() => vstup.current?.setSelectionRange(pos, pos))`
(kurzor se musí nastavit až po překreslení řízeného inputu).

Odlišnosti od UnityChat: nemáme `!command` (StreamElements) ani `/uc`;
fulltext se pamatuje; zdroje jsou jen 7TV kanálová sada a jména z tohoto
zápasu (UnityChat sbírá jména z příchozích IRC zpráv a emoty z pěti zdrojů).

**Pasti při testování v jsdom:** sada emotů dorazí asynchronně — v testu je
třeba Tab opakovat ve `waitFor`, dokud se text nezmění; `fireEvent.change`
nastaví `selectionStart` na konec, s tím počítá `zmenaTextu`.
