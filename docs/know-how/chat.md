# Chat zápasu

Chat patří k zápasu (ne k akci ani k celému webu): píšou si v něm účastníci
zápasu a admini, každý jiný ho nevidí. Žije v databázi, do prohlížeče chodí
jako součást stavu akce přes SSE.

## Datový model

Tabulka `zprava` (migrace `database/020_chat.sql` a doplňky):

| sloupec | migrace | význam |
|---|---|---|
| `id`, `zapas_id`, `steam_id`, `text`, `poslano` | 020 | základ; `text` má CHECK 1–500 znaků, `zapas_id` je `ON DELETE CASCADE` |
| `upraveno_v` | 022 | čas poslední úpravy autorem („(editováno)“) |
| `text_puvodni` | 023 | původní znění, když cenzura něco změnila (jen v DB, do stavu nikdy) |
| `odpoved_na` | 026 | odkaz na zprávu téhož zápasu, `ON DELETE SET NULL` |

Jméno, barva a tým se **neukládají** ke zprávě — čtou se při sestavení stavu
z `player` a `ucastnik` (`listZpravy` v `src/db/chat.ts`), takže zpráva vždy
ukazuje aktuální přezdívku a barvu. Do stavu jde posledních
`ZPRAV_NA_ZAPAS = 100` zpráv na zápas jedním dotazem pro celou akci
(`row_number() OVER (PARTITION BY zapas_id ORDER BY id DESC)`), starší
zůstávají jen v databázi.

Tvar ve stavu (`src/shared/types.ts`, `ZpravaView`): `id, steamId, jmeno,
jeAdmin, barva, tym, text, poslano (ISO), upraveno?, odpovedNa?: { id, jmeno,
text } | null`.

## Routy (`src/http/routes/matches.ts`)

- `POST /api/zapas/:id/zprava` `{ text, odpovedNa? }` — jen účastník nebo
  admin, ne u zrušeného zápasu, text oříznutý a nejvýš 500 znaků.
- `PUT /api/zapas/:id/zprava/:zpravaId` `{ text }` — jen autor
  (`upravZpravu` vrací false, když zpráva není jeho).
- `DELETE /api/zapas/:id/zprava/:zpravaId` — jen admin (`smazZpravu`).

Po každé změně `broadcastAkce()` — nový celý stav všem. Žádné diff události,
žádné „přišla zpráva id 42“: klient si změny odvodí porovnáním s předchozím
stavem (viz níž „zvuky“). Cena je pár kB navíc na každou zprávu, zisk je
nulová logika obnovy po výpadku spojení.

## Cenzura (`src/shared/cenzura.ts`)

Sdílený modul (server i prohlížeč), seznam slov převzatý z blacklistu bota
RobJewsALot. Tři úrovně:

- `SLOVA` — přesná slova včetně pádů (množina), `FRAZE` — víceslovné výrazy
  (regex s `\s+` mezi slovy a hranicemi `(?<![\p{L}\p{N}])`), `PREDPONY` —
  kmeny, u kterých je zakázané každé slovo, co jimi začíná (`negroid` →
  „negroidovy“).
- `zjednodus(text)` odstraní diakritiku znak po znaku tak, aby výsledek měl
  **stejnou délku** jako vstup — pozice nálezu se pak přenese zpátky do
  původního textu a hvězdičkují se jen písmena a číslice, interpunkce
  zůstane. Když by zjednodušení délku změnilo (exotické znaky), záložní
  `cenzurujHrube` hvězdičkuje po celých slovech.
- `cenzuruj(text)` vrací **tentýž řetězec**, když není co cenzurovat — server
  podle toho pozná, jestli má do `text_puvodni` uložit originál.

Cenzura běží **na serveru při uložení** (`pridejZpravu`, `upravZpravu`), takže
hvězdičky vidí i autor. Při startu serveru `cenzurujZpetne()` projde všechny
zprávy znovu (seznam slov roste) a originál schová jen tam, kde ještě není.

## Úprava, mazání, důležitá zpráva

- **Šipka nahoru v prázdném poli** načte poslední vlastní zprávu k úpravě
  (`Chat.tsx`, `klavesa`), Enter pošle `onUpravit`, Escape zruší. Upravená
  zpráva nese `(editováno)`.
- **Mazání**: křížek u zprávy jen pro admina (`onSmazat` je předaný jen
  z režie).
- **Důležitá zpráva** (`jeDulezita` v `cenzura.ts`): admin začne text
  vykřičníkem. Všem ostatním k cinknutí navíc zazvoní zvon z radnice, text je
  tučně bez vykřičníku (`textZpravy`). U běžného hráče vykřičník nic nedělá.
  Samotný `!` (prázdný text po odebrání značky) se ukáže jako emote DinkDonk
  (viz `emoty-a-taunty.md`). Admin při psaní vidí pod polem poznámku.

## Zvuky nových zpráv (`web/src/App.tsx`, efekt nad `stav.zapasy`)

Efekt si pamatuje poslední id zprávy každého zápasu (`predchoziLobby`).
Přijde-li ve stavu cizí zpráva s vyšším id: cinknutí (`chat.mp3`, hlasitost
chatu), u důležité navíc zvon, u tauntu 11 místo cinknutí smích. První snímek
po načtení stránky mlčí (jinak by zvonilo při každém obnovení).

## Tlačítko a oddělovač „Nové zprávy“ (`Chat.tsx`)

Cíl: kdo je odrolovaný nahoru (čte starší), nesmí být sražen dolů, ale musí
vidět, že přibylo něco nového, a odkud číst.

- `uDna` (ref) říká, jestli byl seznam u dna před změnou; `posledniVidene`
  je nejvyšší id, které člověk viděl.
- Nová zpráva + u dna → `scrollTop = scrollHeight` (bez animace, ať
  neposkakuje). Nová zpráva + mimo dno → `noveDole = true` (tlačítko
  „Nové zprávy (n) ↓“ uprostřed pod seznamem) a **zároveň** `oddelovacOd =
  posledniVidene` (řádek `li.oddelovac-novych` před první novou zprávou).
  Obojí vzniká ve stejnou chvíli — kdo je odrolovaný, vidí obojí hned.
- Klik na tlačítko (`skocDolu`) sjede k oddělovači tak, aby byl vidět nahoře
  ve výřezu; do osmi zpráv rovnou na dno (všechno se vejde).
- Oddělovač mizí až poté, co se dostane do výřezu seznamu
  (`IntersectionObserver` s `root` = seznam, `threshold: 0.9`), a pak ještě
  `ODDELOVAC_MS = 6 200` ms čeká; zmizení je animace složení výšky do nuly
  (6 s), timeout je o kus delší, ať řádek nezmizí skokem.

**Past:** pozorovatel s kořenem v seznamu „vidí“ oddělovač i tehdy, když je
celý chat odrolovaný mimo okno — blednutí by začalo dřív, než se k němu člověk
vrátí. Proto se blednutí nezačíná, dokud `naObrazovce` není true (efekt má
`naObrazovce` v závislostech a po návratu chatu na obrazovku se spustí znovu).

## Posouvání jen když je chat na obrazovce

Uživatel má chat často pod okrajem nebo na druhém monitoru. Neaktivní okno
nevadí; rozhoduje **výřez**. `IntersectionObserver` bez kořene (viewport)
nad seznamem zpráv drží `naObrazovce`. Mimo obrazovku se nová zpráva chová
jako u odrolovaného čtenáře (tlačítko + oddělovač, žádný skok), takže po
návratu je oddělovač vidět dole v okně chatu.

Admin má týž chat **dvakrát** (režie + karta hráče). Viditelnost se proto
sdílí podle zápasu v modulové mapě:

```ts
const viditelneChaty = new Map<number, Set<symbol>>();
function oznacViditelnost(zapasId, klic, vidim) { /* add/delete do Setu */ }
function nekdoNaObrazovce(zapasId) { return (viditelneChaty.get(zapasId)?.size ?? 0) > 0; }
```

Každá instance chatu se registruje pod vlastním `Symbol()`; posouvají se obě,
dokud je na obrazovce kterákoli; „Nové zprávy“ přijde až mimo obě.

## Odpovědi na zprávy (migrace 026)

Po vzoru UnityChat, ale s vlastní perzistencí (UnityChat threading jen
přeposílá cizím API).

- ↩ u zprávy (ukáže se po najetí, `.odpovedet`) nastaví `odpovidamNa =
  { id, jmeno, text }`; nad polem je pruh `.odpoved-lista` „Odpověď pro
  *jméno*“ + zkrácený text + křížek; Escape ho zruší (má přednost před
  zrušením úpravy); po odeslání zmizí.
- Odeslání: `onOdeslat(text, odpovedNa)` → `POST … { text, odpovedNa }`.
  Server (`pridejZpravu`) vloží odkaz poddotazem `(SELECT id FROM zprava
  WHERE id = $5 AND zapas_id = $1)` — cizí nebo neexistující id se tiše
  zahodí, zpráva se pošle bez odkazu.
- `listZpravy` přibalí `LEFT JOIN zprava o … LEFT JOIN player op` → náhled
  původní `{ id, jmeno, text }` i pro zprávy starší než okno 100.
- Vykreslení: nad textem odpovědi tlačítko `.odpoved-na` „↩ @Jméno úryvek“
  (jeden řádek, výpustka). Klik `skocNaZpravu(id)`: `li[data-zprava-id]`
  → `scrollIntoView({ behavior: "smooth", block: "center" })` a třída
  `.blika` na 2 s (`@keyframes zprava-blik`). Smazaná původní → `odpovedNa`
  null → náhled se nekreslí; původní starší než okno → klik nic neudělá.

## Odznaky a barvy adminů

`ADMIN_BARVY` (Steam ID → třída `rob` / `jouki` / `tonner`, jinak
`admin-jiny`), `TWITCH_ROLE` (Rob broadcaster, Jouki a Tonner moderátor) —
odznaky jsou **oficiální Twitch PNG stažené lokálně** do
`web/src/assets/twitch-{broadcaster,moderator}.png` (72 px), ne z CDN, ať
nezávisí na cizí adrese. Admin má dvojitou záři (`text-shadow` malá ostrá +
velká slabá). V debug módu jde u zprávy přepnout autora (`prepsanyAutor`,
jen v prohlížeči) na jiného admina nebo hráče zápasu — kvůli kontrole barev
bez cizího účtu.

## Sbalení chatu

Hlavička „Chat“ je `div role="button"` (ne `<button>`, aby neměl vzhled
tlačítka), klik sbalí tělo s animací. Režie ho sbalí sama při kliknutí na
Spectate (`UDALOST_SBALIT_CHAT` na okně) — Rob jde do hry a chat mu jen
zabírá místo.

## Co je specifické a co se dá přenést

Přenositelné beze změny: cenzura (`cenzura.ts`), logika oddělovače a
viditelnosti, odpovědi (schéma + poddotaz), náhledy odpovědí přes JOIN.
Specifické: identity adminů podle Steam ID, vazba na zápas a SSE celý stav.
