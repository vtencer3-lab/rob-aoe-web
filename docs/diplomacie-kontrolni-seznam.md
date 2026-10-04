# Diplomacie — kontrolní seznam pravidel a funkcí

Všechno, co web v módu Diplomacie dělá podle pravidel hry a zadání
uživatele, na jednom místě: **co** má platit, **kde** to je v kódu a **čím**
se to hlídá. Slouží k regresní kontrole — po každé změně v Diplomacii projít
sloupec „Hlídá“ (testy) a před hrou s lidmi část „Ruční zkouška ve hře“.

Zdroj pravidel: `src/shared/diplomacie/role.ts` (POPIS_ROLE, z Jinových
pravidel), scénář `ROB_DIPLO_<N>_v<verze sondy>` (triggery). Kontext a historie:
`docs/prehled-praci-a-zameru.md` §3.60. Nový bod sem zapsat hned, jak vznikne.

Zkratky testů: **S** = `src/shared/diplomacie/*.test.ts`, **DB** =
`src/diplomacie/*.db.test.ts` (běží jen na serveru:
`ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo`), **W** =
`web/src/diplomacie/*.test.tsx`.

## 1. Data ze hry (sonda → most → web)

| # | Co platí | Kde | Hlídá |
|---|---|---|---|
| 1.1 | Sonda (formát 8) píše každou herní sekundu na každém PC; soubor `ROB_DIPLO_<N>_v<verze sondy>.xsdat`, značka „ROBD“ | `src/diplomacie/sonda.xs` | `python src/diplomacie/sonda.py --over` (xs-check), ruční zkouška |
| 1.2 | XS čísluje hráče podle lobby, ne podle slotů → všude převod slot → číslo ve hře | `vyhodnotHru` (`src/shared/diplomacie/hra.ts`) | S hra.test „relikvie a žije jdou přes převod slot → číslo“ |
| 1.3 | Nástupce = jediný hráč bez sekundárního cíle po rozdání; potvrzen dvěma snímky ≥ 4 s od sebe | `vyhodnotHru`, `posunKandidata` | S hra.test „Nástupce ze slotů“, DB hra.db.test |
| 1.4 | Data od GM mají přednost, divák (i hráč bez role GM) je záloha; víc běžících zápasů = data diváka nejdou přiřadit | `vyberZapasSnimku`, `divakUstupuje` | S hra.test |
| 1.5 | Odpočet 7 relikvií: sonda sčítá sekundy se 7+ relikviemi do proměnných 240–247 (239 + číslo hráče); při ztrátě **jen stojí** (hra ho nuluje, my ne) | `sonda.xs`, `PROMENNA_DRZENI` | S hra.test „držení 7 relikvií …“ |
| 1.6 | Počitadlo prodejů relikvií = proměnná cíle „prodej 5 relikvií“ slotu (scénář ji zvyšuje vždy, i bez toho cíle) | `promennaProdeju`, `HracHry.prodano` | S schopnosti.test „počitadlo prodejů …“ |
| 1.7 | Relikvie: volná objekt 285 gaii, nesená = jednotka třídy 943, v klášteře = garrisonovaná 285; u tržiště GM se nesleduje | `sonda.xs` | ruční zkouška (diagnostika 3. 10.) |
| 1.9 | Jméno scénáře nese verzi sondy (`ROB_DIPLO_<N>_v<VERZE_SONDY>`, `jmenoScenareProHru`); po změně sonda.xs zvednout `VERZE_SONDY` a `REVIZE_SONDY` v `src/shared/diplomacie/scenar.ts` | `scenar.ts` | sonda.test „otisk sonda.xs patří k VERZE_SONDY“ |
| 1.8 | Web přibaluje sondu sám (nahrání, start serveru, před stažením) | `prebalZastaraleSondy`, `zajistiAktualniSondu` | ruční: po nasazení stáhnout scénář |

## 2. Co kdo vidí (redakce `viditelnost.ts`)

| # | Co platí | Hlídá |
|---|---|---|
| 2.1 | Celá data hry (`hra`) jen GM zápasu — admin-ne-GM ne | S viditelnost.test „data ze hry vidí jen GM“, DB stream.db.test |
| 2.2 | Hráč vidí jen svého krále (`mujKral`) | S viditelnost.test „král z běžící hry“ |
| 2.3 | Hráč dostane jen vlastní postup (`mojeHra`): relikvie, odpočet, sekundární cíl, stav hráčů, na kterých závisí jeho výhra (Popravčí → oběť, Žoldák → pouto, Garda a Nájezdník → Nástupce) | S viditelnost.test „vlastní cíle ze hry“ |
| 2.4 | Garda vidí role padlých hráčů sama (`odhaleneRole`, jen role bez cíle) | S viditelnost.test „Garda vidí role padlých“ |
| 2.5 | Žádosti o schopnosti: hráč jen své; povinný prodej vidí ten, koho se týká | S viditelnost (vidiHrac), W KartaRole |
| 2.6 | Pingy: GM všechny, hráč jen pro všechny a pro sebe | S viditelnost.test „ping …“ |
| 2.8 | **Náhled do cizího zápasu:** kdo je v `DIPLO_NAHLED` (env, hráčská id, teď Jouki a Tonner) a v zápase nehraje, dostane zápas celý (`nahled: true`) a pod zápasy si vybere, čí pohled vidět (karta hráče redigovaná za něj, nebo pult GM) — jen ke čtení; účastníkovi zápasu se nic nepovolí | S viditelnost.test „náhled do cizího zápasu“, W NahledHracu.test |
| 2.7 | Před rozesláním nikdo kromě GM role nevidí | S viditelnost.test „před rozesláním …“ |

## 3. Karta hráče

| # | Co platí | Kde | Hlídá |
|---|---|---|---|
| 3.1 | Mapa vlevo, vpravo cíle (jako GM mapa + tabulka) | `KartaRole.tsx`, `.karta-vedle` | W „vedle mapy ukáže cíle …“ |
| 3.2 | Primární cíl `N/7` relikvií, pod ním `mm:ss / 15:00`, ztlumený, dokud hráč nemá 7 | `MojeCile.tsx` | W „vedle mapy ukáže cíle …“ |
| 3.3 | Sekundární cíl s postupem (Nástupce ho nemá) | `MojeCile.tsx` | W |
| 3.4 | Bez dat ze hry panel čeká s větou | `MojeCile.tsx` | W „bez dat ze hry panel cílů čeká“ |
| 3.5 | Prohra Žoldáka (padlo pouto) a Gardy (padl Nástupce): okno „Prohráváš — rezignuj ve hře“ se znakem `prohra.webp` **přes celou sekci, okolí ztmavené**, zvon, „Zavřít“ ho schová | `duvodProhry`, `Prohra` | W „Žoldákovi padlo pokrevní pouto …“, „obrazovka prohry jde zavřít“ |

## 4. Schopnosti a události (`schopnosti.ts`, migrace 039–041)

| # | Pravidlo | Hlídá |
|---|---|---|
| 4.1 | **Nájezdník — Sabotáž:** 1× za hru, hráč vybere cíl; na jednoho hráče nejvýš jedna (i od druhého Nájezdníka); zamítnutá se nepočítá | S schopnosti.test „Sabotáž …“, DB routes „schopnosti …“, W „Nájezdník vybere cíl …“ |
| 4.2 | **Šašek — 3 informace:** jen tlačítko, odpověď ústně; jedna žádost naráz | S „Šašek 3 informace …“, W |
| 4.3 | **Žoldák — doplatek 4000:** s daty ze hry ho web hlásí GM sám za každý prodej (scénář dá 4000, GM doplatí 4000); tlačítko jen bez mostu | DB „doplatky … se nezdvojí“, W „Žoldákovi padlo pouto …“ (bez tlačítka) |
| 4.4 | **Popravčí (dřív Kat, id `kat`) — 2000 zlata** za každého padlého (Popravčí žije a nepadl on sám): připomínka GM | S „za padlého připomínka Katovi …“, DB |
| 4.5 | **Garda — role padlého:** web ukáže Gardě sám (bod 2.4), GM připomínku nedostává | S, W „Garda vidí role padlých“ |
| 4.6 | **Šašek → Garda:** padla původní Garda a Šašek žije → role `garda`, `puvodni_role = sasek`, čekající informace propadnou; bez mostu tlačítko GM „Garda padla“ | S „pád Gardy promění …“, DB routes „schopnosti …“ |
| 4.6b | Kontrola složení v pultu GM počítá proměněného Šaška podle rozdání (`puvodniRole`) — po proměně nehlásí „2× Garda, chybí Šašek“ | S los.test „Šašek proměněný ve hře v Gardu…“ |
| 4.7 | Proměna na kartě: zvon, ztmavlá karta Šaška, tlačítko „Královská garda padla“ → karta shoří (video `plameny.webm` načtené předem, maska karty se posouvá každý snímek podle času videa — `celoOhne`, týž vzorec jako generátor; konec = konec videa, pojistka 3 s) → karta Gardy; Šašek po proměně informace nežádá | W „Šaškovi padla Garda …“, „hořící karta Šaška přehraje video plamenů“, „čelo ohně …“, S „Šašek proměněný v Gardu …“ |
| 4.8 | **Šašek prodává všechny relikvie**, když padl Nástupce — ne, když jemu samotnému běží odpočet (cizí odpočet ho nechrání); splněno, když má 0 relikvií | S „Šašek po smrti Nástupce“, „splnění …“, W |
| 4.9 | **Nástupce prodává 1 relikvii**, když padl Šašek — ne při vlastním běžícím odpočtu; splněno, když počitadlo prodejů vzroste nad stav při smrti Šaška | S „Nástupce po smrti Šaška“, W |
| 4.10 | Připomínky ze hry vznikají každá jen jednou (unikátní indexy), i když snímek chodí každou sekundu | DB „doplatky … se nezdvojí“ |
| 4.11 | GM: čekající žádosti a připomínky nad tabulkou (Potvrdit/Zamítnout, u připomínek Vyřízeno), nová cinkne; v řádku stav schopnosti (Sabotáž použita, informace n/3, doplatky n×), „(dříve Šašek)“ | W PultGm „GM vidí čekající Sabotáž …“ |
| 4.12 | Schopnosti jen po rozeslání a jen se správnou (současnou) rolí | S „jen po rozeslání …“, DB |

## 5. Pult GM a overlaye

| # | Co platí | Hlídá |
|---|---|---|
| 5.1 | Mapa: králové, relikvie s barvou nosiče, přepínače (platí i pro overlaye) | W PultGm, DB routes „zobrazení mapy“ |
| 5.2 | Ping: víc adresátů, vypínač, zvuk u hráče | DB routes „ping“, S pingy.test |
| 5.3 | Tabulka: pod hráčem sekundární cíl, relikvie, odpočet držení; vyřazený přeškrtnutý | W PultGm |
| 5.5 | Odkrytý pult GM i karta hráče zůstanou odkryté po obnovení stránky v téže záložce (sessionStorage `diplo-pult-<id>`, `diplo-karta-<id>`); nová záložka začíná zakrytá (stream) | W Zakryti.test „s pamětí zůstane odkrytý …“ |
| 5.6 | Nové části (cíle, schopnosti, oznámení, role padlých, povinný prodej) se objevují animací; změněná hodnota dosedne razítkem; při omezení pohybu nic | ruční |
| 5.7 | Stránka akce: sekce „Pravidla hry“ pro každého (háček `sekceAkce`) — velká mapa aktivní verze, pod ní kartičky po třech; odkaz na dokument pravidel (`ODKAZ_PRAVIDEL` v `PravidlaAkce.tsx`) až bude kopie jen ke čtení | W PravidlaAkce.test |
| 5.8 | Osobní overlay karty pro streamery `…/obs/karta?hrac=&klic=` — klíč = HMAC id hráče tajemstvím `OBS_KLIC` (odkaz si hráč vygeneruje na kartě, „Overlay karty do OBS“); data redigovaná jako pro hráče, jen z jeho běžícího zápasu, do rozeslání prázdné | obs.test „routa GET /api/diplo/obs/hrac“ |
| 5.4 | Overlaye OBS `/obs/mapa`, `/obs/tabulka` s `OBS_KLIC` | ruční |

## 6. Známé meze (vědomě)


- Šaškův povinný prodej se vyhodnocuje každým snímkem: když mu při smrti
  Nástupce běžel odpočet a později ho ztratil, připomínka vznikne až tehdy.
- **Mez scénáře, ne webu (oprava u Jina):** prodej relikvie hlídají triggery
  „pN relic sell“ — podmínka *Objects in Area* (dílce 102,118–105,122) jen na
  jednotku **286 (mnich s relikvií)**. Misionář s relikvií (2557) ve středu
  mapy neprodá nic: hra mu nedá 4000 zlata, relikvii neodebere ani nezvýší
  počitadlo `pN_sell_relic`. Stačí ve scénáři přidat stejný trigger pro 2557
  (nebo podmínku na třídu 943) — web pak prodej uvidí sám, čte totéž
  počitadlo.
- Bez mostu (dat ze hry) nefungují automatické události; zůstávají
  tlačítka (Garda padla, doplatek Žoldáka) a GM.

## 7. Ruční zkouška ve hře (před večerem s lidmi)

1. Stáhnout scénář (web přibalí aktuální sondu), založit hru, pustit agenta.
2. Pult GM: „ze hry (GM/divák) před N s“, Nástupce se předvybere sám.
3. Rozeslat role; karta hráče ukazuje relikvie `N/7`, odpočet, sekundární cíl.
4. Nastupce dosáhne 7 relikvií → odpočet běží; ztratí → stojí (ve hře se nuluje).
5. Nájezdník: Sabotáž → GM potvrdí → v tabulce „Sabotáž použita“.
6. Rezignace Gardy → Šašek: zvon, tlačítko, karta shoří → Garda.
7. Rezignace Šaška (bez odpočtu Nástupce) → Nástupce úkol prodat 1 relikvii; po prodeji zmizí.
8. Rezignace Nástupce → Šašek prodává vše; Garda a Nájezdník vidí „padl“; Garda prohrává.
9. Žoldák prodá relikvii → GM připomínka doplatit 4000.
10. Rezignace pouta Žoldáka → obrazovka prohry.
11. Kdokoli padne → GM připomínka „dej Popravčímu 2000“; Garda vidí roli padlého.
