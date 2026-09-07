# Pro přispěvatele

Tenhle soubor je psaný pro člověka, který repo vidí poprvé, **i pro jeho
agenta**. Tvrzení v něm jsou schválně ověřitelná: kde píšu číslo nebo cestu,
dá se to spustit a porovnat.

Co kde hledat:

| soubor | k čemu je |
|---|---|
| `README.md` | jak se web používá a jak probíhá večer |
| `CLAUDE.md` | konvence, příkazy a zvyky autora (obsahuje jeho lokální cesty) |
| **tenhle soubor** | jak to rozjet na cizím stroji, jak je to uvnitř poskládané a o co se nezakopnout |
| `docs/nasazeni-jouki-cz.md` | **jak se pracuje: větev `dev`, verze, release do `main`, automatické nasazení na jouki.cz** |
| `docs/analyza-projektu.md` | technická analýza: architektura, datový model, API, rizika |
| `docs/analyza-automaticke-hledani-lobby.md` | seznam lobby ze hry (Worlds Edge): jak se hledá lobby, **§6 tabulka klíčů nastavení lobby a slotů** |
| `docs/nasazeni-u-roba.md` | alternativní nasazení na Robův vlastní stroj |

## Nejkratší možné shrnutí, jak se tu pracuje

1. Větev **`dev`**. Do `main` se nikdy necommituje přímo.
2. Změna → testy → **`npm run verze`** (patch; `-- minor` u nové funkce nebo
   migrace) **v tomtéž commitu** → commit anglicky → `git push origin dev`.
3. Za dvě až tři minuty ověřit `curl -s https://jouki.cz/aoe/dev/api/health`,
   že vrací verzi, kterou jsi právě pushnul.
4. Release do `main` (= ostrá adresa) **jen když to někdo výslovně řekne**:
   PR `dev → main`, merge, ověřit `https://jouki.cz/aoe/api/health`.
5. Do repa nikdy nepatří přihlašovací údaje ani klíče. Repo je veřejné.

Detaily v `docs/nasazeni-jouki-cz.md`; kontrolní seznam před pushem je níž
v „Jak se tu ověřuje práce“.
| `docs/superpowers/specs`, `docs/superpowers/plans` | proč to vzniklo takhle |

## Na čem celý produkt stojí

Age of Empires II DE umí dvě URI a **liší se jedinou číslicí**:

```
aoe2de://0/<id>   připojí do lobby jako hráče
aoe2de://1/<id>   připojí do téže lobby jako diváka
```

Web proto ukládá **jenom to číslo** (`zapas.lobby_id`, textový sloupec) a obě
URI z něj odvozuje až při čtení — `src/aoe/lobbyUri.ts`. Host jednou vloží
odkaz z tlačítka Copy ve hře, hráči dostanou svůj odkaz a režie ten divácký.

**Sestavené URI se nikdy nikam neukládá.** Kdyby ses někdy přistihl, že do
databáze zapisuješ `aoe2de://…`, je to chyba, ne zkratka.

## Rozjetí od nuly

Potřebuješ **Node 24+** (`package.json` má `engines.node: ">=24"`, používá se
`--env-file-if-exists` a `--experimental-strip-types`) a **PostgreSQL**.
Vývoj probíhal na 17, nic verzově specifického v SQL není.

```bash
git clone https://github.com/vtencer3-lab/rob-aoe-web
cd rob-aoe-web
npm install
npm --prefix web install
```

Dvě databáze — ostrá a testovací:

```bash
createdb -U postgres rob_aoe
createdb -U postgres rob_aoe_test
```

Zkopíruj `.env.example` na `.env` a uprav `DATABASE_URL`. **`.env` je
gitignorovaný a musí takový zůstat** — patří do něj Steam API klíč.

```bash
npm run db:migrate     # čte .env
npm run dev            # backend s watch, port 3000
npm --prefix web run dev   # frontend s watch, na jiném portu
```

Nebo produkčně, což servíruje i frontend z jednoho procesu:

```bash
npm run build && npm start   # http://localhost:3000
```

**Steam API klíč nepotřebuješ.** Bez `STEAM_API_KEY` se prostě netahají odehrané
hodiny a avataři; ELO a herní přezdívka chodí ze žebříčku Worlds Edge, který
klíč nechce. Nic se nerozbije.

**Adminem se staneš sám.** S `ADMIN_BOOTSTRAP=true` a prázdným
`ADMIN_STEAM_ID` dostane práva režie první, kdo se přihlásí. Jakmile admin
existuje, proměnná už nedělá nic.

### Přihlášení bez Steamu

Se zapnutým `DEV_PRISTUP=true` a `BASE_URL` na `http` se zaregistrují zkušební
dveře: `/api/dev/naplnit?pocet=3` nasype do akce falešné hráče a
`/api/dev/login?jmeno=Pepa` se za jednoho přihlásí. Umožní to projít celý večer
nasucho bez čtyř Steam účtů. Postup je v `README.md`.

## Mapa kódu

Backend, `src/`:

| kde | co |
|---|---|
| `main.ts`, `http/server.ts` | složení aplikace, registrace rout, servírování `web/dist` |
| `config.ts` | proměnné prostředí a jejich kontrola při startu |
| `auth/` | Steam OpenID (`steamOpenId.ts`), sezení, `devRoutes.ts` |
| `db/` | přístup k databázi, jedna tabulka = jeden modul |
| `http/routes/` | `events.ts` (akce, nastavení lobby), `matches.ts` (zápasy, hledání lobby, `DELETE /api/zapas/:id`), `kontrolaLobby.ts` („Zkontrolovat lobby“), `zkusebni.ts` (zkušební hráči na dev), `stream.ts` (SSE) |
| `realtime/` | `hub.ts` (jeden kanál), `akceStav.ts` (staví stav), `redakce.ts` (zaslepení), `fazeLobby.ts` (lobby / hraje se, s pojistkou proti výpadku v seznamu) |
| `matches/` | `composition.ts` (sedadla, PIN), `stateMachine.ts`, `hledaniLobby.ts` (výběr lobby podle Steam ID), `seznamLobby.ts` (cache seznamu), `sledovaniLobby.ts` (každých 10 s hlídá, jestli lobby ještě stojí), `zkusebniHraci.ts` |
| `external/worldsEdgeLobby.ts` | stahuje a rozbaluje seznam otevřených lobby ze hry (stránkované po 100, sloty i nastavení) — klíče viz `docs/analyza-automaticke-hledani-lobby.md` §6 |
| `aoe/lobbyUri.ts` | rozbor a stavba `aoe2de://` — malé a důležité |
| `shared/types.ts` | typy sdílené s frontendem, importuje se přímo z `web/` |
| `shared/verze.ts` | verze webu; mění se jen přes `npm run verze` |
| `shared/sestava.ts`, `shared/strany.ts` | pravidla sestavy (barvy, týmy, civilizace, Coop Kings) a strany zápasu — jedno místo pro server i režii |
| `shared/lobbyKontrola.ts` | očekávané nastavení lobby, číselníky hodnot a `zkontrolujLobby()` — řádky ve čtyřech stavech (ok / spatne / varovani / jedno) |
| `shared/mapy.ts`, `shared/civilizace.ts` | tabulky id → název vygenerované z jazykového souboru hry (viz „Data ze hry“) |
| `shared/zebricky.ts` | seznam žebříčků hry (id, název, pořadí jako v lobby) a procento výher; data se plní při obnově statistik (`players/refresh.ts`, sloupec `player.zebricky`) |

Frontend, `web/src/`:

| kde | co |
|---|---|
| `App.tsx` | rozhoduje, kdo vidí kterou obrazovku |
| `useAkceStav.ts` | SSE a záložní dotazování — **přečti si komentář nahoře** |
| `views/SpravaAkce.tsx` | panel akce jako herní lobby: název + Ukončit v záhlaví, vlevo sestava (children), vpravo `NastaveniLobby.tsx` (jako herní Game Settings, „–“ = je to jedno; každá změna se propíše hned, „Uložit“ dělá snímek) |
| `views/StatistikyHrace.tsx` | karta se všemi žebříčky hráče v pravém dolním rohu po najetí na jméno v tabulce přihlášených |
| `views/Prepinac.tsx` | přepínač s knoflíkem (Admin/User View v záhlaví, Debug u verze) — jen pro adminy, stav v localStorage |
| `views/Rezie.tsx` | panel režie: zápasy, Spectate, kontrola lobby, výsledky po stranách, odebrání zrušeného zápasu |
| `views/Skladani.tsx`, `skladani.ts`, `tahani.ts` | skládání sestavy: barva a tým jako ve hře, civilizace přes `VyberCivilizace.tsx` (erby z `civErby.ts`), pořadí slotů přetažením. Rozpracovaná sestava je **na serveru u akce** (`akce.skladani`, `PUT /api/akce/:id/skladani`) a přes SSE ji vidí všichni admini; `useSkladani` drží lokální kopii jen do potvrzení serverem |
| `views/ObrazovkaHosta.tsx` | obrazovka hosta: kroky „Zakládáš!“ → „Kontrola lobby“ → „Výborně, můžete hrát!“, snímek herního dialogu |
| `views/KontrolaLobby.tsx` | sekce „Kontrola lobby“, **jedna a tatáž pro hosta i režii**; sama se opakuje po 5 s, dokud se v lobby sedí |
| `views/KartaHrace.tsx` | karta hráče s jeho barvou a odkazem |
| `views/HledaniLobby.tsx` | tlačítko „Vyhledat lobby“ + automatické hledání (4 s, po „Spustit hru“ 2 s) |
| `views/Kopirovatelne.tsx` | hodnota, která se zkopíruje kliknutím, s toastem |
| `views/VerejnyZapas.tsx` | zápas očima diváka, bez tajemství |
| `zapas.ts` | kdo co vidí — `mojeZapasy`, `verejneZapasy` |
| `cesty.ts` | prefix `/aoe` pro všechna volání na server (z Vite `base`) |

Backend a frontend sdílejí typy přímo přes relativní import, žádný balíček mezi
tím není.

## Pět pravidel, která se nesmí porušit

**1. Ukládá se jen číslo lobby.** Viz výš. Odkud číslo přijde, je jedno:
z ručně vloženého odkazu (`POST /api/zapas/:id/lobby`) i ze seznamu lobby ve
hře (`POST /api/zapas/:id/hledat-lobby`, `src/external/worldsEdgeLobby.ts`)
končí ve stejném `setLobbyId()`.

**2. SSE posílá vždycky celý stav, nikdy přírůstky.** Díky tomu je obnova po
výpadku zadarmo a `/api/akce` může sloužit jako plnohodnotná náhrada streamu —
vrací doslova týž payload. Kdyby se začaly posílat přírůstky, obojí padá.

> Z toho plyne i pravidlo pro UI: **všechno, co má vidět víc lidí naráz,
> žije na serveru, ne v prohlížeči.** Rozpracovaná sestava i nastavení lobby
> se proto po každém kliknutí posílají na server a zpátky přijdou přes SSE;
> lokální stav v komponentě je jen na dobu, než server odpoví. Nový stav
> „jen pro mě“ v `useState` je správně jen u věcí, které opravdu nikoho
> jiného nezajímají (sbalené sekce, přepínače pohledu).

**3. O tajemstvích rozhoduje jedno místo.** `redigujProDivaka()` v
`src/realtime/redakce.ts` je bezpečnostní hranice: neúčastníkovi vyprázdní
heslo a vynuluje `lobbyId`, `joinUri` i `spectatorUri`. Hub má jeden kanál pro
celou akci (`KANAL_AKCE`) a redakce běží až těsně před odesláním, každému
divákovi zvlášť.

> Pozor na druhou půlku: **server data pošle správně, ale frontend je musí
> opravdu vykreslit.** Přesně tady vznikla vada, která se hlásila třikrát —
> zápas viděli jen jeho hráči a admin, protože `App.tsx` ho dvěma filtry
> zahodil, přestože ho server posílal všem zaslepený. Když měníš, kdo co vidí,
> ověř obě strany.

**4. `DATABASE_URL` nikdy nemíří na ostrou databázi, když běží `npm run
test:db`.** Ty testy volají `TRUNCATE`. `vitest.db.setup.ts` odmítne
nastartovat, když jméno databáze nekončí na `_test` — to je ale **druhá**
pojistka, ne první.

**5. Zkušební dveře se zavírají podle `BASE_URL`, ne podle proměnné.** Bez
`DEV_PRISTUP=true` se routy vůbec nezaregistrují, a i se zapnutou proměnnou
odmítnou obsluhovat, jakmile `BASE_URL` míří na `https`. Ten druhý zámek je
ten, který drží. Nesahat na něj.

## Pasti, které tenhle projekt už jednou stály čas

**`npx tsc --noEmit` nekontroluje frontend.** Kořenový `tsconfig.json` `web/`
nezahrnuje. Frontend má vlastní kontrolu:

```bash
npx tsc --noEmit                          # backend
npm --prefix web exec tsc -- -b --force   # frontend
```

**`npm run build` je řetěz přes `&&`.** Typová chyba kdekoliv ve frontendu —
klidně jen v testovací fixtuře — zastaví `vite build`, `web/dist` zůstane
starý a server dál servíruje **předchozí** bundle. Vypadá to, že se změna
neprojevila. Po zásahu do `src/shared/types.ts` proto vždycky doběhnout celý
build a zkontrolovat, že se změnil hash souboru ve `web/dist/assets`.

**Cloudflare quick tunnel (`*.trycloudflare.com`) nepropustí SSE.** Drží celé
tělo odpovědi, dokud odpověď neskončí — a náš stream schválně nekončí nikdy,
takže přes něj nedorazí ani úvodní snímek. Hlavičkami se to ubránit nedá, edge
je zahodí. Stránka proto po pěti sekundách ticha přepne na dotazování po třech
sekundách a **vypadá to, že realtime funguje**. Podrobně i s čísly v komentáři
nad `useAkceStav()`. Jestli stejně bufferuje i pojmenovaný tunel, se zatím
neměřilo.

**Zelená sada testů není důkaz funkčního UI.** Prošly jí vady viditelné na
první pohled: obrazovka bez jediného volajícího, tlačítko slepené s textem,
stream zaseknutý na mrtvém kanálu. Testovaly se jednotky, ne cesta, kterou jde
člověk.

**Server drží port 3000.** Před restartem starý proces zabít, jinak nový
spadne nebo tiše běží ten starý.

## Jak se tu ověřuje práce

```bash
npm test                # hermetické, bez sítě a databáze
npm run test:db         # proti databázi — viz pravidlo 4
npm --prefix web test   # frontend
```

Zelené testy jsou začátek, ne konec. U změn v UI nebo v realtime chování projdi
celou cestu **na skutečně běžícím serveru** (`curl` na běžící proces, ne jen
`app.inject`), a hlas jen to, co jsi opravdu viděl projít.

Vizuální kontrola zůstává na člověku. Prohánět GUI screenshoty přes agenta se
v tomhle projektu nevyplatilo.

### Kontrolní seznam před pushem do `dev`

```bash
npx tsc --noEmit                          # typy backendu
npm --prefix web exec tsc -- -b --force   # typy frontendu (build je jinak tiše přeskočí)
npm test                                  # hermetické
npm --prefix web test                     # frontend
npm run test:db                           # proti rob_aoe_test — potřebuje lokální PostgreSQL
npm run build                             # celý řetěz; ve web/dist/assets se musí změnit hash
npm run verze                             # nebo -- minor; v tomtéž commitu jako změna
git push origin dev
curl -s https://jouki.cz/aoe/dev/api/health   # za 2–3 minuty vrací novou verzi
```

Bez lokálního PostgreSQL `test:db` neproběhne; správce serveru je umí pustit
proti testovací databázi na serveru, tak o to požádej v popisu změny.

## Data ze hry

Několik tabulek a obrázků pochází přímo z instalace Age of Empires II DE
(Steam, typicky `C:\Program Files (x86)\Steam\steamapps\common\AoE2DE`).
Nic z toho se nestahuje za běhu; do repa se to jednou vygeneruje a commitne.

| Co | Odkud | Kam |
|---|---|---|
| názvy map (id → název) | `resources/en/strings/key-value/key-value-strings-utf8.txt`, řetězce s id mapy tak, jak ho vydává seznam lobby (klíč `10` v `options`) | `src/shared/mapy.ts` |
| názvy civilizací (id → název) | tentýž soubor, řetězec `10270 + id` | `src/shared/civilizace.ts` |
| sada civilizací (Chronicles vs. Age of Empires II) | `resources/_common/dat/civilizations.json`, pole `era`: `antiquity` = Chronicles, `base` = AoE II; pořadí v `civilization_list` je herní id (index 0 je Gaia) | `CIVILIZACE_CHRONICLES` v `src/shared/civilizace.ts` |
| erby civilizací (kulaté ikony jako v lobby) | `resources/_common/wpfg/resources/civ_techtree/menu_techtree_<slug>.png` (104 px), zmenšené na 96 px webp; slugy se liší u Maya (`mayans`), Hindustanis (`indians`), Inca (`inca`), Berbers (`berber`); `random.png` je otazník pro „libovolná civ.“ | `web/src/assets/civ/*.webp`, mapování v `web/src/civErby.ts` |
| snímek dialogu Create Lobby | screenshot ze hry, do kterého se vsazují název, počet hráčů a PIN | `web/src/assets/create-lobby.webp` |
| významy klíčů nastavení lobby a slotů | zmapováno naživo přepínáním voleb ve hře a porovnáváním seznamu lobby; které hodnoty jsou ověřené a které doplněné podle pořadí v jazykovém souboru, je v tabulce | `docs/analyza-automaticke-hledani-lobby.md` §6, číselníky v `src/shared/lobbyKontrola.ts` |

Když hra přidá civilizaci nebo mapu: doplnit řádek do tabulky, u civilizace
zkontrolovat i `era` (jestli nepatří do Chronicles) a doplnit erb (stejný postup: `menu_techtree_<slug>.png` → 96×96 webp), a
`web/src/civErby.ts` musí umět slug — test v `Skladani.test.tsx` počítá erby
v seznamu, ale chybějící soubor se pozná jen tím, že erb u jména není.

## Konvence

- **Práce jde do větve `dev`, release do `main` jen na pokyn, každá změna
  chování zvedne verzi** (`npm run verze`). Celé v `docs/nasazeni-jouki-cz.md`.
- **Identifikátory i uživatelské texty česky, commity anglicky** (rozkazovací
  způsob v předmětu). Komentáře česky a k věci: proč, ne co.
- TypeScript ESM: `NodeNext`, `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, přípona `.js` v importech.
- Rozdělení testů: `*.test.ts` hermetické, `*.db.test.ts` proti databázi,
  `web/src/**/*.test.tsx` frontend.
- Závislostí je schválně málo: backend `fastify`, `pg`, `@fastify/cookie`,
  `@fastify/static`; frontend `react`, `react-dom`. Než nějakou přidáš,
  zvaž, jestli to za to stojí.

## Databáze

Tabulky: `akce`, `zapas`, `ucastnik`, `prihlaska`, `player`, `session`,
`schema_migrations` a `udalost`.

Migrace jsou očíslované soubory v `database/`, pouštějí se `npm run db:migrate`
a pouštěj je vždycky, i když se zdá, že se nic nezměnilo — chybějící migrace se
pozná až tím, že server spadne na neexistujícím sloupci.

Dvě věci, které nejsou z kódu zřejmé:

- **Otevřená akce je vždycky nejvýš jedna.** Zajišťuje to migrace 003 a
  `buildAkceStav()` proto žádné id nebere — staví tu jednu.
- **Do tabulky `udalost` nikdo nepíše.** Vznikla v migraci 001 a v `src/` na ni
  není jediný odkaz. Než se o ni opřeš, počítej s tím, že je prázdná.

## Stavy

Původní návrh byl dimenzovaný na turnaj o tuctu zápasů a byl schválně
oškrtaný, protože každý stav navíc je klik, na kterém se dá v přímém přenosu
zaseknout:

- **akce**: `bezi` → `konec`
- **zápas**: `bezi` → `dohrano` nebo `zruseny`

Režie smí mezi stavy zápasu cokoliv kromě přechodu na sebe sama — schválně, aby
jeden překliknutý „Vyhrál tým 1" nestál celý zápas. Než navrhneš další stav,
mezistav nebo potvrzení, zvaž, jestli to unese jeden večer s jedním zápasem a
jedním člověkem u režie.
