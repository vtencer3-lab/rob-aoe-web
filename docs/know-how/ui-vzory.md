# UI vzory, které se osvědčily

## Modály přes portál a zámek scrollu

Všechna okna (`Potvrzeni`, `PreLobby`, `NastaveniLobby`, `EditaceZapasu`,
`VyberMapy`, `NastaveniUzivatele`, `Svolani`) se kreslí
`createPortal(…, document.body)`. Důvod: okno map otevřené z okna úpravy
zápasu se dřív vnořilo do rodiče a dědilo jeho `transform`/`overflow`
(vnořený modál byl oříznutý). Portál to řeší jednou provždy.

`web/src/zamekScrollu.ts` — `useZamekScrollu()` přidá `body.bez-scrollu` a
**počítá otevřená okna** (modulový čítač), takže vnořené okno (Pre-Lobby nad
úpravou zápasu) zámek nepustí dřív, než se zavře poslední. Uživatel: „teď
můžu scrollovat na hlavním webu, zatímco mám otevřený modál“.

Okno „X tě shání!“ je `role="alertdialog"` a klik mimo ho **nezavře** —
zavírá jen jedno ze dvou tlačítek.

## Bublina bez prodlevy (`.napoveda`)

Nativní `title` se ukáže až po ~1 s a vypadá systémově. `.napoveda` je
`position: relative` a `::after { content: attr(data-napoveda) }` s
`opacity` přechodem 0,1 s, `right: 0; bottom: calc(100% + .35rem)`,
`white-space: pre; width: max-content; max-width: 24rem`. Pro dlouhé texty
u tlačítek přepsat na `white-space: normal; max-width: 18rem; text-align:
center` (jinak jeden řádek přes celý panel). Varianta s vlastním obsahem
(dvě informace s `<hr>`): `.napoveda-vlastni .bublina`. Kroužek (i) u
popisku (`.nastaveni-uzivatele .info`) má bublinu vycentrovanou (`left: 50%;
transform: translateX(-50%)`).

## Sbalitelná lišta „nová verze“

Server posílá ve streamu `event: verze`; když se liší od `VERZE` v bundlu,
nad `<main>` je sticky lišta s „Načíst znovu“. Sbalení dvojitou šipkou:

```css
.nova-verze-obal { position: sticky; top: 0; display: grid; grid-template-rows: 1fr; transition: grid-template-rows .35s ease; }
.nova-verze-obal.sbaleno { grid-template-rows: 0fr; }
.nova-verze-obal > .nova-verze { min-height: 0; overflow: hidden; }
.nova-verze-obal.sbaleno > .nova-verze { transform: translateY(-100%); opacity: 0; padding-top: 0; padding-bottom: 0; border-bottom-width: 0; }
.nova-verze-obal .zalozka { position: absolute; top: 100%; right: 1.5rem; padding-top: 1.35rem; … }
```

Grid `1fr → 0fr` animuje výšku „auto“ (což `height` neumí). **Past:** grid
item ve `0fr` řádku si nechá padding a border — obal měřil ~20 px a záložka
visela pod hranou; sbalený stav musí stáhnout i padding/border a tu výšku
dostane záložka, ať sahá až k hornímu okraji. Šipky jsou inline SVG
(`DvojitaSipka` v `App.tsx`).

## Sbalovací sekce s animací (`Skladaci` v `KontrolaLobby.tsx`)

`<details>` + zachycený klik na `<summary>` + Web Animations na těle (výška
0 ↔ `scrollHeight`, opacity), zavření odebere `open` až po dojetí; stav
v localStorage. Popsáno v `lobby-a-zapasy.md`.

## Posuvníky v nastavení (`Posuvnik` v `NastaveniUzivatele.tsx`)

`input[type=range]` bez rámečku, vlastní dráha přes `--podil` (CSS gradient
do procent), rámeček jen při fokusu (`:focus` outline), kolečko myši po
procentu (`onWheel` + `preventDefault` + fokus), zkouška zvukem po puštění
(`onMouseUp`/`onKeyUp`). Stepper lhůty: šipky ±1, kolečko nad polem po
minutě, náhled „Jsem tu!“ a zvonku vedle (od kolika minut se objeví).

## Přepínače a uložené volby

- `Prepinac` (dvě polohy, `role="switch"`), `useUlozenyPrepinac(klic,
  vychozi)` (localStorage `"1"`/`"0"`, bez úložiště jen do obnovení).
- `useUlozenaVolba(klic, moznosti, vychozi)` pro výčet (pozadí): neznámá
  nebo chybějící hodnota = výchozí; migrace ze starého dvoustavového klíče
  se dělá funkcí `vychozi()`.
- Debug mód: přepínač v patičce (jen admin, `rezie.ladeni`), zkušební
  tlačítka a debug volby se zobrazují jen s ním; „User View“
  (`rezie.pohled-uzivatele`) přepne admina na pohled hráče. Co má fungovat
  i v pohledu uživatele (zkušební svolání), vázat na `me.jeAdmin && ladeni`,
  ne na `admin` (= jeAdmin bez User View).

## Ikony: SVG, ne emoji

Emoji se kreslí fontem systému — malé, barevné (modrý reproduktor), různé
napříč OS. Ikony tlačítek jsou inline SVG s `fill/stroke: currentColor`
(mikrofon, reproduktor, dvojité šipky), velikost přes CSS, zlatá z palety.
Zvonky v tabulce zůstaly emoji (🔔) záměrně; super zvonek jsou dva emoji
zvonky přes sebe s `filter: drop-shadow`.

## Animace

- FLIP pro přesuny řádků (viz `tabulka-prihlasenych.md`), `translateY` +
  `transition`, měření vždy vůči rodiči.
- `prefers-reduced-motion: reduce` **všude**: hooky přeskočí animaci
  (`matchMedia`), CSS má `@media` bloky s `transition: none` /
  `animation: none`.
- Restart CSS animace na témže prvku: odebrat třídu, `void el.offsetWidth`,
  přidat (bliknutí zprávy), nebo `setBlika(null)` + `requestAnimationFrame`.

## Zvýraznění vlastního řádku a stavů

Vlastní řádek v tabulce (`.muj-radek`) má zlatou levou linku; spící řádek
ztlumený; hráč v zápase má meče s bublinou; admini v chatu barvu a záři.
Barvy hráčů jsou proměnné `--b1`…`--b8` v `:root` (barva 6 = fialová
`#bd2bbb`, ne růžová).
