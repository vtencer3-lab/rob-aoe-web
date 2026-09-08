# Přehled prací a záměrů (stav k 8. 9. 2026, verze 0.16.3)

Tenhle dokument je pro **další session** — člověka nebo agenta, který má na
práci navázat bez přístupu k předchozí konverzaci. Nepopisuje, jak web
používat (to je `README.md`), ani jak ho rozjet a o co nezakopnout
(`CONTRIBUTING.md`), ani vnitřní architekturu (`docs/analyza-projektu.md`).
Popisuje **co se udělalo, proč, jaká rozhodnutí padla, co se zamítlo, co je
rozdělané a co čeká na rozhodnutí.** Kde je něco jinde popsané lépe, odkazuje.

Když v něm něco nesouhlasí s kódem, platí kód a tenhle dokument se má opravit.

---

## 0. Kde co hledat

| Otázka | Dokument |
|---|---|
| Jak večer probíhá, co který uživatel vidí | `README.md`, sekce „Jak večer probíhá“ |
| Které větve kam nasazují a jak se pracuje s `experimental` | `docs/nasazeni-jouki-cz.md` §1, §1.1 |
| Verzování včetně tvaru `X.Y.Z-A.B` na pokusné větvi a pravidel při mergi | `docs/nasazeni-jouki-cz.md` §2, §2.1; kód `scripts/verze.ts` |
| Vzhled: paleta, písmo, rámy, generování obrázků | `docs/grafika.md` |
| Rozjetí, mapa kódu, pasti, kontrolní seznam před pushem | `CONTRIBUTING.md` |
| Architektura, datový model, API, bezpečnostní hranice (k 6. 9.) | `docs/analyza-projektu.md` |
| Pracovní postup dev → main, verzování, Coolify, migrace | `docs/nasazeni-jouki-cz.md` |
| Klíče seznamu lobby Worlds Edge, co je ověřené a co odhadnuté | `docs/analyza-automaticke-hledani-lobby.md` §6 |
| Původní návrh a plán (3. 9.) a zjednodušení stavů (5. 9.) | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Zvyky autora, lokální prostředí, pravidla pro agenty | `CLAUDE.md` |
| **Záměry, rozhodnutí, rozdělané věci, historie verzí** | **tenhle dokument** |

---

## 1. Stav k 8. 9. 2026

| | |
|---|---|
| `origin/main` | 0.17.0, nasazeno na <https://jouki.cz/aoe>; **nemá** velikost mapy podle barev (§3.13) |
| `origin/dev` | 0.18.0, nasazeno na <https://jouki.cz/aoe/dev>; nese grafický kabátek (§3.12) |
| `origin/experimental` | 0.18.0-18.0, přezaloženo z `dev` 8. 9. 2026 po sloučení kabátku; zatím prázdné kolo |
| Migrace | 001–012, poslední `012_zavreny_zapas.sql`; aplikované na všech třech databázích |
| Testy | backend hermetické 219, databázové 134, frontend 177 — všechny zelené |
| Admini (`ADMIN_STEAM_ID` v Coolify) | 76561198014056480 (Jouki), 76561198147631465 (RobDiesALot), 76561198014710095 (Trokner / „Tonner“, vlastník repa) |
| Pracovní strom | čistý, žádná rozdělaná změna mimo repo |

Releasy do `main` proběhly čtyři: PR #4 (0.11.2, 7. 9. večer), PR #5
(0.16.0), PR #6 (0.16.2), PR #7 (0.16.3), všechny 8. 9. po půlnoci.
**Release se dělá jen na výslovný pokyn** („pushni do mainu“).

**Tři větve, tři nasazení (od 8. 9. 2026).** `main` = ostrá,
`dev` = vývojová a zdroj releasů, `experimental` = pískoviště na velké
pokusy. Záměr uživatele doslova: „dev verzi nechat, kdyby bylo potřeba
vydávat hotfixy, a experimental na větší experimenty, které kdyžtak
zahodím“. Každá kopie má vlastní databázi a vlastní cookie; pokus se
zahazuje `git reset --hard dev`, aniž by se čehokoliv dotkl. Podrobný
postup včetně přečíslování migrací je v `docs/nasazeni-jouki-cz.md` §1.1.

**Pokusná větev má vlastní tvar verze** `X.Y.Z-A.B` (§2.1): před pomlčkou
verze devu, ze které pokus vyšel, za pomlčkou vlastní dvojčíslí pokusu.
Pokus nikdy nemění první číslo webu. Začíná zdvojením (`0.16.3` →
`0.16.3-16.3`), při mergi zpátky se verze devu dopočítá podle toho, jestli
pokus zvedl svoje první číslo (`npm run verze -- z-experimentu`), a pokus
se pak přezaloží z nové verze devu. Logika je v `scripts/verze.ts`
a případy z tabulky v §2.1 jsou doslova testy v `scripts/verze.test.ts`.

---

## 2. Jak se v tomhle projektu pracuje (postup jedné změny)

Ověřený postup, který se za dva dny ustálil. Všechno dělá agent, uživatel
jen kontroluje vzhled v prohlížeči.

```bash
# 1. změna kódu + testy (viz níže „Poučení“ — velké úpravy přes python skript ve scratchpadu)
npx tsc --noEmit                              # backend typy
npm --prefix web exec tsc -- -b --force       # frontend typy (tsc --noEmit je NEKONTROLUJE)
npm test                                      # hermetické
npm --prefix web test -- --run                # frontend
# 2. verze — patch pro opravu/vzhled, minor pro novou funkci nebo migraci
npm run verze            # nebo: npm run verze -- minor
npm run build            # musí doběhnout celé; "✓ built in" od Vite je důkaz
# 3. commit (anglicky, rozkazovací způsob) a push do dev
git add -A && git commit -F - <<'EOF'
Subject line

Body: why, not what.

Co-Authored-By: ...
EOF
git push origin dev
# 4. čekat na nasazení (hlídač na VPS, ~1–2 min) a ověřit verzi
curl -s https://jouki.cz/aoe/dev/api/health
# 5. databázové testy (lokálně Postgres neběží) — SSH IP adresou, hostname selhává na host key
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
```

Pokus na `experimental` (velká přestavba, kterou je možné zahodit):

```bash
git checkout experimental && git merge dev   # začít od aktuálního dev
npm run verze -- experiment                 # 0.16.4 → 0.16.4-16.4 (jen jednou, na začátku kola)
# … práce; npm run verze (0.16.4-16.5), npm run verze -- minor (0.16.4-17.0); nasazuje se samo
curl -s https://jouki.cz/aoe/experimental/api/health
git checkout dev && git merge experimental   # pokus vyšel; konflikt verzí vyřešit ve prospěch dev
npm run verze -- 0.17.1                      # POZOR: když merge projde fast-forward, git verzi nekonfliktuje
                                             # a do devu propadne pokusná — nastav ji ručně na verzi devu
npm run verze -- z-experimentu               # dopočítá verzi devu podle pravidel §2.1
git checkout experimental && git reset --hard dev && git push --force-with-lease origin experimental   # pokus se zahazuje
```

Release do `main`:

```bash
gh pr create --base main --head dev --title "Release X.Y.Z: …" --body-file - <<'EOF'
…
EOF
gh pr merge --merge --subject "Release X.Y.Z"
curl -s https://jouki.cz/aoe/api/health     # musí hlásit X.Y.Z
```

Co se nesmí: commitovat do `main` přímo, ukládat do repa jakékoli
přihlašovací údaje (repo je veřejné; Coolify token a heslo DB jsou jen v
`/root/aoe-deploy/.env` na VPS, `STEAM_API_KEY` jen v Coolify env), pushnout
bez frontendového `tsc` (viz 0.14.0 níže).

Provozní drobnosti, které stály čas:

- **Coolify env:** změna proměnné = `PATCH /applications/{uuid}/envs` a pak
  `/deploy?uuid=`. Samotný `/restart` nové proměnné **nenačte**.
- **Logy kontejneru zmizí s každým nasazením** (Coolify staví nový kontejner,
  jméno `<uuid>-<číslo>`). Když se má něco vyšetřit z logu, udělat to před
  dalším pushem. Dev kontejner: prefix `wxju55zz…`, ostrý `qjaf9z9n…`,
  pokusný `on5tol2p…` (to jsou zároveň uuid aplikací pro Coolify API).
- Postgres kontejner `aj70ceyvdhxuvhe07suo3q9y`, databáze `rob_aoe` (ostrá),
  `rob_aoe_dev`, `rob_aoe_experimental`, `rob_aoe_test`; dotaz:
  `docker exec … psql -U rob_aoe -d rob_aoe_dev -c "…"`. Novou databázi
  role `rob_aoe` založit neumí, `CREATE DATABASE` se musí spustit jako
  `POSTGRES_USER` uvnitř kontejneru.
- **Hlídač větví** `/root/aoe-deploy/watch.sh` má seznam dvojic
  `větev:uuid`; nová větev se nasazuje, až když je v něm zapsaná.
- Screenshoty od uživatele bývají **z ostré verze i z dev** — verze v patičce
  (`v0.16.0`) říká, ze které. Dvakrát to zmátlo diagnostiku.

---

## 3. Funkce, záměry a rozhodnutí (po oblastech)

Každá oblast: **Záměr** (co uživatel chtěl a proč), **Jak to je** (chování a
kde v kódu), **Rozhodnutí** (co se zvolilo a co zamítlo), **Pasti**.

### 3.1 Kontrola lobby ve čtyřech stavech

**Záměr.** Rob potřebuje na jeden pohled vidět, jestli hostova lobby odpovídá
tomu, co zápas vyžaduje. Původně binární ok/špatně bylo k ničemu: heslo
chybějící v lobby hře nebrání („heslo je non-mandatory, jen warning“) a u
spousty voleb Robovi na hodnotě nezáleží.

**Jak to je.** `src/shared/lobbyKontrola.ts`: `StavKontroly = "ok" | "spatne"
| "varovani" | "jedno"`, `lobbyVPoradku()` = žádný řádek `spatne`. Hlavní
sekce (diváci, hráči s barvou/týmem/civilizací, mapa, velikost, rychlost,
populace, victory, cheaty) a „Další nastavení“ (rozbalená, se sbalením
pamatovaným v localStorage, s počtem odchylek v nadpisu). Velký zelený
checkmark a „Výborně, můžete hrát!“ jakmile není nic červené. Sekce je
**jedna komponenta pro hosta i režii** (`web/src/views/KontrolaLobby.tsx`),
opakuje se po 5 s (`INTERVAL_KONTROLY_MS`), dokud se sedí v lobby.

**Rozhodnutí.**
- Hodnota „–“ (je to jedno) existuje u AI Difficulty a Lock Teams; u ostatních
  polí se očekávaná hodnota vždy zadává. Rozšířit „–“ na další pole jde přes
  nullable položky v `NastaveniLobby`.
- Číselníky (AI obtížnosti, suroviny, odkrytí mapy, věky, režimy) jsou
  z jazykového souboru hry; **které hodnoty jsou ověřené naživo a které jen
  doplněné podle pořadí**, je v `docs/analyza-automaticke-hledani-lobby.md`
  §6. Ověřené: AI 3/1, resources 0/3, ages 0/3/6 a 0/4.
- „Hraje se“ (lobby zmizela ze seznamu) je kritická informace pro Spectate,
  proto se hlásí až po **třech** nepřítomnostech za sebou
  (`NEPRITOMNOSTI_PRO_HRAJE_SE = 3`, `src/realtime/fazeLobby.ts`) — seznam
  lobby občas na jedno stažení vynechá kvůli posunu stránkování.

**Pasti.** Heslo lobby **nejde přečíst** — seznam vydává jen příznak
`passwordprotected`; klíč 52 není hash hesla (ověřeno). Viz 5. „Čekající
rozhodnutí“ — indikátor „heslo funguje“.

### 3.2 Obrazovka hosta a karta hráče jako kroky

**Záměr.** Původní obrazovky byly hromada textu a tlačítek. Uživatel chtěl
tři jasné kroky s velkým nadpisem, bez zbytečných vět.

**Jak to je.** Host (`ObrazovkaHosta.tsx`): „Zápas #N“ velké, pod bannerem
„Zakládáš!“, zrcadlo herního dialogu Create Lobby (skutečný snímek, do něhož
se vsazují název, počet hráčů a PIN; kliknutí na pole kopíruje a ukáže
toast; snímek je od 0.16.1 vycentrovaný), „Spustit hru“, po nalezení lobby
fajfka, pak „Kontrola lobby“, pak „Výborně, můžete hrát!“ vycentrované.
Hráč (`KartaHrace.tsx`): „Připojuješ se!“ (stejná velikost jako „Zakládáš!“),
animované tečky vycentrované, strany zápasu s „VS“ a 1v1 ELO u jmen,
vycentrované heslo.

**Rozhodnutí / zamítnuto.**
- Věta „Kdyby to zamrzlo…“ s odkazem k ručnímu hledání se **schovala**
  („zatím ten link vedle tlačítka schovej“) — kód zůstal, jen se nevykresluje.
- Host **nemá** tlačítko „Připojit se“ (sedí v lobby, kterou založil).
- Věty „lobby zatím není vidět“ a „Lobby se bude jmenovat“ a věta o barvě
  hráče byly odstraněné jako šum.
- Nadpis se píše „RobDiesALot“ (velikost písmen podle uživatele).

### 3.3 Panel akce jako herní lobby, Nastavení Lobby, živé sdílení

**Záměr.** Rob má v přímém přenosu vedle sebe hru a web; panel nastavení má
vypadat **stejně jako Game Settings ve hře** (stejné pořadí, stejné popisky),
aby se nemusel přeorientovávat. Dva admini (Rob a Jouki/Trokner) mají vidět
totéž **okamžitě**, bez refreshe — uživatel se výslovně ptal „vidí to druhý
admin okamžitě?“ (ano).

**Jak to je.**
- `SpravaAkce.tsx`: název akce v záhlaví (vpravo „Ukončit akci“), vlevo
  „Přihlášení hráči“ + rozpracovaná sestava, vpravo `NastaveniLobby.tsx`,
  tlačítko „Vytvořit zápas (N)“ dole. Stránka je o 250 px širší než původně
  (`main { max-width: calc(62rem + 250px) }`) — rozšiřovalo se dvakrát
  (+100, +150) na žádost.
- **Každá změna nastavení se propíše hned** (`POST /api/akce/:id/nastaveni-lobby`
  → `akce.nastaveni_lobby` → SSE všem). „Uložit nastavení lobby“ udělá snímek
  (`…/nastaveni-lobby/ulozit` → `ulozene_nastaveni_lobby`), „Načíst uložené“
  se k němu vrátí, „Reset nastavení“ nasadí výchozí hodnoty. Načíst i Reset
  jsou **zašedlé, když by nic nezměnily** (0.14.5).
- **Rozpracovaná sestava žije na serveru u akce** (`akce.skladani` jsonb,
  `PUT /api/akce/:id/skladani`, ≤ 16 řádků, bez duplicit) a vytvořením
  zápasu se vyprázdní. `useSkladani` (`web/src/skladani.ts`) drží lokální
  kopii jen do potvrzení serverem.
- Tri-state checkboxy (zaškrtnuto / nezaškrtnuto / „–“): levý klik cykluje
  dopředu, **pravý klik dozadu** (0.14.4). AI Difficulty seřazená podle
  obtížnosti, Team Positions zašedlé, když nedává smysl.
- Number inputy mají výšku selectů, `padding-left: 0.85rem`, aby čísla
  lícovala s texty v selectech (řešilo se třikrát, poslední stav 0.13.3).

**Rozhodnutí.** Živé sdílení místo „Uložit = odeslat“: uživatel chtěl, aby
tlačítko Uložit znamenalo *uloženou konfiguraci*, ne odeslání. Historie
Ctrl+Z pak pracuje nad tím, co je na serveru (3.7).

### 3.4 Přepínače admina: Admin/User View a Debug

**Záměr.** Rob chce v přenosu ukázat stránku „očima hráče“ a chce mít
zkušební tlačítka schovaná, dokud je nepotřebuje.

**Jak to je.** `Prepinac.tsx` (knoflík vycentrovaný svisle, menší než první
verze — „asymetrické / moc velké“ bylo zamítnuto). „Admin View / User View“
pod přihlášením v záhlaví, „Debug“ u verze v patičce; oba jen pro adminy,
stav v localStorage. Debug navíc ukáže zavřené zápasy v režii (3.8) a
tlačítka zkušebních hráčů, pokud je server povolil (`DEV_PRISTUP`, jen na
dev; přes https se zkušební dveře samy zavírají — nesahat).

### 3.5 Tabulka přihlášených, karta se statistikami

**Záměr.** Rob potřebuje při skládání vidět sílu hráčů (ELO), kdo právě hraje,
a na najetí kompletní žebříčky jako v herní lobby.

**Jak to je.**
- `SeznamPrihlasenych.tsx`: sloupce Hráč, 1v1 ELO, Nejvýš, Odehráno, Hodin ve
  hře; **řaditelné** (vzestupně → sestupně → původní pořadí, po sloupcích),
  avatar 28 px, jméno svisle na střed. Tlačítko „+“ přidá hráče do sestavy
  s výchozím týmem. **Zkřížené meče** u hráče, který je v běžícím zápase
  (`vZapase` mapa v `App.tsx`).
- `StatistikyHrace.tsx`: karta vpravo dole po najetí na jméno (v tabulce i
  v sestavě), jméno vlevo vedle avataru, všech osm žebříčků (`ZEBRICKY` v
  `src/shared/zebricky.ts`: ids 3, 4 ověřené; 1, 2, 13, 14, 27, 28 **jen
  odhad podle pořadí ve hře**) s ratingem, pořadím, výhrami, prohrami a %.
  Toasty sedí nad ní (`--staty-vyska`). Během tažení se karta **neotvírá**
  (`body.tahne-se`), po konci tahu mimo obsah se zavře (`KONEC_TAHU`).
- Statistiky: `src/players/refresh.ts`. Stahují se po přihlášení a při
  každém `/api/me` (načtení stránky), ale nejvýš jednou za 15 minut
  (`CACHE_TTL_MS`) — **od 0.16.2 se řádek bez žebříčků bere vždy jako
  zastaralý** (`maCerstveStaty`). Po stažení `broadcastAkce()`, aby nová
  data doputovala otevřeným stránkám.

**Pasti.** Worlds Edge vrací `null` (a web uloží `zebricky = null`), když hráč
v `statGroups` není; s `[]` když je, ale nikde nehraje. Řádek s `null` se
proto stahuje znovu při každém načtení stránky — přijatelné, takový hráč je
výjimka. Zapisuje se přes `COALESCE`, `null` nikdy nepřepíše starší data.

### 3.6 Skládání sestavy: tažení, ELO týmů, civilizace s erby

**Záměr.** Přetahování řádků má působit jako „vzal jsem řádek do ruky“:
nadzvednutí, ostatní řádky se plynule rozestoupí. Rob potřebuje součty ELO
týmů, aby vyvážil strany. Výběr civilizace má vypadat jako ve hře (erby).

**Jak to je.**
- `web/src/tahani.ts`: **pointer events na `window`** (ne na řádku — React
  řádek při přeuspořádání přesune v DOMu a pointer capture se ztratí),
  `.v-ruce` nadzvednutý řádek, FLIP animace ostatních řádků měřená
  **relativně k rodiči** a **bez rozjeté transformace** (`animovanyPosunY`),
  jen během tahu. Body dostane třídu `tahne-se`, na konci se vyšle událost
  `KONEC_TAHU` s prvkem pod kurzorem (`document.elementFromPoint`, hlídané
  pro jsdom). HTML5 drag & drop zůstal jako záloha pro testy.
- Součty ELO týmů v bloku **přímo pod seznamem** (ne na spodku panelu),
  týmy v jednom řádku, dva na řádek při úzké stránce.
- `VyberCivilizace.tsx` + `civErby.ts`: tlačítko i rozbalený seznam 16,5 rem,
  erby 48 px, nabídka jen z civilizací zvolené sady (Chronicles vs. AoE II).
  Erby z herních souborů (uživatel to výslovně dovolil: „klidně použij
  soubory hry“) — postup v `CONTRIBUTING.md` „Data ze hry“.
- Čtverečky barvy/týmu: 3D stínování, `font-variant-numeric: lining-nums`
  (Georgia má starostylové číslice, dvojka seděla níž), bez výběru textu,
  animace stisku. Řádky sestavy přes CSS **subgrid**, jméno vždy na jednom
  řádku.

**Chyby, které se tu opravovaly (pořadí, ve kterém se objevily):** řádky
„odletěly“ po scrollu (měření vůči viewportu → vůči rodiči, 0.13.4); tažení
fungovalo jen o jednu pozici (listenery na window, 0.13.7); divoký rozptyl
při rychlém tahu (rozhodovat o prohození z layoutové pozice bez transformace,
0.13.9 a 0.13.12); blikání karty statistik během tahu (0.13.17); karta
zůstala viset po tahu mimo obsah (0.14.5); řádky svisle roztažené (0.13.2).

### 3.7 Zpět a znovu (Ctrl+Z / Ctrl+Y), toasty, zvýraznění

**Záměr.** Rob v přenosu klikne špatně a chce to okamžitě vrátit. Zpětná
vazba má být jasná, ale **ne otravná**: uživatel nejdřív dostal toast a
záblesk při každé akci a hned to odmítl („nechci, aby se toasty ukazovaly na
běžnou akci, ale jen na Ctrl+Z/Y“, „highlight jen když použiju undo“).

**Jak to je.** `web/src/historie.ts`: `Zaznam` typu `skladani` nebo
`nastaveni`, `popisZmenySestavy` / `popisZmenyNastaveni` skládají českou větu,
`blikni()` dělá zlatý záblesk (`.zmena`). Zásobníky undo/redo jsou v refech
v `App.tsx`; `useSkladani(prihlaseni, { hodnota, odesli, naZmenu })` a
`nastavCelou` zapisují záznamy. Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z na `window`
(s guardem `cil instanceof HTMLElement`, aby se nechytaly klávesy v inputech).
Toasty (`views/Toasty.tsx`, 6 s, tlačítko Zpět a křížek) vpravo dole nad
kartou statistik. Historie je **jen v prohlížeči toho admina, který změnu
udělal** — cizí změny se nevrací. Při vracení se **vyhodí hráči, kteří už
nejsou přihlášení** (legality check, 0.14.1).

**Zamítnuto.** Sdílená historie na serveru (kdo by vracel čí změny) a
toast při každé akci.

### 3.8 Režie: řádky jako v sestavě, zavření zápasu křížkem

**Záměr.** Režie má vypadat stejně jako sestava (čtverečky barvy/týmu, jméno,
ELO, stav). Dohrané zápasy mají jít **zavřít úplně**, aby v přenosu
nestrašily, ale s možností je zase otevřít.

**Jak to je.** `Rezie.tsx`: řádky účastníků ve stylu sestavy, Spectate čeká
na založení lobby („čeká se na založení Lobby“), výsledek po stranách
(„Vyhrál Trokner“, „Vyhrál modrý tým“), zrušený zápas jde vrátit nebo
„Odebrat úplně“ (`DELETE /api/zapas/:id`, jen zrušený).
**Zavření (0.15.0):** sloupec `zapas.zavreny_v` (migrace 012, čas místo
příznaku, `NULL` = otevřený), `POST /api/zapas/:id/zavrit` s tělem
`{ zavreny?: boolean }` (admin; 409 „Zavřít jde jen dohraný zápas.“),
`ZapasView.zavreny`. Zavřený zápas zmizí z veřejného seznamu
(`verejneZapasy` v `web/src/zapas.ts`) i z režie; s **Debug** zapnutým je
v režii zašedlý (`.zapas.zavreny`, opacity .45) s poznámkou „· zavřeno“ a
tlačítkem „Znovu otevřít“. Výsledek zůstává v databázi, nic se nemaže.

### 3.9 SSE: puls, hlídka, obnova po akci, lišta s novou verzí

**Záměr.** 7. 9. večer Rob 18 s klikal na „Zrušit“ a nic — stream byl dvě
hodiny potichu mrtvý (puls byl jen SSE komentář, který prohlížeč nevidí).
Později druhý admin neviděl zavření zápasu, protože měl otevřenou stránku
se starým bundlem, který pole `zavreny` neznal.

**Jak to je.**
- Server: `event: puls` každých 25 s (`PULS_MS`, `src/http/routes/stream.ts`)
  a **`event: verze` hned po otevření streamu** s `{ verze }`.
- Klient (`web/src/useAkceStav.ts`, přečti komentář nahoře): po 70 s ticha
  (`HLIDKA_MS`) spojení zahodí, doptá se `/api/akce` a otevře nové; při
  návratu do záložky a **po každé vlastní akci** se stav dočte
  (`obnov()`); vrací `{ stav, spojeno, obnov, novaVerze }`.
- Když se verze ze streamu liší od `VERZE` zabudované do bundlu, nad `main`
  se ukáže **lišta přes celou šířku okna, přilepená nahoře** („Web se
  aktualizoval na verzi X, tahle stránka má Y“ + „Načíst znovu“). Stránka
  se **nenačítá sama** — uživatel zvolil lištu, aby nikomu nezmizela
  rozdělaná sestava a historie Ctrl+Z. Po nasazení se server restartuje,
  stream spadne, nové spojení přinese novou verzi, takže lišta naskočí i
  stránce otevřené od odpoledne. Stránky z verzí **před 0.16.0** to neumí a
  musí se obnovit ručně.

### 3.10 Statistiky hráčů — kdy se stahují (viz 3.5)

Shrnutí pro rychlou orientaci: přihlášení přes Steam → `obnovStaty`
(fire-and-forget, přihlášení nikdy neblokuje); každé `/api/me` → totéž;
přeskočí se, když je řádek mladší než 15 min **a má žebříčky**; po uložení
`broadcastAkce()`. Chyby externích zdrojů do `player.staty_chyba`.
Worlds Edge `getPersonalStat` a Steam (profil, hodiny; skrytý profil =
`null`, chybějící klíč = nesahat).

### 3.12 Grafický kabátek (v `dev` od 0.18.0)

**Záměr.** Uživatel doslova: „chtěl bych zkusit dát webové stránce kompletní
grafický kabátek… layout chci aby prakticky zůstal 1:1, pouze na to chci
hodit grafický overhaul“, s tím, že se vyjde z loga Brohemians, tématika je
Age of Empires II a logo má být dobře zakomponované. Rozhodnutí padla
v dotazníku: plný herní kabátek, pozadí české s AoE2 nádechem, herní assety
z instalace hry volně, písmo Cinzel + Georgia.

**Jak to je.** Celý systém včetně palety, rámů, seedů a postupu regenerace
popisuje [`docs/grafika.md`](grafika.md). Ve zkratce: barvy vytažené z loga,
malované pozadí (pražské náměstí za soumraku, Flux.2-dev lokálně), devítidílný
řezbovaný rám panelů s ametysty, praporec pod nadpisem, vodoznak pražského
orloje (herní znak civilizace Bohemians), tlačítka a pole kreslená v CSS.
Layout se nezměnil; jediný zásah do JSX je obal `section.panel-prihlaseni`
kolem nadpisu a tabulky přihlášených, aby seděly na jedné desce.

**Rozhodnutí.**
- **Tlačítka a pole v CSS, ne z obrázku.** Vygenerované destičky vyšly hezky,
  ale působily jako nálepky a nedržely ostrost. Obrázky nesou jen to, co se
  nakreslit nedá.
- **Stylová LoRA z Koshishatsi se nepoužila.** Přimalovala pozadí černou
  vinětu (je trénovaná na izolované předměty), bez ní vyšla scéna líp.
- **Barvy hráčů (`--b1`…`--b8`) zůstaly beze změny** — musí sedět s barvami
  ve hře, jinak hráč nepozná, že je „modrý“.
- **GPT-Image se nepoužilo** — klíč na stanici není a uživatel potvrdil, že
  nefunguje. Všechno vzniklo lokálně na RTX 5090.
- Ze Scenaria uživatel povolil odstranění pozadí, bezešvé textury a upscaling,
  textury si napřed chce ocenit v kreditech. **Zatím se nic z toho nepoužilo**,
  lokální pipeline stačila.

**Nástroje.** `nastroje/grafika/` v repu (paleta, dávkové generování
s manifestem, devítidílný řez, klíčování, export do webp) a mimo repo
`_grafika/nastroje/` (Playwright: sada snímků, kontrola šířek, vzorník všech
prvků).

### 3.13 Sestava bez stropů a velikost mapy podle barev

**Záměr.** Uživatel doslova: „počet lidí s jednou barvou nechci omezovat,
stejně tak ani počet lidí v jednom týmu nechci nijak omezovat“. Pravidlo
sestavy dřív pouštělo na jednu barvu nejvýš dva hráče (Coop Kings) a zápas
se třemi na slotu nešel založit. Strop je pryč; co zůstalo, je podmínka,
že celá skupina se stejnou barvou musí být v jednom týmu a mít tutéž civ —
sdílejí totiž ve hře jeden slot. Kontrola proto kouká na celou skupinu,
ne jen na dvojici (`src/shared/sestava.ts`). Vydáno jako 0.17.0 do `main`.

**Velikost mapy.** Volba „podle počtu hráčů“ počítá unikátní barvy, ne hlavy
(`src/shared/lobbyKontrola.ts`). Tři lidi na jedné barvě proti jednomu jsou
ve hře 1v1, ne 4hráčová mapa. Vydáno jako 0.17.1 do `dev`; **v `main` to
zatím není**, release nebyl zadán.

### 3.11 Drobnosti a easter egg

- Logo (lev se štítem, od uživatele 8. 9.) v záhlaví vlevo od nadpisu,
  64 px, `web/src/assets/logo.webp` (192 px, oříznuté o průhledný okraj,
  17 kB).
- Kliknutí na „RobDiesALot“ v nadpisu přehraje `crashout.mp3`
  (`web/src/assets/crashout.mp3`, verze z 8. 9. — „Rob - Crashout.mp3“
  z uživatelovy složky zvuků). Bez autoplay práv ticho, žádná chyba.
- Georgia v čtverečcích: `lining-nums`. Nadpisy sekcí sjednocené na jednu
  velikost. Rovnoměrné velikosti křížků „×“.

---

## 4. Externí API — co je ověřené a co ne

Worlds Edge (backend hry) není zdokumentovaný. Ověřené naživo 7. 9. 2026:

| Co | Stav |
|---|---|
| Seznam otevřených lobby: `id` = číslo z `aoe2de://` odkazu, Steam ID hosta a hráčů ve slotech, stránkování po 100 (`start=`) | ověřeno |
| Klíče `options` (mapa 10, …) | zmapované v `docs/analyza-automaticke-hledani-lobby.md` §6; hodnoty AI 3/1, resources 0/3, ages 0/3/6, 0/4 ověřené, zbytek odvozený z pořadí v jazykovém souboru a **označený jako neověřený** |
| Heslo lobby | jen příznak `passwordprotected`; klíč 52 **není** hash hesla; správnost hesla z API zjistit nejde |
| `getPersonalStat`: leaderboard 3 (1v1 RM), 4 (Team RM) | ověřeno |
| leaderboard 1, 2, 13, 14, 27, 28 | **předpoklad** (Death Match, Team DM, Empire Wars, Team EW, Return of Rome, Team RoR) |
| `getRecentMatchHistory` pro rozehranou hru | vrátilo nic — data o právě běžící hře přes veřejné API **nejsou** |
| Limity dotazů | neznámé; proto cache 15 min u statistik a jedna sdílená cache seznamu lobby (`src/matches/seznamLobby.ts`), sledování po 10 s |

Steam Web API: klíč od uživatele (7. 9.), jen v Coolify env obou aplikací.

---

## 5. Čekající rozhodnutí a nápady (nic z toho není rozdělané v kódu)

Uživatel se ptal nebo dostal nabídku, ale **nerozhodl**:

1. **Civilizace hráče z lobby na kartě hráče.** Sloty v seznamu lobby
   obsahují zvolenou civilizaci; šlo by ji ukazovat vedle předepsané. Kód
   parsování slotů existuje (`worldsEdgeLobby.ts`), UI ne.
2. **Náhledy map vedle „Location“ v kontrole lobby.** Ikony map jsou ve hře
   v `resources/_common/wpfg/resources/mapicons/{rm_,rwm_,sm_,br_}*.png`;
   při zkoušce se spárovalo 194 z 198 map (chybí King of the Hill, BR Fall
   of Rome, Great Wall, Network Test). **Do repa se nic nepřidalo**
   (`web/src/assets/mapy` neexistuje) — postup by byl stejný jako u erbů.
3. **Indikátor „heslo funguje“.** Správnost hesla z API nejde přečíst;
   navrženo hlásit „heslo funguje“, jakmile do lobby vstoupí druhý hráč.
   Neimplementováno.
4. **Data o běžící hře** (skóre, kdo vede) — přes veřejné API nedostupné,
   zatím uzavřeno jako nemožné.
5. Schovaný odkaz „Kdyby to zamrzlo“ na obrazovce hosta — zatím schovat,
   možná vrátit jinde.

Drobné známé nedodělky:

- Lišta nové verze pomůže až stránkám od 0.16.0; starší si lidé obnoví sami.
- `docs/analyza-projektu.md` je snímek k 6. 9. (0.1.0) — architektura platí,
  ale čísla (počty testů, migrací, řádků) a část API jsou zastaralé. Sekce
  o rizicích stojí za přečtení pořád.
- README obsahuje starší sekce o tunelu a nasazení u Roba
  (`docs/nasazeni-u-roba.md`), které se od nasazení na jouki.cz nepoužívají,
  ale nejsou špatně.

---

## 6. Historie verzí (7.–8. 9. 2026)

Jedna řádka = jeden commit do `dev`; tučně releasy do `main`.

| Verze | Kdy | Co (a proč) |
|---|---|---|
| 0.2.0 | 7. 9. 00:34 | Nasazení na jouki.cz pod `/aoe` s větvemi dev/main a verzováním |
| 0.3.0 | 09:06 | Analýza automatického hledání lobby; více adminů v `ADMIN_STEAM_ID` |
| 0.4.0 | 09:29 | Lobby se hledá v herním seznamu místo vkládání odkazu |
| 0.5.0 | 11:03 | Hledání automaticky, rozlišení lobby / hraje se |
| 0.6.x | 11:29–12:46 | Ruční skládání (barva, tým, pořadí slotů, strany); obnova statistik při načtení stránky; kopírování z dialogu; „+“ v tabulce |
| 0.7.x | 14:37 | Zkušební hráči z panelu režie na dev; „Spustit hru“ pro hosta |
| 0.8.0 | 15:34 | Kontrola lobby proti sestavě a očekávanému nastavení |
| 0.9.x | 15:53–16:02 | Předepsané civilizace; obrazovka hosta kolem jednoho tlačítka |
| 0.10.0 | 16:22 | Kontrola rozdělená na hlavní/další, tvrdší sledování fáze, odebrání zápasu |
| 0.11.x | 16:48–20:40 | Čtyři stavy kontroly, panel jako herní Game Settings, erby, jen civilizace ze zvolené sady; **release PR #4 (0.11.2)** |
| 0.12.x | 21:13–21:55 | Živě sdílená sestava a nastavení, přepínače admina, panel jako lobby, řaditelná tabulka, ELO na kartě, zkřížené meče |
| 0.13.x | 22:01–22:54 | Karta statistik, pointer tažení s FLIP (a jeho opravy), ELO týmů, easter egg, řádky režie ve stylu sestavy |
| 0.14.x | 23:02–23:41 | Undo/redo s toasty (pak jen na undo/redo), pravý klik na checkboxy, zašedlé Načíst/Reset, **puls jako událost + hlídka SSE** |
| 0.15.0 | 23:55 | Zavření dohraného zápasu křížkem (migrace 012) |
| 0.16.0 | 8. 9. 00:30 | Lišta „nová verze“, logo, nový crashout; **release PR #5** |
| 0.16.1 | 00:37 | Dialog Create Lobby vycentrovaný |
| 0.16.2 | 00:44 | Statistiky bez žebříčků se obnoví i v cache okně; **release PR #6** |
| 0.16.3 | 00:54 | Lišta přes celou šířku, sticky; **release PR #7** |

Před tím (3.–6. 9.): návrh a plán, zjednodušení stavů akce (spec 5. 9.),
zrcadlo dialogu Create Lobby, onboarding pro přispěvatele (0.1.0).

---

## 7. Poučení (aby se neopakovalo)

- **Frontend typy se kontrolují zvlášť.** 0.14.0 se pushnul s chybou
  v cleanupu efektu (vracel string), `vite build` se nespustil a dev
  zůstal na staré verzi. Vždy `npm --prefix web exec tsc -- -b --force`
  a celý `npm run build` před pushem.
- **Velké úpravy souborů dělat python skriptem ve scratchpadu**, ne bash
  heredocem s kódem — heredocy s určitým obsahem padaly na „unexpected
  EOF“. A po `assert` v patch skriptu **nezřetězovat** další příkazy přes
  `&&` bez kontroly výstupu: jednou tak vznikl commit 4683fd4 bez CSS.
- **jsdom neumí** PointerEvent (polyfill v testech přes MouseEvent),
  `scrollIntoView` (volat volitelně), `setPointerCapture` (try/catch),
  `location.reload` (netestovat klikem); `e.button ?? 0`.
- **CSS specificita v režii:** `.skladani.jen-ke-cteni .sestava` (5 sloupců)
  přebíjela šestisloupcové pravidlo; řešení `.zapas .skladani.jen-ke-cteni
  .sestava.sestava-zapasu` a obalový `div.skladani.jen-ke-cteni` v Rezie.
- **Keydown na `window`:** `e.target.matches` padá na `document` — guard
  `instanceof HTMLElement`.
- **Cache statistik vs. nový sloupec:** řádek stažený starou verzí serveru
  je „čerstvý“ podle času, ale bez nových dat (0.16.2). Při dalším novém
  sloupci ve statistikách rozšířit `maCerstveStaty`.
- **Uživatel hodnotí vzhled ze screenshotů**; zelené testy nic neříkají
  o zarovnání, velikostech a blikání. Po každé vizuální změně nasadit na dev
  a nechat zkontrolovat, hlásit číslo verze.
- Čas v databázi je UTC, uživatel je v CEST (UTC+2); při porovnávání
  s časem nasazení a screenshotů to sedí až po přepočtu.
