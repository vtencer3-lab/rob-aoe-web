# Tabulka přihlášených: tažení, animace, řazení, Steam

Komponenta `web/src/views/SeznamPrihlasenych.tsx`; tažení v
`web/src/tahani.ts`; sdílené řazení/aktivita v `src/shared/`.

## Tažení řádků (`useTahani`)

Režie skládá zápas přetahováním řádků v rámci skupiny (vybraní × nevybraní,
nikdy křížem). Nativní HTML5 drag & drop dělal jen průhledného ducha a
přeskládal až po puštění, proto **pointer události**:

- `onPointerDown` na řádku (ne z tlačítek/inputů — selektor `NETAHAT`)
  vezme řádek „do ruky“ (`.v-ruce`, `transition: none`), `body.tahne-se`, a
  `pointermove`/`pointerup`/`pointercancel` se poslouchají **na window**:
  při přeskládání React řádek v DOM přesune a prohlížeč mu tím vezme
  zachycení kurzoru, takže tažení přes víc než jednu pozici by se samo
  přerušilo.
- Tažený řádek jede s kurzorem (`translateY(clientY − vychoziY)`); jakmile
  kurzor přejede **střed souseda**, zavolá se `presun(skupina, odId, naId)`
  hned (ne až po puštění) a ostatní řádky dojedou FLIPem (`DOBA_POSUNU_MS =
  150`).
- FLIP v hooku: `useLayoutEffect` bez závislostí po každém překreslení
  změří `top` každého řádku **vůči rodiči** (ne oknu — jinak první
  překreslení po odrolování „animovalo“ celý seznam) a **bez vlastního
  posunu** (`animovanyPosunY(el)` čte translateY z `getComputedStyle`;
  měřit řádek uprostřed animace by uložilo lež). Rozdíl proti minule se
  odanimuje, taženému řádku se jen přepočítá výchozí bod.
- **Zóny:** řádek se prohazuje jen se sousedy se stejným `data-tah-zona`
  („aktivni“ / „spici“). Uložené pořadí nevybraných je promíchané (spící
  může být uprostřed), tabulka ale spící řadí na konec — prohození aktivního
  se spícím přeskládalo aktivní jinak, než bylo vidět, a další pohyb to
  vrátil; řádky „šílely“.
- Po puštění `KONEC_TAHU` událost s prvkem pod kurzorem — karta se
  statistikami si srovná stav (během tahu se hover ignoruje, `tahneSe()`).
- HTML5 drag/drop zůstává jako záloha (jsdom v testech pointer geometrii
  neumí).

## FLIP řádků při přeřazení, odchodu a příchodu (`usePresouvani`)

`useLayoutEffect` s otiskem pořadí (`radky.map(id).join(",")`):

- Ukládá polohy všech řádků vůči tabulce (ne oknu, ne stránce — cokoli, co
  se nad tabulkou zvětší, by uložené polohy zneplatnilo; řádek pak odlétal
  mimo seznam). Zábradlí: posun větší než výška tabulky se neanimuje.
- Kdo zůstal, dojede ze staré polohy na novou (`translateY` → `""`,
  `PRESUN_MS = 340`); kdo přibyl, se objeví prolnutím (`.pribyl`, ne v prvním
  vykreslení); kdo odešel, zmizí hned a řádky pod ním dojedou nahoru.
- **Během tažení se hook nespouští vůbec** (`tahneSe()`) a řádky
  s rozpracovaným inline transformem přeskakuje — jinak si FLIP hooku a
  FLIP tažení lezly do zelí a řádky nad taženým blikaly.
- `prefers-reduced-motion` → přeskládání naráz.

## Plynulý přejezd šířek sloupců

Tabulka má automatické šířky; když odejde nejdelší jméno, sloupce
přeskočí. Hook měří `thead th` před a po změně a šířku přejede
(`transition: width`). Aby to nebylo trhané:

- po dobu přejezdu `table-layout: fixed` (v automatickém rozvržení si
  prohlížeč každý snímek rozděloval šířky znovu podle obsahu a sloupec
  nemohl pod nejdelší text),
- všechny hlavičky dostanou explicitní šířku s `box-sizing: border-box`
  (`getBoundingClientRect` měří s okrajem, `width` buňky je bez něj —
  součet přesahoval tabulku a prohlížeč to dorovnával skokem),
- buňky mají třídou `sirky-prejizdi` zákaz zalomení (delší jméno by na
  chvíli zvýšilo řádek),
- změna pořadí uprostřed přejezdu vychází z toho, kde sloupce právě opticky
  jsou (`uklidSirky` + nové měření); po `PRESUN_MS + 60` ms se inline styly
  smažou.

## Řazení pro režii

Sloupce `SLOUPCE` (ELO, nejvýš, odehráno, hodiny) jdou v režii seřadit
kliknutím: vzestupně → sestupně → vlastní pořadí (`dalsiRazeni`), volba
v localStorage `rezie.razeni`. Hráči řazení nevidí (vidí pořadí přihlášení).
Tažení jde jen ve vlastním pořadí — v seřazeném by přesun nebyl vidět.
Spící jdou na konec vždy.

## Ikona vlastnictví hry ze Steamu (migrace 019)

`player.steam_hra IN ('ma', 'nema', 'soukromy')`. Steam Web API
`GetOwnedGames` říká obojí jednou odpovědí: hodiny (`playtime_forever` u
appid 813780) i vlastnictví — **tvarem odpovědi**:

```ts
// src/external/steam.ts
export function parseSteamHra(json) {
  const response = json?.response;
  if (!jeObjekt(response) || typeof response["game_count"] !== "number")
    return { hodiny: null, vlastnictvi: "soukromy" };   // skrytá knihovna: response: {}
  const hodiny = parseOwnedGames(json);
  return { hodiny, vlastnictvi: hodiny === null ? "nema" : "ma" };  // veřejná má game_count vždy, i 0
}
```

Bez `STEAM_API_KEY` se Steamu neptáme vůbec (prázdný `key=` vrací 403 a to
by se každému zapsalo jako chyba u jména). Ikona: bez pozadí (256 px z exe →
Scenario remove-bg → TinyPNG), otazník u skryté knihovny, vykřičník u
chybějící hry; „+“ u hráče bez hry se před přidáním zeptá (`Potvrzeni`).
V debugu klik na ikonu cykluje stavy jen v prohlížeči.

## Karta hráče při najetí

Najetí na jméno (`onPointerEnter`, ne během tahu) ukáže kartu se
statistikami v rohu okna (`StatistikyHrace.tsx`); po tahu se srovná podle
`KONEC_TAHU`. Bubliny u ikon jsou `.napoveda` (viz `ui-vzory.md`); bublina
mečů (hráč v zápase) má dvě informace s oddělovačem (`.napoveda-vlastni`).
