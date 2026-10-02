# Katalog dat z běžící hry

Co všechno jde získat z běžící hry Age of Empires II DE a co z toho má smysl
ukazovat na webu. Podklad: jedna skutečná hra 2. 10. 2026 (build
101.103.54800, scénář `LLC-supersonda`, 34 minut herního času, 2 lidé + 6 AI,
408 snímků po 5 herních sekundách). Jak data vznikají a jaké jsou pasti,
popisuje [`analyza-most-ke-hre.md`](analyza-most-ke-hre.md); nástroje jsou
v `nastroje/diplomacie/`.

## 1. Zdroje

| Zdroj | Co dává | Kdy | Čím se čte |
|---|---|---|---|
| **XS sonda** — `<id>\profile\<scénář>.xsdat` | **stav hry**: atributy hráčů, počty jednotek, technologie, diplomacie, proměnné triggerů (cíle scénáře), pozice vybraných jednotek | živě, každých pár sekund; potřebuje sondu přibalenou ve scénáři | `supersonda.py` (úplný výpis), `xsdat.py` (provozní sonda) |
| **Záznam hry** — `<id>\savegame\*.aoe2record` | **co hráči dělali**: kdo je kdo (číslo v lobby, jméno, barva, civilizace, člověk/AI, profil), chat, rezignace, změny postoje z panelu, tributy, výroba, stavby, výzkumy, trh, tempo | živě (soubor roste, jde kopírovat) i po hře; bez zásahu do scénáře | `zaznam.py`, `zaznam_statistiky.py` |
| `metadata/live.dat` a ostatní `metadata/*.dat` | nic o hře — offline telemetrie přihlášení (`eventType`, čas, `loginAttemptsFailed`), keše účtu a obchodu | — | ověřeno sledováním celé hry: 9 změn `live.dat`, pokaždé jen telemetrie |
| logy, `telemetry/*.json`, profil | nic o průběhu hry (start relace, nastavení, klávesy) | — | ověřeno sledováním všech změn souborů během hry |

Během hry hra zapisuje jen čtyři druhy souborů: záznam, soubor sondy,
telemetrii a nastavení profilu. Jiný zdroj dat o hře na disku není.

## 2. Co se hodí na web (výběr)

**Pro pult GM a vyhodnocení Diplomacie (tajné, jen GM):**
- **Sekundární cíle a jejich postup** — proměnné triggerů scénáře: zabito,
  zbouráno, ztráty, hrady, prodané relikvie, konverze; text a limit cíle je
  v triggeru. Kdo dostal který cíl (a kdo žádný = Nástupce), zapisuje sonda
  do proměnných 200 + slot.
- **Relikvie v klášteře** (atribut 7) a **příjem z relikvií** (100).
- **Kdo žije** (`xsGetPlayerInGame`) a **diplomacie 8×8** (i ta nastavená
  triggery; změny z panelu navíc s časem ze záznamu).
- **Poloha králů a relikvií** (jednotky s pozicí) — značky na minimapě.

**Veřejné statistiky zápasu (po hře, případně živě pro diváky):**
- **Suroviny**: zásoby (0–3) a nasbíráno celkem (166–169).
- **Populace**: celková (11), civilní (37), vojenská (40), limit (32),
  volná místa (4); počty jednotek podle 66 tříd (vesničané, pěchota, jízda,
  lučištníci, mniši, obléhací stroje, budovy, věže, hradby, lodě…).
- **Věk** (6) a **technologie**: počet (21) i stav každé jednotlivé
  technologie s časem vyzkoumání.
- **Boj**: zabito jednotek (20), ztraceno (154), hodnota zabitého (170),
  poměr (44), konverze (41, 240), **matice kdo koho** — „Killed P1…P8“
  (301–308) a „Kills by P1…P8“ (326–333).
- **Ekonomika**: hodnota jednotek a budov (164, 165, 246, 247), utraceno za
  budovy a technologie (98, 99), vytvořeno vesničanů (248), **nečinnost
  vesničanů** v sekundách (250), fronta výroby (80, 81).
- **Mapa**: % prozkoumané mapy (22), postavené hrady celkem (173).
- **Ze záznamu**: tempo (akce za minutu), co kdo vyráběl a stavěl, výzkumy
  s časem, obchod na trhu, tributy (kdo komu kolik), změny postojů, chat.

**Identita hráče:** XS i záznam číslují hráče podle pořadí v lobby. Sonda
nese převod slot scénáře → číslo ve hře (`xsGetWorldPlayerId`), jméno
a barvu; záznam má v hlavičce číslo, jméno, barvu, civilizaci a profil.
Web páruje podle barvy (slot scénáře = barva v sestavě zápasu).

**Co získat nejde:** zprávy posílané triggery (např. „p5 ma: …“ — nejsou
v záznamu), obsah obrazovky, skóre jako jedno číslo (v atributech není;
dá se složit z hodnot výš), relikvie nesená mnichem (počítá se až uložená
v klášteře; mniši s relikvií jsou ale vidět jako jednotky s pozicí).

## 3. Úplný výpis ze sondy (hra 2. 10. 2026)

Vygenerováno `python nastroje/diplomacie/supersonda.py katalog prubeh.json`.
Čísla hráčů jsou pořadí v lobby (1 = Jouki, šedá; 7 = modrá AI; 8 = Trokner).

Hra 0:05–34:12, 408 snímků; mapa `LLC-supersonda.aoe2scenario` 220×220, vítězství: vlastní (scénář), místní hráč 1.

Slot scénáře → číslo hráče ve hře (`xsGetWorldPlayerId`): 1→7, 2→2, 3→3, 4→4, 5→5, 6→6, 7→1, 8→8

### Hráči

| č. | jméno | barva | civilizace | typ | žije |
|---|---|---|---|---|---|
| 1 | Jouki in Rage | <GREY> | Koreans (18) | člověk | ne |
| 2 | Caupolican | <RED> | Mapuche (58) | počítač | ano |
| 3 | Yasovarman I | <GREEN> | Khmer (28) | počítač | ano |
| 4 | Jan I Olbracht | <YELLOW> | Poles (38) | počítač | ano |
| 5 | Zhu Zhi | <AQUA> | Wu (50) | počítač | ano |
| 6 | Vasco da Gama | <PURPLE> | Portuguese (24) | počítač | ano |
| 7 | Xun Yu | <BLUE> | Wei (51) | počítač | ano |
| 8 | Trokner | <ORANGE> | Turks (10) | člověk | ano |

### Atributy hráčů, které se během hry měnily

Kandidáti na živé zobrazení. Buňka: první → poslední hodnota (počet změn).

| id | název ve hře | konstanta | p1 | p2 | p3 | p4 | p5 | p6 | p7 | p8 |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | !Food Storage | FOOD_STORAGE | 100024 → 109959 (407×) | 460 → 1420.85 (215×) | 660 → 594.88 (398×) | 660 → 1358.41 (327×) | 360 → 1211.79 (296×) | 660 → 621.97 (151×) | 410 → 1189.97 (358×) | 2000 |
| 1 | !Wood Storage | WOOD_STORAGE | 100024 → 110259 (407×) | 940 → 1789.33 (211×) | 1500 → 122.05 (259×) | 1500 → 2951.18 (316×) | 1165 → 403.95 (276×) | 1500 → 1295.92 (208×) | 1015 → 1153.61 (346×) | 2000 |
| 2 | !Stone Storage | STONE_STORAGE | 99999 | 900 → 600.45 (28×) | 900 → 50 (3×) | 900 → 700.46 (29×) | 900 → 50 (3×) | 900 → 70 (4×) | 900 → 64.17 (7×) | 1000 |
| 3 | !Gold Storage | GOLD_STORAGE | 100024 → 109884 (407×) | 920 → 977.97 (158×) | 1080 → 935.24 (209×) | 1080 → 2316.55 (296×) | 775 → 584.48 (229×) | 1104 → 823.33 (103×) | 795 → 689.21 (327×) | 2000 |
| 4 | Population Headroom | POPULATION_HEADROOM | 50 → 46 (3×) | 47 → 72 (35×) | 52 → 68 (30×) | 82 → 97 (33×) | 72 → 83 (32×) | 72 → 87 (39×) | 22 → 51 (35×) | 72 → 73 (1×) |
| 6 | Current Age | CURRENT_AGE | 3 | 2 → 3 (1×) | 2 → 3 (1×) | 2 → 3 (1×) | 2 → 3 (1×) | 2 → 3 (1×) | 2 → 3 (1×) | 2 |
| 7 | Relics Captured | RELICS_CAPTURED |  |  | 0 → 1 (1×) | 0 → 3 (3×) | 0 → 1 (1×) |  | 0 → 1 (1×) |  |
| 11 | Current Population | CURRENT_POPULATION | 16 → 20 (3×) | 8 → 28 (31×) | 8 → 27 (26×) | 8 → 28 (29×) | 8 → 32 (29×) | 8 → 28 (35×) | 8 → 29 (29×) | 8 → 7 (1×) |
| 19 | Total Units Owned | TOTAL_UNITS_OWNED | 16 → 21 (4×) | 8 → 37 (27×) | 8 → 31 (24×) | 8 → 37 (30×) | 8 → 37 (26×) | 8 → 37 (26×) | 8 → 35 (24×) | 8 |
| 20 | Units Killed | UNITS_KILLED | 0 → 2 (2×) |  |  | 0 → 0 (2×) |  | 0 → 0 (2×) |  |  |
| 21 | Technology Count | TECHNOLOGY_COUNT | 59 | 17 → 29 (11×) | 18 → 27 (9×) | 18 → 31 (13×) | 19 → 34 (13×) | 18 → 26 (8×) | 18 → 30 (12×) | 19 |
| 22 | % Map Explored | PERCENT_MAP_EXPLORED | 41.13 → 43.67 (15×) | 5.64 → 50.13 (331×) | 4.93 → 54.68 (312×) | 3.58 → 41.63 (295×) | 4.61 → 66.38 (309×) | 4.88 → 46.41 (289×) | 4.52 → 49.05 (312×) | 6.41 → 9.71 (22×) |
| 33 | Effect Function Number | EFFECT_FUNCTION_NUMBER |  | 0 → 51 (1×) |  |  |  |  |  |  |
| 36 | Farm Food Amount | FARM_FOOD_AMOUNT | 375 | 250 → 375 (1×) | 250 → 375 (1×) | 250 → 375 (1×) | 250 → 375 (1×) | 250 → 375 (1×) | 250 → 375 (1×) | 250 |
| 37 | Civilian Population | CIVILIAN_POPULATION |  | 6 → 17 (11×) | 6 → 16 (10×) | 6 → 18 (9×) | 6 → 17 (10×) | 6 → 17 (13×) | 6 → 17 (13×) | 6 |
| 38 | Villager Population | VILLAGER_POPULATION |  | 6 → 17 (11×) | 6 → 16 (10×) | 6 → 18 (9×) | 6 → 17 (10×) | 6 → 17 (13×) | 6 → 17 (13×) | 6 |
| 40 | Military Population | MILITARY_POPULATION | 8 → 13 (2×) | 1 → 10 (20×) | 1 → 10 (16×) | 1 → 9 (20×) | 1 → 14 (19×) | 1 → 10 (23×) | 1 → 11 (18×) | 1 → 0 (1×) |
| 41 | Conversions | CONVERSIONS |  |  |  |  |  | 0 → 0 (2×) |  |  |
| 44 | Kill Ratio | KILL_RATIO | 0 → 1 (3×) |  |  |  |  |  | 0 → 0 (2×) |  |
| 49 | Gold Counter | GOLD_COUNTER |  | 0 → 2817.97 (150×) | 0 → 2470.24 (204×) | 0 → 4360.55 (291×) | 0 → 2404.48 (225×) | 0 → 1722.33 (91×) | 0 → 3219.21 (323×) |  |
| 80 | Queued Units | QUEUED_UNITS | 0 → 0 (2×) | 4 → 0 (32×) | 2 → 0 (17×) | 2 → 0 (26×) | 4 → 1 (21×) | 2 → 0 (28×) | 3 → 0 (22×) |  |
| 81 | Training Count | TRAINING_COUNT | 0 → 0 (2×) | 4 → 0 (32×) | 2 → 0 (17×) | 2 → 0 (26×) | 4 → 1 (21×) | 2 → 0 (28×) | 3 → 0 (22×) |  |
| 98 | Building Cost Sum | BUILDING_COST_SUM | 1356 → 1981 (3×) | 2829 → 6976 (55×) | 2435 → 7760 (50×) | 2916 → 6616 (45×) | 3010 → 7635 (52×) | 2750 → 7349 (54×) | 2513 → 8673 (68×) | 2598 → 2518 (1×) |
| 99 | Tech Cost Sum | TECH_COST_SUM | 8400 | 0 → 7465 (11×) | 0 → 7425 (9×) | 0 → 8225 (13×) | 0 → 8240 (13×) | 0 → 6575 (8×) | 0 → 8015 (12×) |  |
| 100 | Relic Income Sum | RELIC_INCOME_SUM |  |  | 0 → 500.25 (132×) | 0 → 2538.75 (266×) | 0 → 653.25 (172×) |  | 0 → 1186.50 (315×) |  |
| 152 | Value Killed by Others | VALUE_KILLED_BY_OTHERS |  | 0 → 468 (5×) | 0 → 420 (3×) | 0 → 565 (7×) | 0 → 305 (4×) | 0 → 915 (8×) | 0 → 400 (4×) | 0 → 80 (1×) |
| 154 | Killed by Others | KILLED_BY_OTHERS |  |  | 0 → 0 (2×) |  | 0 → 0 (2×) | 0 → 0 (2×) |  |  |
| 164 | Value Current Units | VALUE_CURRENT_UNITS | 1006 → 1631 (3×) | 430 → 2172 (31×) | 430 → 2035 (23×) | 430 → 1590 (28×) | 430 → 2345 (27×) | 430 → 2044 (32×) | 430 → 3580 (27×) | 430 → 350 (1×) |
| 165 | Value Current Buildings | VALUE_CURRENT_BUILDINGS | 350 | 2399 → 5014 (30×) | 2005 → 5830 (29×) | 2486 → 5101 (18×) | 2580 → 5370 (27×) | 2320 → 5410 (22×) | 2083 → 5373 (41×) | 2168 |
| 166 | Food Total | FOOD_TOTAL |  | 0 → 4355.85 (203×) | 0 → 3845.13 (397×) | 100 → 5008.41 (319×) | 0 → 3881.79 (284×) | 0 → 3061.97 (145×) | 0 → 5189.97 (351×) |  |
| 167 | Wood Total | WOOD_TOTAL |  | 0 → 4372.51 (198×) | 0 → 4532.05 (252×) | 0 → 4761.18 (310×) | 0 → 3898.95 (268×) | 0 → 4430.92 (195×) | 0 → 4248.61 (336×) |  |
| 168 | Stone Total | STONE_TOTAL |  | 0 → 350.45 (27×) |  | 0 → 350.46 (23×) |  | 0 → 20 (1×) | 0 → 20 (1×) |  |
| 169 | Gold Total | GOLD_TOTAL |  | 0 → 2817.97 (150×) | 0 → 2470.24 (204×) | 0 → 4360.55 (291×) | 0 → 2404.48 (225×) | 0 → 1722.33 (91×) | 0 → 3219.21 (323×) |  |
| 170 | Total Value of Kills | TOTAL_VALUE_OF_KILLS | 0 → 194 (2×) | 0 → 575 (6×) | 0 → 245 (2×) | 0 → 571 (5×) | 0 → 752 (7×) | 0 → 789 (9×) | 0 → 430 (4×) | 0 → 402 (4×) |
| 173 | Total Castles Built | TOTAL_CASTLES_BUILT |  | 1 → 2 (1×) | 1 → 2 (1×) | 1 → 2 (1×) | 1 → 2 (1×) | 1 → 2 (1×) | 1 → 2 (1×) | 1 |
| 178 | Convert Resist Min Adjustment | CONVERT_RESIST_MIN_ADJUSTMENT | 1 | 0 → 1 (1×) |  |  |  |  |  |  |
| 179 | Convert Resist Max Adjustment | CONVERT_RESIST_MAX_ADJUSTMENT | 1 | 0 → 1 (1×) |  |  |  |  |  |  |
| 184 | Value Wonders Castles | VALUE_WONDERS_CASTLES |  | 650 → 1300 (1×) | 650 → 1300 (1×) | 650 → 1300 (1×) | 650 → 1300 (1×) | 650 → 1300 (1×) | 650 → 1300 (1×) | 650 |
| 226 | Villagers Killed by Gaia | VILLAGERS_KILLED_BY_GAIA |  |  |  |  |  |  | 0 → 1 (1×) |  |
| 227 | Villagers Killed by Animals | VILLAGERS_KILLED_BY_ANIMALS |  |  |  |  |  |  | 0 → 1 (1×) |  |
| 229 | Villagers Killed by Human Player | VILLAGERS_KILLED_BY_HUMAN_PLAYER |  |  |  |  |  | 0 → 1 (1×) |  |  |
| 237 | Folwark Collection Amount | FOLWARK_COLLECTION_AMOUNT | 37.50 | 25 → 37.50 (1×) | 25 → 37.50 (1×) | 25 → 37.50 (1×) | 25 → 37.50 (1×) | 25 → 37.50 (1×) | 25 → 37.50 (1×) | 25 |
| 240 | Units Converted | UNITS_CONVERTED |  | 0 → 2 (2×) | 0 → 1 (1×) | 0 → 1 (1×) | 0 → 1 (1×) | 0 → 1 (1×) | 0 → 2 (2×) |  |
| 242 | Trade Workshop Food Productivity | TRADE_WORKSHOP_FOOD_PRODUCTIVITY | 3.38 | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 |
| 243 | Trade Workshop Wood Productivity | TRADE_WORKSHOP_WOOD_PRODUCTIVITY | 3.38 | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 |
| 245 | Trade Workshop Gold Productivity | TRADE_WORKSHOP_GOLD_PRODUCTIVITY | 3.38 | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 → 3.38 (1×) | 2.25 |
| 246 | Units Value Total | UNITS_VALUE_TOTAL | 0 → 675 (2×) | 0 → 2295 (25×) | 0 → 2025 (20×) | 0 → 1810 (22×) | 0 → 2220 (23×) | 0 → 2529 (24×) | 0 → 3550 (23×) |  |
| 247 | Buildings Value Total | BUILDINGS_VALUE_TOTAL | 350 | 3449 → 6619 (21×) | 2755 → 7515 (22×) | 3236 → 6666 (14×) | 3505 → 7530 (21×) | 3070 → 7015 (16×) | 3130 → 7390 (30×) | 2543 |
| 248 | Villagers Created Total | VILLAGERS_CREATED_TOTAL |  | 6 → 17 (11×) | 6 → 16 (10×) | 6 → 18 (9×) | 6 → 17 (10×) | 6 → 18 (12×) | 6 → 18 (12×) | 6 |
| 249 | Villagers Idle Periods Total | VILLAGERS_IDLE_PERIODS_TOTAL |  | 6 → 149 (5×) | 6 → 145 (5×) | 6 → 115 (5×) | 6 → 124 (5×) | 6 → 156 (6×) | 6 → 122 (5×) |  |
| 250 | Villagers Idle Seconds Total | VILLAGERS_IDLE_SECONDS_TOTAL |  | 1.25 → 43.66 (5×) | 1.25 → 42.22 (5×) | 1.25 → 871.26 (5×) | 1.25 → 42.48 (5×) | 1.25 → 46.32 (6×) | 1.25 → 46.38 (5×) |  |
| 302 | Killed P2 | KILLED_P2 | 0 → 1 (1×) |  |  |  |  | 0 → 2 (2×) | 0 → 2 (2×) |  |
| 303 | Killed P3 | KILLED_P3 |  |  |  | 0 → 1 (1×) |  | 0 → 1 (1×) | 0 → 1 (1×) |  |
| 304 | Killed P4 | KILLED_P4 | 0 → 1 (1×) | 0 → 3 (3×) |  |  | 0 → 2 (2×) |  | 0 → 1 (1×) |  |
| 305 | Killed P5 | KILLED_P5 |  |  |  | 0 → 1 (1×) |  | 0 → 3 (3×) |  |  |
| 306 | Killed P6 | KILLED_P6 |  |  |  | 0 → 1 (1×) | 0 → 3 (3×) |  |  | 0 → 4 (4×) |
| 307 | Killed P7 | KILLED_P7 |  | 0 → 2 (2×) |  |  | 0 → 1 (1×) |  |  |  |
| 308 | Killed P8 | KILLED_P8 |  |  |  |  |  | 0 → 1 (1×) |  |  |
| 325 | Kills by Gaia | KILLS_BY_GAIA |  |  |  |  |  |  | 0 → 1 (1×) |  |
| 326 | Kills by P1 | KILLS_BY_P1 |  | 0 → 1 (1×) |  | 0 → 1 (1×) |  |  |  |  |
| 327 | Kills by P2 | KILLS_BY_P2 |  |  |  | 0 → 3 (3×) |  |  | 0 → 2 (2×) |  |
| 329 | Kills by P4 | KILLS_BY_P4 |  |  | 0 → 1 (1×) |  | 0 → 1 (1×) | 0 → 1 (1×) |  |  |
| 330 | Kills by P5 | KILLS_BY_P5 |  |  |  | 0 → 2 (2×) |  | 0 → 3 (3×) | 0 → 1 (1×) |  |
| 331 | Kills by P6 | KILLS_BY_P6 |  | 0 → 2 (2×) | 0 → 1 (1×) |  | 0 → 3 (3×) |  |  | 0 → 1 (1×) |
| 332 | Kills by P7 | KILLS_BY_P7 |  | 0 → 2 (2×) | 0 → 1 (1×) | 0 → 1 (1×) |  |  |  |  |
| 333 | Kills by P8 | KILLS_BY_P8 |  |  |  |  |  | 0 → 4 (4×) |  |  |
| 402 | P2 Kill Value | P2_KILL_VALUE | 0 → 119 (1×) |  |  |  |  | 0 → 194 (2×) | 0 → 155 (2×) |  |
| 403 | P3 Kill Value | P3_KILL_VALUE |  |  |  | 0 → 170 (1×) |  | 0 → 80 (1×) | 0 → 170 (1×) |  |
| 404 | P4 Kill Value | P4_KILL_VALUE | 0 → 75 (1×) | 0 → 225 (3×) |  |  | 0 → 160 (2×) |  | 0 → 105 (1×) |  |
| 405 | P5 Kill Value | P5_KILL_VALUE |  |  |  | 0 → 80 (1×) |  | 0 → 225 (3×) |  |  |
| 406 | P6 Kill Value | P6_KILL_VALUE |  |  |  | 0 → 136 (1×) | 0 → 377 (3×) |  |  | 0 → 402 (4×) |
| 407 | P7 Kill Value | P7_KILL_VALUE |  | 0 → 210 (2×) |  |  | 0 → 140 (1×) |  |  |  |
| 408 | P8 Kill Value | P8_KILL_VALUE |  |  |  |  |  | 0 → 80 (1×) |  |  |

### Atributy nenulové, ale během hry neměnné

Nastavení, bonusy civilizací, konstanty.

| id | název ve hře | konstanta | p1 | p2 | p3 | p4 | p5 | p6 | p7 | p8 |
|---|---|---|---|---|---|---|---|---|---|---|
| 23 | Castle Age Tech ID | CASTLE_AGE_TECH_ID | 102 | 102 | 102 | 102 | 102 | 102 | 102 | 102 |
| 24 | Imperial Age Tech ID | IMPERIAL_AGE_TECH_ID | 103 | 103 | 103 | 103 | 103 | 103 | 103 | 103 |
| 25 | Feudal Age Tech ID | FEUDAL_AGE_TECH_ID | 101 | 101 | 101 | 101 | 101 | 101 | 101 | 101 |
| 30 | Unused Resource 030 | UNUSED_RESOURCE_030 | 500 | 500 | 500 | 500 | 500 | 500 | 500 | 500 |
| 31 | Unused Resource 031 | UNUSED_RESOURCE_031 | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| 32 | Population Cap | BONUS_POPULATION_CAP | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| 39 | All Techs Achieved | ALL_TECHS_ACHIEVED | 178 | 178 | 178 | 178 | 178 | 178 | 178 | 178 |
| 45 | Survival to Finish | SURVIVAL_TO_FINISH | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 46 | Tribute Inefficiency | TRIBUTE_INEFFICIENCY | 0.20 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| 47 | Gold Mining Productivity | GOLD_MINING_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 50 | Reveal Ally | REVEAL_ALLY | 1 |  |  |  |  |  |  |  |
| 52 | Monasteries | MONASTERIES |  | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 58 | Dark Age Tech ID | DARK_AGE_TECH_ID | 104 | 104 | 104 | 104 | 104 | 104 | 104 | 104 |
| 59 | Unused Resource 059 | UNUSED_RESOURCE_059 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 62 | Building Housing Rate | BUILDING_HOUSING_RATE | 20 | 20 | 20 | 20 | 20 | 20 | 20 | 20 |
| 63 | Tax Gather Rate | TAX_GATHER_RATE | 32000 | 32000 | 32000 | 32000 | 32000 | 32000 | 32000 | 32000 |
| 65 | Salvage Decay Rate | SALVAGE_DECAY_RATE | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| 66 | Unused Resource 066 | UNUSED_RESOURCE_066 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 67 | Can Convert | CAN_CONVERT | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 69 | Farm Food Multiplier | FARM_FOOD_MULTIPLIER | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 73 | Waypoint Sprite Graphic ID | WAYPOINT_SPRITE_GRAPHIC_ID | 9483 | 9517 | 9493 | 9503 | 9512 | 9489 | 9513 | 9475 |
| 78 | Trade Vig Rate | TRADE_VIG_RATE | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 | 0.30 |
| 79 | Stone Mining Productivity | STONE_MINING_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 84 | Starting Villagers | STARTING_VILLAGERS | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| 86 | Research Time Modifier | RESEARCH_TIME_MODIFIER |  |  |  |  |  | 0.80 |  |  |
| 87 | Convert Boats | CONVERT_BOATS | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 88 | Fish Trap Food Amount | FISH_TRAP_FOOD_AMOUNT | 700 | 700 | 700 | 700 | 700 | 700 | 700 | 700 |
| 90 | Healing Range | HEALING_RANGE | 4 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| 182 | Convert Building Chance | CONVERT_BUILDING_CHANCE | 25 | 25 | 25 | 25 | 25 | 25 | 25 | 25 |
| 183 | Reveal Enemy | REVEAL_ENEMY | 1 |  |  |  |  |  |  |  |
| 189 | Chopping Productivity | CHOPPING_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 190 | Food Gathering Productivity | FOOD_GATHERING_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 191 | Relic Gold Production Rate | RELIC_GOLD_PRODUCTION_RATE | 30 | 45 | 45 | 45 | 45 | 45 | 45 | 45 |
| 204 | Unit Reveal | REVEAL_UNIT_ON_MAP |  | 82 |  |  |  |  |  |  |
| 205 | Feitoria Food Productivity | FEITORIA_FOOD_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 206 | Feitoria Wood Productivity | FEITORIA_WOOD_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 207 | Feitoria Stone Productivity | FEITORIA_STONE_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 208 | Feitoria Gold Productivity | FEITORIA_GOLD_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 210 | Relics Visible on Map | RELICS_VISIBLE_ON_MAP | -1 | -1 | -1 | -1 | -1 | -1 | -1 | -1 |
| 213 | Raiding Productivity | RAIDING_PRODUCTIVITY | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |
| 215 | Bonus Forager Food | BONUS_FORAGER_FOOD |  | 25 |  |  |  |  |  |  |
| 216 | Shepherd Productivity | SHEPHERD_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 218 | Early Town Center Limit | EARLY_TOWN_CENTER_LIMIT | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 219 | Fishing Productivity | FISHING_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 225 | Relic Food Production Rate | RELIC_FOOD_PRODUCTION_RATE |  | 15 | 15 | 15 | 15 | 15 | 15 | 15 |
| 234 | Spawn Limit | SPAWN_LIMIT |  |  |  |  |  |  | 1 |  |
| 238 | Folwark Attribute Type | FOLWARK_ATTRIBUTE_TYPE | -1 | -1 | -1 |  | -1 | -1 | -1 | -1 |
| 239 | Folwark Building Type | FOLWARK_BUILDING_TYPE | -1 | -1 | -1 | 68 | -1 | -1 | -1 | -1 |
| 241 | Stone Mining Gold Productivity | STONE_MINING_GOLD_PRODUCTIVITY |  |  |  | 33.33 |  |  |  |  |
| 263 | Starting Scout ID | STARTING_SCOUT_ID | 448 | 2550 | 448 | 448 | 448 | 448 | 448 | 448 |
| 264 | Relic Wood Production Rate | RELIC_WOOD_PRODUCTION_RATE |  | 15 | 15 | 15 | 15 | 15 | 15 | 15 |
| 267 | Foraging Wood Productivity | FORAGING_WOOD_PRODUCTIVITY |  |  |  |  |  | 33.33 |  |  |
| 268 | Hunter Productivity | HUNTER_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 270 | Unit Repair Cost | UNIT_REPAIR_COST | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 |
| 271 | Building Repair Cost | BUILDING_REPAIR_COST | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 | 0.50 |
| 281 | Military Convert Chance | MILITARY_CONVERT_CHANCE | 38 | 38 | 38 | 38 | 38 | 38 | 38 | 38 |
| 288 | Pasture Food Amount | PASTURE_FOOD_AMOUNT | 345 | 345 | 345 | 345 | 345 | 345 | 345 | 345 |
| 289 | Pasture Animal Count | PASTURE_ANIMAL_COUNT | 3 | 3 | 3 | 3 | 3 | 3 | 3 | 3 |
| 290 | Pasture Herder Count | PASTURE_HERDER_COUNT | 2 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| 296 | Forager Productivity | FORAGER_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 297 | Varangian Gold Generation | VARANGIAN_GOLD_GENERATION | 50 | 50 | 50 | 50 | 50 | 50 | 50 | 50 |
| 504 | Unused Resource 504 | UNUSED_RESOURCE_504 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 515 | Scythian Horse Archer Productivity | SCYTHIAN_HORSE_ARCHER_PRODUCTIVITY | 1 | 1 | 1 | 1 |  | 1 |  | 1 |
| 520 | Lysanders Raider Productivity | LYSANDERS_RAIDER_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 522 | Base Hoplite Aura Enabled | BASE_HOPLITE_AURA_ENABLED | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 525 | Base Strategos Aura Enabled | BASE_STRATEGOS_AURA_ENABLED | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 527 | Hippeus Aura No Tech | HIPPEUS_AURA_NO_TECH | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 550 | Camel Raider Productivity | CAMEL_RAIDER_PRODUCTIVITY | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| 561 | Pattiyodha Longbowman Default | PATTIYODHA_LONGBOWMAN_DEFAULT | 1 | 1 | 1 | 1 |  | 1 |  | 1 |

### Počty jednotek podle tříd

Buňka: poslední stav (maximum během hry).

| třída | co | Gaia | p1 | p2 | p3 | p4 | p5 | p6 | p7 | p8 |
|---|---|---|---|---|---|---|---|---|---|---|
| 900 | lučištníci |  |  | 2 (2) |  |  | 5 (5) |  |  |  |
| 903 | budovy |  | 2 (2) | 36 (36) | 43 (43) | 42 (42) | 44 (44) | 45 (45) | 38 (38) | 23 (23) |
| 904 | vesničané |  |  | 17 (17) | 16 (16) | 18 (18) | 17 (17) | 17 (18) | 17 (17) | 6 (6) |
| 905 | mořské ryby | 42 (42) |  |  |  |  |  |  |  |  |
| 906 | pěchota |  | 7 (7) | 0 (1) |  | 6 (6) | 4 (4) |  |  |  |
| 907 | keře | 258 (286) |  |  |  |  |  |  |  |  |
| 908 | kamenné doly | 18 (20) |  |  |  |  |  |  |  |  |
| 909 | lovná zvěř | 124 (134) |  |  |  |  |  |  |  |  |
| 910 | šelmy | 40 (47) |  |  |  |  |  |  |  |  |
| 911 | různé | 6 (14) | 1 (1) | 3 (12) | 0 (12) | 1 (7) | 1 (9) | 3 (9) | 0 (8) | 1 (6) |
| 912 | jízda |  | 5 (5) | 6 (8) | 1 (2) | 0 (1) | 1 (1) | 0 (1) | 7 (8) |  |
| 913 | obléhací stroje |  |  | 1 (1) |  |  | 1 (1) | 8 (8) | 1 (1) |  |
| 914 | terén | 1156 (1170) |  |  |  |  |  |  |  |  |
| 915 | stromy | 8653 (8864) |  |  |  |  |  |  |  |  |
| 918 | mniši |  | 1 (1) | 0 (1) | 2 (2) | 3 (3) | 2 (2) | 1 (1) | 2 (2) |  |
| 927 | hradby |  |  | 23 (23) |  | 57 (57) |  |  | 28 (28) | 16 (16) |
| 930 | vlajky | 7 (7) | 20 (20) | 3 (29) | 3 (23) | 3 (18) | 3 (27) | 3 (22) | 3 (23) | 3 (5) |
| 934 | útesy | 79 (79) |  |  |  |  |  |  |  |  |
| 935 | petardy |  |  | 0 (1) | 1 (1) | 0 (1) | 1 (1) | 1 (1) | 1 (1) |  |
| 937 | dvojníci |  | 0 (13) | 407 (407) | 367 (367) | 271 (271) | 473 (473) | 270 (274) | 207 (208) | 27 (32) |
| 942 | relikvie | 7 (8) |  |  |  |  |  |  |  |  |
| 943 | mniši s relikvií |  | 0 (1) | 1 (1) | 0 (1) | 0 (2) | 0 (1) |  | 0 (1) |  |
| 947 | zvědové |  |  | 0 (1) | 0 (1) | 0 (1) | 0 (2) | 0 (1) | 0 (1) | 0 (1) |
| 949 | farmy |  |  | 7 (8) | 1 (6) | 3 (4) | 7 (8) | 6 (7) | 7 (8) |  |
| 952 | věže |  |  |  | 2 (2) |  |  |  |  | 2 (2) |
| 955 | škorpioni |  |  |  | 6 (6) |  |  |  |  |  |
| 958 | dobytek | 0 (22) |  | 0 (2) | 0 (3) | 0 (2) | 0 (2) | 0 (6) |  | 2 (2) |
| 959 | králové |  | 7 (8) | 1 (1) | 1 (1) | 1 (1) | 1 (1) | 1 (1) | 1 (1) | 1 (1) |

### Technologie

Stav každé technologie pro každého hráče (`xsGetTechState`); níže jen ty, které se během hry pohnuly nebo už byly hotové/rozpracované.

- **hráč 1**: vyzkoumaných 386, pohybů během hry 0
- **hráč 2**: vyzkoumaných 367, pohybů během hry 41
  - 13 Heavy plow: zkoumá se → vyzkoumaná (0:55)
  - 103 Imperial Age: zkoumá se → vyzkoumaná (4:15)
  - 203 Bow Saw: zkoumá se → vyzkoumaná (1:10)
  - 908 Clinker Construction: zkoumá se → vyzkoumaná (1:10)
  - 308 Shadow TC Foundation: nedostupná → vyzkoumaná (2:45)
  - 12 Crop rotation: nedostupná → dostupná (4:15)
  - 47 Chemistry: nedostupná → dostupná (4:15) → zkoumá se (21:26) → vyzkoumaná (23:41)
  - 96 Capped Ram: nedostupná → dostupná (4:15)
  - 115 Dupl. Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 144 Wonder Plans: nedostupná → vyzkoumaná (4:15)
  - 239 Heavy Scorpion: nedostupná → dostupná (4:15)
  - 256 Trebuchet: nedostupná → vyzkoumaná (4:15)
  - 257 Onager: nedostupná → dostupná (4:15)
  - 315 Conscription: nedostupná → dostupná (4:15)
  - 321 Sappers: nedostupná → dostupná (4:15)
  - 377 Siege Engineers: nedostupná → dostupná (4:15)
  - 379 Hoardings: nedostupná → dostupná (4:15)
  - 408 Spy Technology: nedostupná → dostupná (4:15)
  - 430 Elite Genitour: nedostupná → dostupná (4:15)
  - 438 Theocracy: nedostupná → dostupná (4:15)
  - 606 Elite Genitour (post-imperial): nedostupná → dostupná (4:15)
  - 608 Arrowslits: nedostupná → dostupná (4:15)
  - 636 Post-Imperial Age start: nedostupná → dostupná (4:15)
  - 797 Flemish Militia Age4: nedostupná → vyzkoumaná (4:15)
  - 907 Carvel Hull: nedostupná → dostupná (4:15)
  - 913 Catapult Galleon (make avail): nedostupná → vyzkoumaná (4:15)
  - 1331 Scale Alexander's Soldiers in Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 1356 Settlement Age4 upgrade: nedostupná → vyzkoumaná (4:15)
  - 1376 Elite Kona: nedostupná → dostupná (4:15) → zkoumá se (9:20) → vyzkoumaná (10:20)
  - 1378 Elite Bolas Rider: nedostupná → dostupná (4:15)
  - 1380 Butalmapu: nedostupná → dostupná (4:15) → zkoumá se (25:36) → vyzkoumaná (26:36)
  - 1385 C-Bonus, Skirm Spear +5 HP Imperial: nedostupná → vyzkoumaná (4:15)
  - 1407 C-Bonus, Skirms Spear Settlements Imperia;: nedostupná → vyzkoumaná (4:15)
  - 34 War Galley: dostupná → zkoumá se (8:55) → vyzkoumaná (10:05)
  - 35 Galleon: nedostupná → dostupná (10:05)
  - 68 Iron casting: dostupná → zkoumá se (13:30) → vyzkoumaná (15:10)
  - 75 Blast Furnace: nedostupná → dostupná (15:10) → zkoumá se (15:20) → vyzkoumaná (17:36)
  - 93 Ballistics: dostupná → zkoumá se (17:11) → vyzkoumaná (18:31)
  - 46 Devotion: dostupná → zkoumá se (22:41) → vyzkoumaná (23:31)
  - 45 Faith: nedostupná → dostupná (23:31)
  - 64 Bombard Tower: nedostupná → dostupná (23:41)
- **hráč 3**: vyzkoumaných 354, pohybů během hry 42
  - 13 Heavy plow: zkoumá se → vyzkoumaná (0:55)
  - 103 Imperial Age: zkoumá se → vyzkoumaná (4:15)
  - 109 Farm -- Age One: vyzkoumaná → nedostupná (28:51) → vyzkoumaná (29:16)
  - 203 Bow Saw: zkoumá se → vyzkoumaná (1:10)
  - 308 Shadow TC Foundation: nedostupná → vyzkoumaná (3:10)
  - 282 Mine has been built: nedostupná → vyzkoumaná (3:15)
  - 12 Crop rotation: nedostupná → dostupná (4:15)
  - 47 Chemistry: nedostupná → dostupná (4:15) → zkoumá se (24:01) → vyzkoumaná (26:11)
  - 96 Capped Ram: nedostupná → dostupná (4:15)
  - 115 Dupl. Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 138 ShadowSiege Wrksp -- Age Three: nedostupná → vyzkoumaná (4:15)
  - 144 Wonder Plans: nedostupná → vyzkoumaná (4:15)
  - 209 Cavalier: nedostupná → dostupná (4:15)
  - 218 Heavy Cavalry Archer: nedostupná → dostupná (4:15)
  - 233 Illumination: nedostupná → dostupná (4:15)
  - 239 Heavy Scorpion: nedostupná → dostupná (4:15) → zkoumá se (33:27)
  - 256 Trebuchet: nedostupná → vyzkoumaná (4:15)
  - 257 Onager: nedostupná → dostupná (4:15)
  - 315 Conscription: nedostupná → dostupná (4:15)
  - 321 Sappers: nedostupná → dostupná (4:15)
  - 377 Siege Engineers: nedostupná → dostupná (4:15)
  - 379 Hoardings: nedostupná → dostupná (4:15)
  - 408 Spy Technology: nedostupná → dostupná (4:15)
  - 430 Elite Genitour: nedostupná → dostupná (4:15)
  - 436 Parthian Tactics: nedostupná → dostupná (4:15)
  - 438 Theocracy: nedostupná → dostupná (4:15)
  - 606 Elite Genitour (post-imperial): nedostupná → dostupná (4:15)
  - 615 Elite Ballista Elephant: nedostupná → dostupná (4:15)
  - 623 Khmer UT: nedostupná → dostupná (4:15) → zkoumá se (16:31) → vyzkoumaná (17:26)
  - 631 Elite Battle Elephant: nedostupná → dostupná (4:15) → zkoumá se (12:30) → vyzkoumaná (14:45)
  - 636 Post-Imperial Age start: nedostupná → dostupná (4:15)
  - 797 Flemish Militia Age4: nedostupná → vyzkoumaná (4:15)
  - 1331 Scale Alexander's Soldiers in Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 130 Stable -- Age Two: nedostupná → vyzkoumaná (7:25)
  - 132 Shadow Archery Rg -- Age Two: nedostupná → vyzkoumaná (11:00)
  - 146 Shadow University -- Age Three: nedostupná → vyzkoumaná (23:56)
  - 249 Hand Cart: dostupná → zkoumá se (23:56) → vyzkoumaná (25:06)
  - 622 Khmer UT: dostupná → zkoumá se (25:51) → vyzkoumaná (26:41)
  - 37 Cannon Galleon: nedostupná → vyzkoumaná (26:11)
  - 85 Hand Cannoneer: nedostupná → vyzkoumaná (26:11)
  - 376 Elite Cannon Galley: nedostupná → dostupná (26:11)
  - 93 Ballistics: dostupná → zkoumá se (27:36) → vyzkoumaná (28:56)
- **hráč 4**: vyzkoumaných 369, pohybů během hry 47
  - 13 Heavy plow: zkoumá se → vyzkoumaná (0:55)
  - 103 Imperial Age: zkoumá se → vyzkoumaná (4:15)
  - 109 Farm -- Age One: vyzkoumaná → nedostupná (23:21) → vyzkoumaná (23:26)
  - 203 Bow Saw: zkoumá se → vyzkoumaná (1:10)
  - 146 Shadow University -- Age Three: nedostupná → vyzkoumaná (2:30)
  - 308 Shadow TC Foundation: nedostupná → vyzkoumaná (2:45)
  - 12 Crop rotation: nedostupná → dostupná (4:15)
  - 47 Chemistry: nedostupná → dostupná (4:15) → zkoumá se (19:06) → vyzkoumaná (21:21)
  - 96 Capped Ram: nedostupná → dostupná (4:15)
  - 115 Dupl. Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 144 Wonder Plans: nedostupná → vyzkoumaná (4:15)
  - 209 Cavalier: nedostupná → dostupná (4:15)
  - 230 Block Printing: nedostupná → dostupná (4:15)
  - 256 Trebuchet: nedostupná → vyzkoumaná (4:15)
  - 257 Onager: nedostupná → dostupná (4:15)
  - 315 Conscription: nedostupná → dostupná (4:15)
  - 321 Sappers: nedostupná → dostupná (4:15)
  - 377 Siege Engineers: nedostupná → dostupná (4:15)
  - 379 Hoardings: nedostupná → dostupná (4:15)
  - 408 Spy Technology: nedostupná → dostupná (4:15)
  - 430 Elite Genitour: nedostupná → dostupná (4:15)
  - 438 Theocracy: nedostupná → dostupná (4:15)
  - 606 Elite Genitour (post-imperial): nedostupná → dostupná (4:15)
  - 608 Arrowslits: nedostupná → dostupná (4:15)
  - 636 Post-Imperial Age start: nedostupná → dostupná (4:15)
  - 779 Elite Obuch: nedostupná → dostupná (4:15) → zkoumá se (11:10) → vyzkoumaná (12:05)
  - 783 Lechitic Legacy: nedostupná → dostupná (4:15) → zkoumá se (23:01) → vyzkoumaná (24:21)
  - 791 Winged Hussar (P. post-imperial): nedostupná → dostupná (4:15)
  - 796 Folwark Age4 upgrade: nedostupná → vyzkoumaná (4:15)
  - 797 Flemish Militia Age4: nedostupná → vyzkoumaná (4:15)
  - 811 C-Bonus, Villager regeneration age4: nedostupná → vyzkoumaná (4:15)
  - 1331 Scale Alexander's Soldiers in Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 1451 Heavy Mounted Crossbowman: nedostupná → dostupná (4:15)
  - 138 ShadowSiege Wrksp -- Age Three: nedostupná → vyzkoumaná (4:45)
  - 93 Ballistics: dostupná → zkoumá se (14:00) → vyzkoumaná (15:20)
  - 76 Chain Mail Armor: dostupná → zkoumá se (15:25) → vyzkoumaná (16:41)
  - 77 Plate Mail Armor: nedostupná → dostupná (16:41)
  - 249 Hand Cart: dostupná → zkoumá se (17:26) → vyzkoumaná (18:36)
  - 98 Elite Skirmisher: dostupná → zkoumá se (19:01) → vyzkoumaná (20:06)
  - 655 Imperial Skirmisher: nedostupná → zakázaná (20:06)
  - 656 Imperial Skirmisher (disable): nedostupná → vyzkoumaná (20:06)
  - 37 Cannon Galleon: nedostupná → vyzkoumaná (21:21)
  - 64 Bombard Tower: nedostupná → dostupná (21:21)
  - 188 Bombard Cannon: nedostupná → vyzkoumaná (21:21)
  - 197 Pikeman: dostupná → zkoumá se (27:11) → vyzkoumaná (27:56)
  - 68 Iron casting: dostupná → zkoumá se (27:16) → vyzkoumaná (28:56)
  - 75 Blast Furnace: nedostupná → zkoumá se (28:56) → vyzkoumaná (31:11)
- **hráč 5**: vyzkoumaných 371, pohybů během hry 40
  - 13 Heavy plow: zkoumá se → vyzkoumaná (0:55)
  - 82 Chain Barding Armor: zkoumá se → vyzkoumaná (1:25)
  - 103 Imperial Age: zkoumá se → vyzkoumaná (4:15)
  - 203 Bow Saw: zkoumá se → vyzkoumaná (1:10)
  - 207 Long Swordsman: dostupná → zkoumá se (0:30) → vyzkoumaná (1:25)
  - 308 Shadow TC Foundation: nedostupná → vyzkoumaná (2:45)
  - 15 Guilds: nedostupná → dostupná (4:15)
  - 47 Chemistry: nedostupná → dostupná (4:15) → zkoumá se (20:51) → vyzkoumaná (23:06)
  - 80 Plate Barding Armor: nedostupná → dostupná (4:15)
  - 115 Dupl. Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 144 Wonder Plans: nedostupná → vyzkoumaná (4:15)
  - 217 Two-Handed Swordsman: nedostupná → dostupná (4:15) → zkoumá se (12:40) → vyzkoumaná (13:40)
  - 221 Two Man Saw: nedostupná → dostupná (4:15)
  - 233 Illumination: nedostupná → dostupná (4:15)
  - 239 Heavy Scorpion: nedostupná → dostupná (4:15)
  - 257 Onager: nedostupná → dostupná (4:15)
  - 315 Conscription: nedostupná → dostupná (4:15)
  - 375 Dry Dock: nedostupná → vyzkoumaná (4:15)
  - 408 Spy Technology: nedostupná → dostupná (4:15)
  - 430 Elite Genitour: nedostupná → dostupná (4:15)
  - 438 Theocracy: nedostupná → dostupná (4:15)
  - 606 Elite Genitour (post-imperial): nedostupná → dostupná (4:15)
  - 636 Post-Imperial Age start: nedostupná → dostupná (4:15)
  - 797 Flemish Militia Age4: nedostupná → vyzkoumaná (4:15)
  - 1025 Traction Trebuchet (make avail): nedostupná → vyzkoumaná (4:15)
  - 1033 Heavy Hei-Kuang Cavalry: nedostupná → dostupná (4:15) → zkoumá se (32:37) → vyzkoumaná (34:12)
  - 1034 Lou Chuan (make avail): nedostupná → vyzkoumaná (4:15)
  - 1074 Elite Fire Archer: nedostupná → dostupná (4:15) → zkoumá se (8:45) → vyzkoumaná (9:45)
  - 1076 C-Bonus, Jian & Hei Kuang attack: nedostupná → vyzkoumaná (4:15)
  - 1081 Ming-Kuang Armor: nedostupná → dostupná (4:15) → zkoumá se (23:21) → vyzkoumaná (24:16)
  - 1083 Sun Jian (make avail): nedostupná → vyzkoumaná (4:15)
  - 1087 C-Bonus, inf regen Imp: nedostupná → vyzkoumaná (4:15)
  - 1331 Scale Alexander's Soldiers in Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 39 Husbandry: dostupná → zkoumá se (13:20) → vyzkoumaná (14:15)
  - 264 Champion: nedostupná → dostupná (13:40)
  - 200 Bodkin Arrow: dostupná → zkoumá se (14:30) → vyzkoumaná (15:15)
  - 201 Bracer: nedostupná → dostupná (15:15)
  - 249 Hand Cart: dostupná → zkoumá se (16:21) → vyzkoumaná (17:36)
  - 93 Ballistics: dostupná → zkoumá se (18:16) → vyzkoumaná (19:36)
  - 1082 Sitting Tiger + Chemistry: nedostupná → vyzkoumaná (24:16)
- **hráč 6**: vyzkoumaných 361, pohybů během hry 39
  - 13 Heavy plow: zkoumá se → vyzkoumaná (0:45)
  - 103 Imperial Age: zkoumá se → vyzkoumaná (4:15)
  - 203 Bow Saw: zkoumá se → vyzkoumaná (0:55)
  - 308 Shadow TC Foundation: nedostupná → vyzkoumaná (2:45)
  - 12 Crop rotation: nedostupná → dostupná (4:15)
  - 15 Guilds: nedostupná → dostupná (4:15)
  - 47 Chemistry: nedostupná → dostupná (4:15) → zkoumá se (16:46) → vyzkoumaná (18:36)
  - 96 Capped Ram: nedostupná → dostupná (4:15)
  - 115 Dupl. Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 144 Wonder Plans: nedostupná → vyzkoumaná (4:15)
  - 146 Shadow University -- Age Three: nedostupná → vyzkoumaná (4:15)
  - 209 Cavalier: nedostupná → dostupná (4:15)
  - 221 Two Man Saw: nedostupná → dostupná (4:15)
  - 230 Block Printing: nedostupná → dostupná (4:15)
  - 256 Trebuchet: nedostupná → vyzkoumaná (4:15)
  - 257 Onager: nedostupná → dostupná (4:15)
  - 315 Conscription: nedostupná → dostupná (4:15)
  - 321 Sappers: nedostupná → dostupná (4:15)
  - 377 Siege Engineers: nedostupná → dostupná (4:15)
  - 408 Spy Technology: nedostupná → dostupná (4:15)
  - 430 Elite Genitour: nedostupná → dostupná (4:15)
  - 438 Theocracy: nedostupná → dostupná (4:15)
  - 563 Elite Organ Gun: nedostupná → dostupná (4:15) → zkoumá se (10:10) → vyzkoumaná (10:55)
  - 570 Feitoria (make avail): nedostupná → vyzkoumaná (4:15)
  - 573 Portuguese UT: nedostupná → dostupná (4:15) → zkoumá se (27:36) → vyzkoumaná (28:21)
  - 597 Elite Caravel: nedostupná → dostupná (4:15)
  - 606 Elite Genitour (post-imperial): nedostupná → dostupná (4:15)
  - 636 Post-Imperial Age start: nedostupná → dostupná (4:15)
  - 797 Flemish Militia Age4: nedostupná → vyzkoumaná (4:15)
  - 1331 Scale Alexander's Soldiers in Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 1399 C-Bonus, Ships +20% HP: nedostupná → vyzkoumaná (4:15)
  - 138 ShadowSiege Wrksp -- Age Three: nedostupná → vyzkoumaná (10:25)
  - 37 Cannon Galleon: nedostupná → vyzkoumaná (18:36)
  - 64 Bombard Tower: nedostupná → dostupná (18:36)
  - 85 Hand Cannoneer: nedostupná → vyzkoumaná (18:36)
  - 188 Bombard Cannon: nedostupná → vyzkoumaná (18:36)
  - 376 Elite Cannon Galley: nedostupná → dostupná (18:36)
  - 249 Hand Cart: dostupná → zkoumá se (19:41) → vyzkoumaná (20:41)
  - 93 Ballistics: dostupná → zkoumá se (21:26) → vyzkoumaná (22:31)
- **hráč 7**: vyzkoumaných 369, pohybů během hry 40
  - 13 Heavy plow: zkoumá se → vyzkoumaná (0:55)
  - 82 Chain Barding Armor: zkoumá se → vyzkoumaná (1:25)
  - 103 Imperial Age: zkoumá se → vyzkoumaná (4:15)
  - 203 Bow Saw: zkoumá se → vyzkoumaná (1:10)
  - 1043 C-Bonus, Fre vill + Heavy Plow: nedostupná → vyzkoumaná (0:55)
  - 1040 C-Bonus, Fre vill + Bow Saw: nedostupná → vyzkoumaná (1:10)
  - 308 Shadow TC Foundation: nedostupná → vyzkoumaná (3:00)
  - 12 Crop rotation: nedostupná → dostupná (4:15)
  - 47 Chemistry: nedostupná → dostupná (4:15) → zkoumá se (15:55) → vyzkoumaná (18:06)
  - 96 Capped Ram: nedostupná → dostupná (4:15)
  - 115 Dupl. Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 144 Wonder Plans: nedostupná → vyzkoumaná (4:15)
  - 230 Block Printing: nedostupná → dostupná (4:15)
  - 233 Illumination: nedostupná → dostupná (4:15)
  - 239 Heavy Scorpion: nedostupná → dostupná (4:15)
  - 257 Onager: nedostupná → dostupná (4:15)
  - 315 Conscription: nedostupná → dostupná (4:15)
  - 379 Hoardings: nedostupná → dostupná (4:15)
  - 408 Spy Technology: nedostupná → dostupná (4:15)
  - 430 Elite Genitour: nedostupná → dostupná (4:15)
  - 436 Parthian Tactics: nedostupná → dostupná (4:15)
  - 438 Theocracy: nedostupná → dostupná (4:15)
  - 606 Elite Genitour (post-imperial): nedostupná → dostupná (4:15)
  - 636 Post-Imperial Age start: nedostupná → dostupná (4:15)
  - 797 Flemish Militia Age4: nedostupná → vyzkoumaná (4:15)
  - 1025 Traction Trebuchet (make avail): nedostupná → vyzkoumaná (4:15)
  - 1033 Heavy Hei-Kuang Cavalry: nedostupná → dostupná (4:15)
  - 1034 Lou Chuan (make avail): nedostupná → vyzkoumaná (4:15)
  - 1036 Elite Tiger Cavalry: nedostupná → dostupná (4:15) → zkoumá se (11:10) → vyzkoumaná (12:20)
  - 1038 Cao Cao (make avail): nedostupná → vyzkoumaná (4:15)
  - 1057 C-Bonus, Heavy Cav +30% HP + BL: nedostupná → vyzkoumaná (4:15)
  - 1059 C-Bonus, Heavy Cav +30% HP: nedostupná → zakázaná (4:15)
  - 1062 Ming-Kuang Armor: nedostupná → dostupná (4:15) → zkoumá se (24:56) → vyzkoumaná (26:26)
  - 1331 Scale Alexander's Soldiers in Imperial Age: nedostupná → vyzkoumaná (4:15)
  - 39 Husbandry: dostupná → zkoumá se (12:10) → vyzkoumaná (13:05)
  - 68 Iron casting: dostupná → zkoumá se (14:20) → vyzkoumaná (16:00)
  - 75 Blast Furnace: nedostupná → dostupná (16:00) → zkoumá se (17:36) → vyzkoumaná (19:51)
  - 249 Hand Cart: dostupná → zkoumá se (19:46) → vyzkoumaná (21:01)
  - 1050 C-Bonus, Fre vill + Hand Cart: nedostupná → vyzkoumaná (21:01)
  - 93 Ballistics: dostupná → zkoumá se (23:06) → vyzkoumaná (24:26)
- **hráč 8**: vyzkoumaných 339, pohybů během hry 0

### Přidělené sekundární cíle

Proměnná 200 + slot scénáře = číslo proměnné-počitadla cíle (0 = žádný cíl, tedy Nástupce; prázdné = scénář bez označení cílů).

| slot | hráč ve hře | počitadlo cíle | stav počitadla |
|---|---|---|---|
| 1 | 7 Xun Yu | — |  |
| 2 | 2 Caupolican | — |  |
| 3 | 3 Yasovarman I | — |  |
| 4 | 4 Jan I Olbracht | — |  |
| 5 | 5 Zhu Zhi | — |  |
| 6 | 6 Vasco da Gama | — |  |
| 7 | 1 Jouki in Rage | — |  |
| 8 | 8 Trokner | — |  |

### Proměnné triggerů (nenulové)

| proměnná | první | poslední | změn |
|---|---|---|---|
| 0 | 15 | 15 | 0 |
| 1 | 15 | 15 | 0 |
| 2 | 15 | 15 | 0 |
| 3 | 15 | 15 | 0 |
| 4 | 15 | 15 | 0 |
| 5 | 15 | 15 | 0 |
| 6 | 15 | 15 | 0 |
| 7 | 1 | 1 | 0 |
| 15 | 0 | 4 | 4 |
| 16 | 0 | 5 | 5 |
| 18 | 0 | 3 | 3 |
| 19 | 0 | 6 | 6 |
| 20 | 0 | 7 | 7 |
| 21 | 0 | 4 | 4 |
| 29 | 0 | 6 | 6 |
| 30 | 0 | 7 | 7 |
| 31 | 0 | 4 | 4 |
| 32 | 0 | 8 | 8 |
| 33 | 0 | 5 | 5 |
| 34 | 0 | 9 | 9 |
| 35 | 0 | 1 | 1 |
| 36 | 1 | 2 | 1 |
| 37 | 1 | 2 | 1 |
| 38 | 1 | 2 | 1 |
| 39 | 1 | 2 | 1 |
| 40 | 1 | 2 | 1 |
| 41 | 1 | 2 | 1 |
| 42 | 1 | 1 | 0 |
| 50 | 0 | 1 | 1 |
| 51 | 0 | 2 | 2 |
| 52 | 0 | 2 | 2 |
| 53 | 0 | 1 | 1 |
| 54 | 0 | 2 | 2 |

### Diplomacie

Změn během hry: 0

### Jednotky s pozicí (poslední snímek)

- relikvie, hráč 0: [0, 6] 30 HP, [114, 32] 30 HP, [212, 96] 30 HP, [212, 96] 30 HP, [212, 96] 30 HP, [174, 202] 30 HP, [28, 70] 30 HP
- král, hráč 1: [2, 8] 999 HP, [20, 8] 16959 HP, [18, 8] 16959 HP, [16, 8] 16959 HP, [14, 8] 16959 HP, [12, 8] 16959 HP, [10, 8] 16959 HP
- mnich, hráč 1: [96, 105] 9999 HP
- král, hráč 2: [177, 13] 75 HP
- mnich s relikvií, hráč 2: [126, 114] 30 HP
- hrad, hráč 2: [177, 13] 4800 HP, [174, 28] 4800 HP
- klášter, hráč 2: [184, 42] 2100 HP
- centrum, hráč 2: [196, 9] 2400 HP, [194, 23] 2400 HP
- král, hráč 3: [30, 43] 75 HP
- mnich, hráč 3: [23, 64] 30 HP, [87, 61] 30 HP
- hrad, hráč 3: [30, 43] 4800 HP, [26, 60] 4800 HP
- klášter, hráč 3: [28, 70] 2100 HP
- centrum, hráč 3: [20, 53] 2400 HP, [40, 33] 2400 HP, [41, 21] 2400 HP, [51, 88] 2400 HP
- král, hráč 4: [197, 102] 75 HP
- mnich, hráč 4: [215, 92] 30 HP, [204, 86] 30 HP, [214, 92] 30 HP
- hrad, hráč 4: [197, 102] 4800 HP, [184, 97] 4800 HP
- klášter, hráč 4: [212, 96] 2100 HP
- centrum, hráč 4: [209, 113] 2400 HP, [201, 128] 2400 HP, [194, 80] 2400 HP, [173, 118] 2400 HP
- král, hráč 5: [199, 188] 75 HP
- mnich, hráč 5: [201, 196] 30 HP, [195, 194] 30 HP
- hrad, hráč 5: [199, 188] 4800 HP, [172, 189] 4800 HP
- klášter, hráč 5: [174, 202] 2100 HP
- centrum, hráč 5: [187, 209] 2400 HP, [174, 208] 2400 HP, [198, 217] 2400 HP, [156, 206] 2400 HP
- král, hráč 6: [104, 178] 75 HP
- mnich, hráč 6: [85, 204] 30 HP
- hrad, hráč 6: [104, 178] 4800 HP, [89, 196] 4800 HP
- klášter, hráč 6: [118, 180] 2100 HP
- centrum, hráč 6: [97, 194] 2400 HP, [98, 180] 2400 HP, [72, 178] 2400 HP, [58, 194] 2400 HP
- král, hráč 7: [98, 15] 75 HP
- mnich, hráč 7: [138, 16] 30 HP, [137, 17] 30 HP
- hrad, hráč 7: [98, 15] 4800 HP, [144, 15] 4800 HP
- klášter, hráč 7: [114, 32] 2100 HP
- centrum, hráč 7: [114, 14] 2400 HP, [94, 25] 2400 HP, [86, 38] 2400 HP, [107, 14] 2400 HP
- král, hráč 8: [22, 188] 75 HP
- hrad, hráč 8: [27, 171] 4800 HP
- klášter, hráč 8: [12, 154] 2100 HP
- centrum, hráč 8: [15, 199] 2400 HP

## 4. Statistiky ze záznamu téže hry

Vygenerováno `python nastroje/diplomacie/zaznam_statistiky.py <záznam>`
(jména jednotek a technologií podle číselníku AoE2ScenarioParseru — u nového
DLC mohou být vedle; „ručních za minutu“ u AI zahrnuje i rozkazy skriptu).

```
záznam VER 9.4 (uložení 68.9), hlavička 3635395 B → 27975989 B
lobby: "Jouki in Rage's Game" | scénář: LLC-supersonda.aoe2scenario | herní čas 34:14 | konec hry (POSTGAME)
  hráč 1: 'Jouki in Rage' — šedá, tým 1, civ 18, člověk, profil 15260548
  hráč 2: 'Caupolican' — červená, tým 1, civ 58, počítač (PromiDE)
  hráč 3: 'Yasovarman I' — zelená, tým 1, civ 28, počítač (PromiDE)
  hráč 4: 'Jan I Olbracht' — žlutá, tým 1, civ 38, počítač (PromiDE)
  hráč 5: 'Zhu Zhi' — tyrkysová, tým 1, civ 50, počítač (PromiDE)
  hráč 6: 'Vasco da Gama' — fialová, tým 1, civ 24, počítač (PromiDE)
  hráč 7: 'Xun Yu' — modrá, tým 1, civ 51, počítač (PromiDE)
  hráč 8: 'Trokner' — oranžová, tým 1, civ 10, člověk, profil 20087158

hráč 1: akcí 38, ručních za minutu 1.0, chat 2, rezignace v 2047 s
  akce: MOVE 18, DE_QUEUE 6, PATROL 6, GAME 2, SPECIAL 1, ORDER 1, DROP_RELIC 1, FLARE 1, DELETE 1, RESIGN 1
  výroba: XOLOTL_WARRIOR 5, TRADE_CART_EMPTY 1

hráč 2: akcí 6985, ručních za minutu 19.5, chat 28
  akce: GAME 3692, WORK 1948, AI_ORDER 410, UNGARRISON 380, DE_UNKNOWN_37 224, GATHER_POINT 126, STANCE 109, MAKE 27, BUILD 26, ORDER 20, DE_UNKNOWN_130 18, SELL 5
  výroba: VILLAGER_MALE 11, KONA 10, ARCHER 2, PETARD 1, MANGONEL 1, CHAMPI_SCOUT 1, MONK 1
  stavby: FARM 7, DOCK 5, SETTLEMENT 4, ARCHERY_RANGE 4, BARRACKS 2, SIEGE_WORKSHOP 2, TOWN_CENTER 1, CASTLE 1
  trh: prodej dřevo 500

hráč 3: akcí 6615, ručních za minutu 19.2, chat 16
  akce: GAME 3692, WORK 1750, UNGARRISON 398, AI_ORDER 253, DE_UNKNOWN_37 233, GATHER_POINT 132, STANCE 94, BUILD 25, MAKE 21, ORDER 9, DE_UNKNOWN_138 6, DE_UNKNOWN_130 2
  výroba: VILLAGER_MALE 10, SCORPION 6, MONK 2, BATTLE_ELEPHANT 2, PETARD 1
  stavby: SIEGE_WORKSHOP 6, ARCHERY_RANGE 4, TOWN_CENTER 3, MINING_CAMP 3, STABLE 2, BARRACKS 2, LUMBER_CAMP 1, CASTLE 1, MILL 1, UNIVERSITY 1, FARM 1

hráč 4: akcí 6479, ručních za minutu 20.4, chat 13
  akce: GAME 3689, WORK 1421, UNGARRISON 392, AI_ORDER 386, DE_UNKNOWN_37 238, GATHER_POINT 130, STANCE 109, ORDER 49, MAKE 27, BUILD 17, DE_UNKNOWN_130 12, DE_UNKNOWN_138 6
  výroba: VILLAGER_MALE 12, OBUCH 11, MONK 3, PETARD 1
  stavby: TOWN_CENTER 3, ARCHERY_RANGE 3, SIEGE_WORKSHOP 3, FARM 3, BARRACKS 2, UNIVERSITY 1, STABLE 1, CASTLE 1
  trh: nákup kámen 300

hráč 5: akcí 6602, ručních za minutu 19.2, chat 18
  akce: GAME 3690, WORK 1558, AI_ORDER 401, UNGARRISON 389, DE_UNKNOWN_37 233, GATHER_POINT 129, STANCE 104, MAKE 29, BUILD 25, DE_UNKNOWN_138 18, DE_UNKNOWN_130 15, ORDER 10
  výroba: VILLAGER_MALE 11, MILITIA 5, FIRE_ARCHER 5, MANGONEL 2, MONK 2, SCOUT_CAVALRY 2, PETARD 1, HEI_GUANG_CAVALRY 1
  stavby: FARM 5, MINING_CAMP 4, TOWN_CENTER 3, STABLE 3, ARCHERY_RANGE 3, SIEGE_WORKSHOP 3, BARRACKS 2, LUMBER_CAMP 1, CASTLE 1
  trh: prodej jídlo 100

hráč 6: akcí 6939, ručních za minutu 19.0, chat 16
  akce: GAME 3690, WORK 1890, UNGARRISON 386, AI_ORDER 372, DE_UNKNOWN_37 279, GATHER_POINT 128, STANCE 110, MAKE 27, BUILD 21, DE_UNKNOWN_138 18, DE_UNKNOWN_130 12, ORDER 4
  výroba: ORGAN_GUN 13, VILLAGER_MALE 12, PETARD 1, MONK 1
  stavby: ARCHERY_RANGE 4, TOWN_CENTER 3, MINING_CAMP 3, SIEGE_WORKSHOP 3, BARRACKS 2, FARM 2, UNIVERSITY 1, STABLE 1, CASTLE 1, LUMBER_CAMP 1

hráč 7: akcí 6841, ručních za minutu 20.2, chat 5
  akce: GAME 3691, WORK 1647, AI_ORDER 528, UNGARRISON 395, DE_UNKNOWN_37 246, GATHER_POINT 131, STANCE 105, BUILD 34, ORDER 25, MAKE 24, DE_UNKNOWN_130 6, DE_UNKNOWN_138 6
  výroba: VILLAGER_MALE 9, TIGER_CAVALRY 7, HEI_GUANG_CAVALRY 3, MONK 2, PETARD 1, MANGONEL 1, 1954 1
  stavby: FARM 11, ARCHERY_RANGE 4, TOWN_CENTER 3, HOUSE 3, MINING_CAMP 3, STABLE 2, LUMBER_CAMP 2, BARRACKS 2, SIEGE_WORKSHOP 2, DOCK 1, CASTLE 1
  trh: prodej dřevo 200

hráč 8: akcí 5, ručních za minutu 0.0, chat 0
  akce: DE_TRANSFORM 3, GAME 2
```
