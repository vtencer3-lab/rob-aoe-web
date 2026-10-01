# Mód Diplomacie: základ a rozdání rolí (podprojekty 0 a 1)

Návrh z 1. 10. 2026. Výchozí stav: `main` i `dev` 1.13.10, větev `diplo`
založená z `dev`. Odsouhlaseno s uživatelem po částech během brainstormingu
téhož dne.

## 1. Zadání

Jin (autor scénáře) připravuje pro komunitní večery custom scénář
**Diplomacie – Ať žije císař** (`LLC.aoe2scenario`): 7 hráčů a 1 GameMaster,
skryté role, rada králů, relikvie. Dnes si GM po startu hry role losuje
v Jinově samostatném nástroji (Google Apps Script, kód v `diplo.txt`)
a pak obchází hráče ve voice roomkách a tajně jim role říká.

Cíl celého módu: **web se stane jediným místem, kde se Diplomacie připraví,
odehraje a vyhodnotí** — od lobby přes tajné role až po odhalení. Tenhle spec
pokrývá první dva podprojekty: nasazení větve a základ módu s rozdáním rolí.

Podklady (mimo repo, u uživatele v `Downloads`):

| podklad | co v něm je |
|---|---|
| `Diplo scénář.docx` | pravidla: role, cíle, výhody, nevýhody, rada králů, eventy GM |
| `diplo.txt` | Jinův nástroj na rozdělení rolí (HTML + JS) — logika losu a úprav, kterou web přebírá |
| `LLC.aoe2scenario_output.aoe2scenario` | samotný scénář (DE 1.59, 334 triggerů) |

### 1.1 Rozhodnutí z brainstormingu

1. **Hráči dostanou roli na tajné kartě na webu**, GM nemusí obcházet roomky.
2. **GM je hráč na šedé barvě (7)** — stejně jako ve scénáři — a práva GM má
   jen pro ten zápas, i když není admin.
3. **Admin, který není GM, role nevidí.** Rob streamuje; vědomá výjimka
   z pravidla „admin vidí všechno“.
4. **Architektura: modul módu s několika háčky v jádru** (varianta A).
   Diplomacie se dá vypnout, vyjmout a vyvíjet nezávisle; jádro se mění jen
   v háčcích.
5. **Vývoj ve větvi `diplo`**, nasazené na `/aoe/diplo`; po odladění merge
   do `dev`, kde mód poběží pod přepínačem.
6. **Scénář je součástí webu**: kontrola lobby hlídá soubor scénáře, web ho
   rozdává ke stažení, ukazuje jeho minimapu a pravidla čte přímo z něj.
7. **Plnohodnotná grafika** (znaky rolí, minimapa) přes lokální modely
   a Codex, žádné ruční kreslení.
8. **Karta role i pult GM jsou ve výchozím stavu zakryté**; kliknutí odkryje,
   další zakryje, po obnovení stránky jsou zase zakryté.
9. V hovorech (podprojekt 4) hráči uvidí ikonu „GM poslouchá“.

### 1.2 Rozdělení na podprojekty

| # | podprojekt | stav |
|---|---|---|
| **0** | větev `diplo`, nasazení `/aoe/diplo` | **tento spec** |
| **1** | základ módu, scénář, rozdání rolí, tajné karty, pult GM | **tento spec** |
| 2 | deník GM: smrti a rezignace s důsledky podle pravidel, fronta žádostí na GM (Šaškovy 3 informace, sankce Nájezdníků, Žoldákův prodej relikvie), vyhodnocení vítězů a odhalení rolí | vlastní spec později |
| 3 | Rada králů: svolání, návrh sankce, hlasování, schválení GM, odpočty v herních minutách | vlastní spec později |
| 4 | hlas: soukromé hovory 1:1, GM vidí kdo s kým mluví a může poslouchat (ikona „GM poslouchá“); předběžně LiveKit na VPS | vlastní spec později |

Zapsané, ale odložené nápady (`docs/prehled-praci-a-zameru.md` §5):

- **Scénář na míru zápasu** — web by vkládal role do triggerů a Nástupci
  rovnou dával relikvie.
- **Most ke hře** — XS skript ve scénáři zapisuje stav do souboru, program
  na počítači GM ho posílá webu (Nástupce, smrti, relikvie automaticky).
  Uživatel probere přidání skriptu s Jinem.

Podprojekt 1 je navržený tak, aby na mostu nezávisel: ruční výběr Nástupce
zůstane i potom jako záloha.

## 2. Co je ověřené

### 2.1 Scénář (rozebrán AoE2ScenarioParser 0.9.2, 1. 10. 2026)

- Mapa 220×220, 8 hráčů. **Hráč 7 se jmenuje „GM“**: 99 999 všech surovin,
  Spies, Barracks a Missionary schované v rohu mapy.
- Ostatní hráči: 2000 jídla, dřeva a zlata, 1000 kamene, populace 200.
- **Číslo hráče = barva, stejně jako na webu.** Hlášky scénáře to potvrzují
  („MODRY ma 7 relikvii“ u p1 …):

  | p1 | p2 | p3 | p4 | p5 | p6 | p7 | p8 |
  |---|---|---|---|---|---|---|---|
  | modrý | červený | zelený | žlutý | tyrkysový | fialový | šedý = GM | oranžový |

- **Sekundární cíle losuje hra**, triggery `-- set pN win condition --`:
  - Každý ze 6 cílů má u každého hráče trigger s podmínkou Chance 13 %.
  - Jakmile se trefí, pošle hráči „TVUJ SEKUNDARNI CIL JE: …“, GM (p7)
    „pN ma: …“ a vypne ostatní varianty u hráče i tentýž cíl u ostatních.
  - Cíle: zabij 650 jednotek, zbourej 150 budov, ztrať 900 jednotek,
    postav 15 hradů, prodej 5 relikvií, zkonvertuj 99 jednotek.
  - Kdo cíl nedostane, je **Nástupce císaře**. Web Nástupce nelosuje, GM ho
    odklikne podle chatu hry.
- Eventy (mor, sankce, ruční relikvie) spouští GM ve hře přesunem jednotky
  do zóny. Web do hry nesahá.

### 2.2 Seznam lobby hlásí soubor scénáře (živá sonda 1. 10. 2026)

`findAdvertisements`: z 55 lobby bylo 10 v režimu Scenario (`options[5] = 3`)
a **všechny měly v `options[38]` jméno souboru scénáře**, např.
`CBA_=REQUIEM=_V292.aoe2scenario`. Pole `mapname` je u všech „my map“
a nic nenese. `options[10]` (mapa) má u scénářů libovolnou hodnotu — je to
zbytek z nastavení před přepnutím na scénář. Web dnes `options[38]` nečte.

### 2.3 Microsoft přihlášení pro `/aoe/diplo`

Uživatel 1. 10. 2026 přidal návratovou adresu
`https://jouki.cz/aoe/diplo/api/auth/microsoft/return` do registrace
`AoE 2 komunitky`. Sonda bez přihlášení: diplo vrátí přihlašovací stránku
(34 kB) stejně jako dev, nezapsaná adresa chybovou (3 kB).

### 2.4 Co ověřené není

- Jak se soubor scénáře jmenuje u hosta, když si ho stáhne z webu a lobby
  založí. Předpoklad: `options[38]` = jméno souboru bez cesty. Ověří první
  zkouška na `/aoe/diplo`.
- Jestli po nasazení scénáře na Steam Workshop/mods.ageofempires.com hra
  hlásí jméno jinak. Mimo rozsah, scénář se rozdává souborem.

## 3. Podprojekt 0: větev a nasazení

Postup jako u `experimental` (`docs/nasazeni-jouki-cz.md` §1.1, §3):

| co | hodnota |
|---|---|
| větev | `diplo`, založená z `dev` |
| Coolify aplikace | `aoe-web-diplo` |
| adresa | `https://jouki.cz/aoe/diplo` |
| databáze | `rob_aoe_diplo` (zakládá `POSTGRES_USER` v kontejneru, role `rob_aoe`) |
| cookie | `sid_aoe_diplo` — odvodí se z cesty sama |
| `BASE_URL`, `BASE_PATH` | `https://jouki.cz/aoe/diplo`, `/aoe/diplo/` |
| `ADMIN_STEAM_ID` | stejný seznam jako dev |
| `STEAM_API_KEY` | zkopírovat z dev |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | zkopírovat z dev (táž registrace, adresa ověřená, §2.3) |
| `ZKUSEBNI_HRACI` | `true` |
| hlídač | dvojice `diplo:<uuid>` do `/root/aoe-deploy/watch.sh` |
| GitHub Action | větev a UUID do `.github/workflows/deploy.yml` |

**Verze** podle §2.1 nasazovací dokumentace: první commit ve větvi spustí
`npm run verze -- experiment` → **`1.13.10-13.10`**. Dál `npm run verze`
(patch) a `npm run verze -- minor`. Při mergi do `dev` se verze pokusu předá
ručně (`npm run verze -- z-experimentu <verze-diplo>`), protože bez
argumentu skript čte větev `experimental`.

**Přenášení z devu:** `dev` se do `diplo` merguje pravidelně (po každém
releasu nebo větší změně). Konflikt ve verzi se řeší ve prospěch diplo
a `npm run verze -- experiment` přezaloží základ.

Dokumentace: `docs/nasazeni-jouki-cz.md` dostane sloupec „diplo“ v tabulce
§3.6 a řádek v §1; CLAUDE.md jednu větu u větví.

## 4. Architektura

### 4.1 Háčky v jádru (jediné změny stávajícího kódu)

| # | kde | co |
|---|---|---|
| H1 | migrace `030_rezim_akce.sql` | `akce.rezim TEXT NOT NULL DEFAULT 'klasicky' CHECK (rezim IN ('klasicky','diplomacie'))` |
| H2 | `src/db/events.ts` (`createAkce`, `SLOUPCE_AKCE`, `AkceRow`), `src/http/routes/events.ts` (`POST /api/akce`) | přijme a uloží `rezim`; neznámá hodnota → 400 |
| H3 | `src/rezimy/index.ts` (nové) | seznam módů a rozhraní `RezimAkce` (§4.2); `klasicky` je prázdná implementace |
| H4 | `createAkce` | výchozí nastavení lobby z módu |
| H5 | `zkontrolujSestavu` (`src/shared/sestava.ts`) / `prectiSestavu` | po kontrole jádra ještě kontrola módu |
| H6 | `createZapas` (`src/db/matches.ts`) | v téže transakci `rezim.poVytvoreniZapasu(tx, zapas)` |
| H7 | `buildAkceStav` (`src/realtime/akceStav.ts`) a `redigujProDivaka` (`src/realtime/redakce.ts`) | mód přidá svou větev stavu a sám ji zredukuje podle diváka |
| H8 | `web/src/views/SpravaAkce.tsx` (`ZalozeniAkce`) | přepínač **Diplomacie** vedle „Název akce“ (`Prepinac.tsx`) |
| H9 | `KartaHrace.tsx`, `ObrazovkaHosta.tsx`, `VerejnyZapas.tsx`, `Skladani.tsx` | místo pro vloženou komponentu (prop typu `ReactNode`, jako dnes `chat`); `App.tsx` je vyplní podle `akce.rezim` z klientského seznamu módů `web/src/rezimy/index.ts` |
| H10 | `src/http/server.ts` | `registerDiplomacieRoutes(app)` |

**Obecné rozšíření jádra (ne jen pro diplo):** kontrola lobby se naučí
scénáře:

- `nastaveniZOptions` čte `options[38]` jako `scenar: string | null`.
- `NastaveniLobby` dostane `scenar: string | null` (null = je to jedno).
- `zkontrolujLobby` přidá řádek „Scénář“ do hlavní sekce, jen když je
  očekávaný režim Scenario.
- `prectiNastaveniLobby` klíč propustí.
- U režimu Scenario se řádek „Mapa“ nekontroluje (§2.2: `options[10]` je
  u scénářů zbytek).

Je to malé a užitečné i pro jiné scénářové večery, proto to jde do jádra,
ne do módu.

Kdo chce mód vyjmout: smaže `src/diplomacie/`, `src/shared/diplomacie/`,
`web/src/diplomacie/`, `web/public/diplomacie/`, řádek v obou seznamech
módů a registraci rout. Sloupec `akce.rezim` a háčky zůstanou neutrální.

### 4.2 Rozhraní módu

```ts
// src/rezimy/index.ts (backend)
export interface RezimAkce {
  id: "klasicky" | "diplomacie";
  vychoziNastaveniLobby(zaklad: NastaveniLobby): NastaveniLobby;
  // chybová věta, nebo null; zapasId je vyplněné při úpravě sestavy existujícího
  // zápasu (PUT /api/zapas/:id/sestava), při vytváření nového chybí
  zkontrolujSestavu(sestava: SestavaVstup[], zapasId?: number): Promise<string | null>;
  poVytvoreniZapasu(tx: Tx, zapas: { id: number; ucastnici: Seat[] }): Promise<void>;
  doplnStav(akce: AkceRow, zapasy: ZapasView[]): Promise<Record<string, unknown> | undefined>;
  rediguj(cast: unknown, divak: Divak): unknown;
}
```

Na klientovi `web/src/rezimy/index.ts` mapuje `rezim` na komponenty pro
místa H9. U `klasicky` vracejí `null`.

Stav pro prohlížeče dostane volitelnou větev `rezim?: { id, data }` vedle
`akce`, `prihlaseni`, `zapasy`. **`redigujProDivaka` volá `rezim.rediguj`
vždy**, i u admina: jádro nemá v tajných datech diplomacie žádnou výjimku.

### 4.3 Modul Diplomacie

```
src/shared/diplomacie/
  scenar.ts        VYGENEROVÁNO nástrojem (§5.1): cíle, čísla, limity, sloty, jméno souboru
  role.ts          role, texty z pravidel (cíl, výhody, nevýhody), složení 1+1+2+1+1+1
  los.ts           čisté funkce: los rolí a cílů, kontrola složení, povolené cíle
  viditelnost.ts   čistá funkce: co smí divák vidět
  typy.ts          DiploStav, DiploView, RoleHrace
src/diplomacie/
  db.ts            dotazy nad diplo_*
  rezim.ts         implementace RezimAkce
  routes.ts        /api/diplo/... (§6.3)
web/src/diplomacie/
  PultGm.tsx, KartaRole.tsx, Zakryti.tsx, PravidlaHry.tsx, MapaScenare.tsx,
  VerejnyRadek.tsx, SkladaniDiplo.tsx
web/public/diplomacie/
  <soubor scénáře>, minimapa*.webp, znaky rolí
nastroje/diplomacie/
  scenar.py        scénář → src/shared/diplomacie/scenar.ts
  minimapa.py      scénář → minimapa a souřadnice startů
```

### 4.4 Data

```sql
-- 031_diplomacie.sql
CREATE TABLE diplo_zapas (
  zapas_id    INTEGER PRIMARY KEY REFERENCES zapas(id) ON DELETE CASCADE,
  gm_hrac_id  TEXT NOT NULL REFERENCES player(hrac_id),
  stav        TEXT NOT NULL DEFAULT 'priprava'
              CHECK (stav IN ('priprava','losovano','rozeslano')),
  nastupce_hrac_id TEXT REFERENCES player(hrac_id),
  rozeslano_v TIMESTAMPTZ,
  upraveno_v  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE diplo_role (
  zapas_id   INTEGER NOT NULL REFERENCES diplo_zapas(zapas_id) ON DELETE CASCADE,
  hrac_id    TEXT NOT NULL REFERENCES player(hrac_id),
  role       TEXT NOT NULL CHECK (role IN ('nastupce','garda','najezdnik','sasek','zoldak','kat')),
  cil_hrac_id TEXT REFERENCES player(hrac_id),  -- oběť Kata / pakt Žoldáka
  puvodni_role TEXT,                            -- pro „Šašek → Garda“ (podprojekt 2)
  upraveno_po_rozeslani BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (zapas_id, hrac_id)
);
```

Klíč hráče je `player.hrac_id` (přejmenováno migrací 027). Zrušení nebo smazání zápasu smaže diplo data kaskádou.

## 5. Scénář jako součást webu

### 5.1 Pravidla čtená ze scénáře

`nastroje/diplomacie/scenar.py` (Python, AoE2ScenarioParser ≥ 0.9.2) přečte
scénář a vygeneruje `src/shared/diplomacie/scenar.ts`:

- jméno souboru, pod kterým ho web rozdává, a jeho SHA-256,
- 8 slotů: číslo → barva, který je GM (jméno hráče „GM“ ve scénáři),
- sekundární cíle: text, cílové číslo (z podmínek triggerů, ne opsané),
- výchozí suroviny, populace, limity jednotek (vesničané, rybářské lodě,
  obchodní vozy — z triggerů „omezeni …“),
- startovní pozice každé barvy (těžiště jejích budov) pro minimapu.

Hlavička souboru: „vygenerováno z <soubor> <SHA> dne …, needitovat“.
Texty rolí (výhody, nevýhody) ve scénáři nejsou — ty jsou v `role.ts` podle
pravidel. Kde čísla z pravidel ve scénáři jsou (650, 99, 900, 150, 15, 5,
limity), `role.ts` je bere ze `scenar.ts`.

Při nové verzi scénáře: nahradit soubor, spustit nástroj, commit. Test
zkontroluje, že SHA v `scenar.ts` sedí na soubor v `web/public/diplomacie/`.

### 5.2 Soubor ke stažení

- Soubor leží ve `web/public/diplomacie/`, Vite ho servíruje pod
  `<BASE_PATH>diplomacie/…`.
- Návrh jména: `Diplomacie LLC.aoe2scenario`. Případná verze ze scénáře půjde
  do jména, aby kontrola lobby poznala starou kopii.
- **Jin 1. 10. 2026 souhlasil se zveřejněním** (repo je veřejné), takže soubor
  jde do repa normálně, bez šifrování.
- Host v kroku „Zakládáš!“ dostane tlačítko **Stáhnout scénář** a návod:
  - kam soubor uložit: `%USERPROFILE%\Games\Age of Empires 2 DE\<ID>\resources\_common\scenario\`,
    kde `<ID>` je Steam ID nebo Xbox XUID (ověřeno na autorově stroji 1. 10. 2026:
    složky `76561198014056480` a `2533274952064423`). Web obě ID přihlášeného
    hráče zná (`hrac_id`, resp. `xbox:<xuid>`), takže ukáže **cestu přímo pro
    něj** s tlačítkem na zkopírování,
  - že v Create Lobby zvolí Game Mode Scenario a tento scénář.
- Ostatní hráči ho dostanou přenosem v lobby, stahovat nemusí.

### 5.3 Minimapa

`nastroje/diplomacie/minimapa.py` vykreslí z terénu scénáře (220×220)
minimapu v barvách herní minimapy. Barvy terénů se vezmou z dat hry, žádný
ruční odhad. Natočení jako ve hře (kosočtverec), výstup webp:

- **čistá** pro nastavení lobby,
- **velká se starty všech barev** pro pult GM,
- souřadnice startů v `scenar.ts` — karta hráče zvýrazní jen jeho pozici
  překryvem v CSS/SVG, takže stačí jeden obrázek.

Grafickou úpravu (rám, popisky, styl) dělá §8 nástroji, ne ručně.

### 5.4 Kontrola lobby

Mód nastaví `nastaveniLobby.scenar` na jméno souboru ze `scenar.ts`
a `rezim` na 3 (Scenario). Řádek „Scénář“ v kontrole lobby:

| stav | ikona |
|---|---|
| shoda | zelená fajfka |
| jiný soubor | červený křížek a věta „V lobby je X, má být Y“ |
| `options[38]` chybí | červený křížek |

## 6. Průběh

### 6.1 Od založení po los

1. **Založení akce.**
   - Admin zapne přepínač **Diplomacie** a založí akci (`rezim = 'diplomacie'`).
   - Výchozí nastavení lobby z módu: Game Mode Scenario, scénář ze `scenar.ts`,
     mapa a velikost „je to jedno“, populace 200, Lock Teams vypnuto,
     Shared Exploration vypnuto, cheaty vypnuto, diváci povoleni. Zbytek jako
     dnes. Admin může cokoli změnit v panelu.
   - V záhlaví akce je u názvu štítek „Diplomacie“.
2. **Skládání.**
   - Editor jádra beze změny. `SkladaniDiplo` přidá popisek slotu „GM“ u šedé
     a nápovědu.
   - Kontrola módu (H5):
     - přesně 8 lidí, žádná AI,
     - 8 různých barev, takže i šedá je obsazená,
     - všichni tým „–“,
     - civilizace nepředepsané.
   - Chybová věta říká konkrétně, co chybí („Na šedé musí být GM“).
3. **Zápas vznikne.**
   - `poVytvoreniZapasu` založí `diplo_zapas` s GM = hráč na šedé, stav
     `priprava`.
   - Host, kontrola lobby a připojení běží jako dnes, navíc s řádkem
     „Scénář“ a tlačítkem stažení u hosta.
4. **Výběr Nástupce (GM).** Po startu hry scénář rozdá sekundární cíle a GM
   v pultu klikne na dlaždici hráče, který cíl nedostal. Dlaždice jsou
   v barvách, se jménem a „pN“ — přímý překlad hlášky „pN ma: …“.
5. **Los (`POST …/los`).** Server zamíchá Šaška, Gardu, 2× Nájezdníka, Žoldáka
   a Kata mezi 6 zbylých hráčů a vylosuje:
   - **oběť Kata**: kdokoli kromě Kata a Nástupce,
   - **pakt Žoldáka**: kdokoli kromě Žoldáka a Nástupce.

   Náhoda z `node:crypto` (`randomInt`), Fisher–Yates. Stav `losovano`.

### 6.2 Úpravy a rozeslání

- **Úpravy GM** jako v Jinově nástroji:
  - Roletka role u každého hráče kromě Nástupce.
  - Roletka cíle u Kata a Žoldáka nabízí jen povolené hráče.
  - Změna role na Kata nebo Žoldáka přidělí platný cíl (zachová starý, je-li
    platný). Změna na jinou roli cíl smaže. Obojí je převzaté chování
    `assignValidTarget`.
- **Složení se kontroluje, ale neblokuje.** Odchylka od 1+1+2+1+1+1 se ukáže
  žlutě („3× Nájezdník, chybí Kat“) a GM může rozeslat i tak.
- **Tlačítka:**
  - **Přelosovat**: nový los, Nástupce zůstává,
  - **Zpět na výběr Nástupce**: smaže role, stav `priprava`; pro restart hry,
    když scénář cíle nerozdal,
  - **Rozeslat role**: stav `rozeslano`, `rozeslano_v`.
- **Po rozeslání** jde roli upravit dál, ale každou změnu musí GM potvrdit
  dialogem. Dotčenému hráči se nastaví `upraveno_po_rozeslani` a na kartě
  uvidí „GM upravil tvou roli“.
- **Zkopírovat přehled:** textový výpis ve formátu Jinova nástroje
  (`getFullText`), třeba pro Discord.

### 6.3 API

Všechno pod `/api/diplo/zapas/:id/…`, ochrana `requireGm`: přihlášený hráč
je `diplo_zapas.gm_hrac_id`. Admin, který není GM, dostane 403.

| metoda a cesta | stav před | co dělá |
|---|---|---|
| `POST nastupce` `{hracId}` | `priprava` | uloží Nástupce |
| `POST los` | `priprava`/`losovano` | los (nebo přelos), → `losovano` |
| `PUT role/:hracId` `{role, cilHracId?}` | `losovano`/`rozeslano` | úprava; v `rozeslano` vyžaduje `{potvrzeno: true}` |
| `POST rozeslat` | `losovano` | → `rozeslano` |
| `POST zpet` | `losovano`/`rozeslano` | smaže role, → `priprava` (v `rozeslano` s potvrzením) |

Po každé změně `broadcastAkce()`, jako jinde.

**Změna sestavy po losu** (`PUT /api/zapas/:id/sestava`): když diplo zápas
není v `priprava`, změna sestavy vrátí 409 „Role už jsou rozdané — nejdřív
Zpět na výběr Nástupce“. Jinak by role visely na lidech mimo zápas. Do jádra
to přijde háčkem `zkontrolujSestavu` s kontextem zápasu, ne podmínkou
v routě.

## 7. Viditelnost

Čistá funkce `viditelnost.ts`, volaná z `rezim.rediguj`:

| divák | vidí |
|---|---|
| GM zápasu | všechno: role, cíle, stav |
| hráč zápasu, stav `priprava`/`losovano` | jen stav („čeká se“) |
| hráč zápasu, `rozeslano` | svou roli; Kat svou oběť, Žoldák svůj pakt, Nájezdník druhého Nájezdníka; všichni jméno Nástupce; vlastní příznak „upraveno“ |
| kdokoli jiný, včetně admina a diváka | stav a po rozeslání jméno Nástupce |

Tajná data jsou **jen** ve větvi `rezim.data` a nikde jinde: žádné tajné
pole v `zapasy[].ucastnici`, žádné texty rolí v chatu ani v toastech.

## 8. Rozhraní a grafika

### 8.1 Pult GM

Vkládá se do obrazovky hráče na šedé (KartaHrace / ObrazovkaHosta, místo H9):

- Zakrytí (`Zakryti.tsx`, sdílené s kartou): ve výchozím stavu zakrytý,
  kliknutí střídá odkryto a zakryto, stav jen v paměti komponenty.
- Záhlaví se stavem a velkou minimapou se starty a jmény.
- Výběr Nástupce: 7 dlaždic.
- Tabulka rolí s roletkami, souhrn složení, tlačítka z §6.2.
- Zkopírovat přehled. Pravidla jako rozbalovací tahák.

### 8.2 Karta role hráče

Pod kontrolou lobby v KartaHrace / ObrazovkaHosta:

- **Před rozesláním:** „Role se rozdají po startu hry, až GM potvrdí Nástupce.“
- **Rozeslání:**
  - Přechod do `rozeslano` přehraje zvon. Použije se stávající `web/src/zvuk.ts`
    (`prehraj`), žádný nový přehrávač.
  - Karta je zakrytá: „Tvá tajná role — klikni pro odkrytí“.
- **Po odkrytí:**
  - znak a název role, cíl, výhody, nevýhody,
  - tajné údaje (oběť, pakt, druhý Nájezdník),
  - minimapa se zvýrazněnou vlastní startovní pozicí.
- **Pod kartou** (vidí všichni v zápase): „Nástupcem císaře je X“ a rozbalovací
  **Pravidla hry** (`PravidlaHry.tsx`, obsah z `role.ts` a `scenar.ts`).

Mimo zápas (`VerejnyZapas`, historie): „Diplomacie · Nástupce: X“.

### 8.3 Grafika

Podle `docs/grafika.md`, žádné ruční kreslení ani úpravy:

- **7 znaků:**

  | role | znak |
  |---|---|
  | Nástupce | koruna |
  | Garda | štít |
  | Nájezdník | pochodeň |
  | Šašek | rolnička |
  | Žoldák | meč a měšec |
  | Kat | sekera |
  | GM | žezlo a oko |

  Ve stylu heraldiky webu, generuje lokální ComfyUI, doladí Codex
  (GPT Image).
- **Zadní strana zakryté karty** (pečeť).
- **Rám minimapy** v duchu herního rozhraní.
- Paleta jen z `:root`, žádná barva napevno.
- Než budou obrázky hotové, karta funguje s textem. Grafika je samostatný
  krok plánu, ne podmínka funkčnosti.

## 9. Chybové a okrajové stavy

| situace | chování |
|---|---|
| zápas zrušen nebo smazán | diplo data kaskádou pryč |
| akce ukončena | jako dnes (`smazAkciBezVysledku`); diplo zápas bez výsledku zmizí s ní |
| víc zápasů Diplomacie za večer | každý zápas má vlastní `diplo_zapas` |
| GM se odhlásí z akce / odejde | pult nikdo jiný nemá; admin vymění GM změnou sestavy, jde jen v `priprava` (jinak „Zpět na výběr Nástupce“) |
| scénář nerozdal cíl všem (restart hry) | GM „Zpět na výběr Nástupce“ |
| klasická akce | stav bez větve `rezim`, žádné diplo routy nedávají smysl (404 pro zápas mimo Diplomacii) |

## 10. Testy

- **Hermetické** (`src/shared/diplomacie/*.test.ts`):
  - los: složení vždy 1+1+2+1+1+1, Nástupce zůstává, Kat ani Žoldák nemají
    cíl sebe ani Nástupce, 1000 losů pokryje každou roli u každého hráče,
  - úpravy: převzaté chování `assignValidTarget`, varování složení,
  - mapování pN → barva → hráč,
  - `scenar.ts`: SHA sedí na soubor ve `web/public/diplomacie/`.
- **Viditelnost, hlavní sada:** pro každou roli, GM, admina-ne-GM,
  nezúčastněného a nepřihlášeného ve všech třech stavech přesný tvar dat.
  Snímek celé zredigované větve, ne jen jednotlivé klíče, aby nové pole
  neprošlo bez povšimnutí.
- **Kontrola lobby:**
  - fixtura scénářové lobby z živé sondy 1. 10. 2026 (`options[38]`),
  - shoda, jiný soubor, chybějící klíč,
  - u Scenario se mapa nekontroluje.
- **Databázové** (`*.db.test.ts`):
  - jen GM smí `nastupce/los/role/rozeslat/zpet` (admin-ne-GM 403, hráč 403),
  - přechody stavů,
  - změna sestavy po losu → 409,
  - kaskády,
  - `POST /api/akce` s `rezim`,
  - **celá dnešní sada beze změny projde** (klasický mód).
- **Frontend:**
  - zakrytí (výchozí zakryto, klik střídá, nový mount zakrytý),
  - pult: Nástupce → los → úprava → rozeslání,
  - přepínač Diplomacie,
  - karta pro každou roli,
  - zvon při přechodu do `rozeslano`.
- **Živě na `/aoe/diplo`:**
  - zkušební hráči doplní 8 slotů,
  - karty očima jednotlivých hráčů se ověří lokálně přes zkušební dveře
    (`DEV_PRISTUP`, na https zavřené záměrně),
  - ostrá zkouška s Jinem.

## 11. Mimo rozsah tohoto specu

- Smrti, rezignace a důsledky, žádosti na GM, vyhodnocení a odhalení rolí
  všem (podprojekt 2).
- Rada králů (3), hlas (4).
- Most ke hře a scénář na míru (zapsané nápady).
- Sledování sekundárních cílů hráčů na webu (hráč je vidí ve hře; pro
  vyhodnocení je zadá GM v podprojektu 2).
