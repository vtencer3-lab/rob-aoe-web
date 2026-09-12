# Přehled prací a záměrů (stav k 12. 9. 2026, dev 0.28.4)

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
| Vzhled: paleta, písmo, rámy, generování obrázků, praporec v záhlaví | `docs/grafika.md` |
| Jak se vrátit vydaný release zpátky | `docs/nasazeni-jouki-cz.md` §3.7 |
| Rozjetí, mapa kódu, pasti, kontrolní seznam před pushem | `CONTRIBUTING.md` |
| Architektura, datový model, API, bezpečnostní hranice (k 6. 9.) | `docs/analyza-projektu.md` |
| Pracovní postup dev → main, verzování, Coolify, migrace | `docs/nasazeni-jouki-cz.md` |
| Klíče seznamu lobby Worlds Edge, co je ověřené a co odhadnuté | `docs/analyza-automaticke-hledani-lobby.md` §6 |
| Původní návrh a plán (3. 9.) a zjednodušení stavů (5. 9.) | `docs/superpowers/specs/`, `docs/superpowers/plans/` |
| Zvyky autora, lokální prostředí, pravidla pro agenty | `CLAUDE.md` |
| **Záměry, rozhodnutí, rozdělané věci, historie verzí** | **tenhle dokument** |

---

## 1. Stav k 12. 9. 2026

| | |
|---|---|
| `origin/main` | 0.28.3, nasazeno na <https://jouki.cz/aoe> (PR #13, 9. 9. 2026 večer); stav před ním nese značku `v0.24.37` |
| `origin/dev` | 0.28.4, nasazeno na <https://jouki.cz/aoe/dev> — proti `main` (0.28.3) navíc jen přepínač zkušebního pozadí v debug módu (§3.28) |
| `origin/experimental` | 0.28.3-28.3, přezaloženo z `dev` 12. 9. 2026 (`git reset --hard dev` + `npm run verze -- experiment`), nasazeno na <https://jouki.cz/aoe/experimental>; zatím bez vlastního pokusu, o 0.28.4 za `dev` |
| Migrace | 001–018, poslední `018_skryte_civilizace_vypnute.sql` (015 nikdy nevznikla); aplikují se samy při startu kontejneru (`CMD` v `Dockerfile`) |
| Testy | backend hermetické 286, databázové 154, frontend 233 — všechny zelené (9. 9. 2026 večer, databázové přes `/root/aoe-deploy/test-db.sh dev`) |
| Admini (`ADMIN_STEAM_ID` v Coolify) | 76561198014056480 (Jouki), 76561198147631465 (RobDiesALot), 76561198014710095 (Trokner / „Tonner“, vlastník repa) |
| `ZKUSEBNI_HRACI` | od 9. 9. 2026 **i na ostré** aplikaci (dřív jen dev) — na přání uživatele, ať jdou zkušební hráči a přetáčení času použít i na jouki.cz/aoe |
| Zkušební data | 9. 9. 2026 večer smazaná ze všech tří databází (ostrá 1 zápas, dev 8, experimental 2, k tomu přihlášky a řádky hráčů); záloha dotčených řádků v CSV je u uživatele v `Downloads\zaloha-zkusebni\`, ne v repu |
| Pracovní strom | čistý, žádná rozdělaná změna mimo repo |

Releasy do `main` proběhly: PR #4 (0.11.2, 7. 9. večer), PR #5 (0.16.0),
PR #6 (0.16.2), PR #7 (0.16.3), 0.17.0 jako hotfix, PR #9 (0.18.0, grafický
kabátek) a PR #11 (0.19.1) 8. 9.; PR #12 (0.24.37) a PR #13 (0.28.3) 9. 9.
Před releasem se na dosavadní `main` věší značka
`vX.Y.Z`; jak se podle ní vrátit zpátky, popisuje
[`docs/nasazeni-jouki-cz.md`](nasazeni-jouki-cz.md) §3.7.
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
dev; přes https se zkušební dveře samy zavírají — nesahat). Proměnnou
`ZKUSEBNI_HRACI` má od 9. 9. 2026 i ostrá aplikace, takže tlačítka jsou
i tam — samotný přepínač Debug na ně nestačí, frontend se ptá serveru
(`GET /api/nastaveni`).

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
(`verejneZapasy` v `web/src/zapas.ts`) i z režie. Výsledek zůstává
v databázi, nic se nemaže.

**Od 0.27.13 mizí úplně.** Do té doby se v Debug módu kreslil zašedlý,
s poznámkou „· zavřeno“ a tlačítkem „Znovu otevřít“ — jenže zabíral přesně
tolik místa jako předtím, takže křížek nic neuklidil. Uživatel: „křížek má
odebrat tu sekci, k čemu je kurva že se tam napíše ‚zavřeno‘ (výsledky
v DB zůstanou)“. Filtr `vRezii` proto zavřené zahazuje vždycky, prop
`ladeni` v `Rezie.tsx` zanikl a s ním i CSS `.zapas.zavreny`. Otevřít
zpátky jde pořád přes API (`{ zavreny: false }`) — jen na to není tlačítko.

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

### 3.11 Drobnosti a easter egg

- Štít se lvem (od uživatele 8. 9.) v záhlaví vlevo, 172 px,
  `web/src/assets/logo.webp`. Přesahuje přes levý konec praporce záporným
  okrajem a **vede na kanál Brohemians** v nové záložce (od 0.24.15).
- Kliknutí na „RobDiesALot“ v nadpisu přehraje `crashout.mp3`
  (`web/src/assets/crashout.mp3`, verze z 8. 9. — „Rob - Crashout.mp3“
  z uživatelovy složky zvuků). Bez autoplay práv ticho, žádná chyba.
- Georgia v čtverečcích: `lining-nums`. Nadpisy sekcí sjednocené na jednu
  velikost. Rovnoměrné velikosti křížků „×“.

### 3.12 Grafický kabátek (v `main` od 0.18.0)

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
- **GPT Image se použilo jen jednou**: uživatel jím 8. 9. večer opravil lva na
  praporcích v pozadí (dva ocasy), zdroj `_grafika/final/namesti_2560.png`,
  viz `grafika.md` §3. Všechno ostatní vzniklo lokálně na RTX 5090. Od 12. 9.
  platí: **editace hotového obrázku přes GPT Image v Codexu** (má nástroj
  `image_gen`, `codex exec -i obrázek`), nové obrázky lokálně; když není jasné,
  které z toho, zeptat se.
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
ve hře 1v1, ne 4hráčová mapa. Vydáno jako 0.17.1 do `dev` a do `main` spolu
s kabátkem v 0.18.0.

### 3.14 Historie zápasů v režii

**Záměr.** Uživatel doslova: „udělal bych že tahle historie (zápas 1 a 2) bude
až pod aktivním zápasem… a asi bych přidal ještě nadpis pro sekci Historie
zápasů“. Režie vypisovala všechny zápasy v jedné řadě, takže přes večer
dohrané kusy narůstaly nad rozehraným a tlačily ho z obrazovky.

**Jak to je.** `Rezie` nahoře vykresluje jen zápasy, které se hrají; dohrané
a zrušené jdou do sekce `HistorieZapasu` pod nadpis „Historie zápasů“, až za
vlastní kartu hráče. Jsou to tytéž karty, ne zkrácený výpis — Rob u nich
potřebuje přepsat výsledek a zavřít je křížkem. Dokud se nic nedohrálo, sekce
se nevykreslí. Rozhoduje sdílený predikát `jeVeHre()` ve `web/src/zapas.ts`,
který používá i `mojeZapasy()`.

**Zkrácené řádky adminovi zmizely.** Uživatel: „admin asi nemusí vidět tady ten
menší recap… je to prakticky stejný jako ta větší varianta. Klasický User to má
vidět, protože oni nevidí tu větší variantu.“ Sedí to: adminovi visí u každého
zápasu plná karta, takže `VerejnyZapas` pod ní říkal totéž podruhé. Ostatním
zůstává beze změny a v „User View“ si je Rob prohlédne taky. Vydáno v 0.19.0.

### 3.15 Aktivita přihlášek, pořadí sekcí a skok na nový zápas

**Kdo tu ještě je.** Uživatel: „přidejme mechaniku, že přihlášení uživatelé po
15 minutách automaticky ztmavnou a přesunou se na konec seznamu. Naopak
uživatelé u sebe uvidí tlačítko ‚Jsem tu!‘“. Večer se hlásí lidi, kteří pak
odejdou vařit, a Rob z tabulky nepozná, koho má smysl dát do zápasu.

Lhůty drží [`src/shared/aktivita.ts`](../src/shared/aktivita.ts) — patnáct
minut platnost, pět minut za kliknutí, nejmenší odstup mezi pulsy čtyři minuty
— aby server i prohlížeč počítaly s týmiž čísly. Uživatel je chce později
nechat nastavovat adminovi; zatím jsou pevné.

Sloupec `prihlaska.aktivni_do` říká, kdy hráč usne, `posledni_puls` drží odstup
mezi automatickými prodlouženími. `POST /api/akce/:id/jsem-tu` vrátí plnou
lhůtu, `POST /api/akce/:id/aktivita` je puls od kliknutí do stránky: vypršelou
lhůtu obnoví celou (opakovat to nevadí, výsledek je stejný), běžící prodlouží
o pět minut se stropem na plné lhůtě, a to nejvýš jednou za čtyři minuty.
Když se nic nezmění, stav se nerozesílá — puls tak nestojí nic.

**Usínání počítá prohlížeč.** Lhůta vyprší tichým během času, ne zápisem, který
by šel na serveru poznat a rozeslat. Kdyby o pořadí rozhodovalo SQL, hráč by
ztmavl až s příští zprávou ze serveru, klidně za půl hodiny. Tabulka proto tiká
vlastními hodinami (20 s) a řadí i stmívá sama; server posílá jen `aktivniDo`.

**V tabulce.** Spáč ztmavne, propadne na konec i v seřazeném seznamu a dostane
ve sloupci stavu „Zzz“ tam, kde mají hráči ve hře zkřížené meče. Vlastní usnulý
řádek nabízí místo ikony tlačítko „Jsem tu!“. Sloupec stavu se nově kreslí i
hráčům, ne jen v režii — spáče má vidět každý. Debug mód umí čas přetočit
o čtvrt hodiny (`POST /api/akce/:id/pretocit-cas`), jinak by se to zkoušelo
jen čekáním.

**Pořadí sekcí.** „Přihlášení hráči“ jsou nad panelem akce: kdo dorazil, se
čte dřív, než se z toho staví zápas.

**Skok na nový zápas.** Po „Vytvořit zápas“ se karta najede doprostřed
obrazovky. Zakládá se dole pod tabulkou, takže z ní do té doby nebyl vidět ani
kus. Karta nese `data-zapas`, `App` si po založení číslo pamatuje a posune se,
až zápas dorazí ve stavu.

### 3.16 Otisk zápasu pro budoucí archiv

**Otázka.** Uživatel: „ukládají se tyto zápasy (výsledky a všechno) do
databáze? abychom pak mohli udělat i archiv? (chtěl bych aby se tam ukládalo
uplně vše, datum, složení, veškeré nastavení atd. ohledně té hry)“.

**Co se ukládalo.** Zápas držel pořadí, název lobby, heslo, číslo lobby, stav,
vítěze, čas založení a dohrání, u účastníků tým, barvu, civilizaci, hosta,
pořadí a čas kliknutí na připojení. To všechno zůstává v databázi i po večeru.

**Co chybělo.** Nastavení lobby žije na akci (`akce.nastaveni_lobby`) a
přepisuje se každým kliknutím, takže po večeru zbyl jen jeho poslední stav —
u zápasu nešlo zjistit, na jaké mapě a s jakými pravidly se hrál. ELO hráče se
přepisuje při každém stažení statistik, takže by archiv u loňského zápasu
ukazoval dnešní čísla.

**Jak to je teď.** Migrace `014_archiv_zapasu.sql` přidává `zapas.nastaveni`
(snímek nastavení v okamžiku založení) a `ucastnik.elo_pri_zapasu`. Otisk se
bere v `createZapas`, v téže transakci jako zápas sám. Do přenosu stavu nic
z toho nejde — je to zásoba pro archiv, ne údaj pro stránku.

**Akce samotná** má v `akce` název, stav a `vytvorena` (datum), takže archiv
má co ukázat v záhlaví večera. Přejmenování název přepíše — historii jmen nikdo
nedrží a pro archiv to nevadí, večer se pojmenuje jednou nadobro.

**Co archivu pořád chybí** (až se bude stavět): obrazovka nad těmi daty,
a rozhodnutí, co se zrušenými zápasy — „Odebrat úplně“ je maže z databáze
natvrdo. Tabulka `udalost` ze schématu 001 existuje, ale nikdo do ní nezapisuje.

### 3.17 Historie pro hráče, sbalování a odchod ze stránky

**Historie i pro hráče.** Uživatel: „myslím že uživatelé mohou vidět taky tu
historii zápasu podobně jako admini… akorát s rozdílem že tam nebudou mít
možnost změnit výsledek a místo zavření budou mít tlačítko minimalizace“.
Karta zápasu je proto jedna pro obojí: `ZapasVRezii` bere `obsluha?: Obsluha`
a bez ní vykreslí totéž jen ke čtení — bez změny výsledku, bez zavírání, bez
přehazování hosta. Hráči tím zmizel zkrácený řádek u dohraných zápasů; zůstal
jen pro ty, které se hrají a divák u nich nemá vlastní kartu.

**Sbalení** má každý u dohraného i zrušeného zápasu: nechá vidět hlavičku.
Rohová tlačítka (sbalit, zavřít) jsou v jednom pruhu `.ovladani-karty`, aby
se neumisťovala podle toho, jestli křížek zrovna je.

**Vítěz** dohraného zápasu má zlatý odznak vedle jména a teplejší řádek.
Rozhoduje `jeVitez()` ve `web/src/zapas.ts` — výsledek je buď tým, nebo jeden
hráč, podle toho, jak ho Rob zapsal.

**Tlačítka nad tabulkou** jdou zleva od nejméně vážného: přetočení času (debug),
vlastní přihláška, „Ukončit akci“. To poslední se sem přestěhovalo ze záhlaví
panelu akce; potvrzení i znění zůstaly.

**Odchod ze stránky.** Uživatel: „je možnost udělat, že když uživatel zavře
stránku, tak ho to automaticky odhlásí z akce…? (myslím akci, ne samotný
account)“. Ano, ale ne přes `beforeunload` — ta se pouští i při obnovení
stránky a odhlásila by každého, kdo si dá F5. Hlídá se to podle SSE spojení
(`src/realtime/pritomnost.ts`): počítají se otevřené streamy na hráče a teprve
když spadne poslední, běží odklad 90 s. Obnovení stránky i krátký výpadek sítě
se do odkladu vejdou a odhlášení zruší. Restart serveru mapu vyprázdní, takže
po nasazení se neodhlásí nikdo — chyba na bezpečnou stranu.

### 3.18 Záhlaví: praporec vcelku, štít jako odkaz, název akce jako tlačítko

**Praporec.** Do 0.24.3 byl skládaný z krajních dílů a dlaždicovaného středu
(`border-image`). Ať se dlaždice udělala jakkoliv, na šířku hlavičky bylo vidět,
kde začíná a končí, a látka se svisle mačkala podle výšky nadpisu. Od 0.24.4
visí obrázek vcelku, v poměru předlohy: prvek nese `aspect-ratio`, kreslí se
přes `contain` (to nedeformuje, ať má box jakýkoliv tvar) a `box-sizing:
border-box`, jinak by se odsazení přičetlo k výšce spočítané z poměru.

Obrázek je oříznutý na kresbu (1962 × 444). Předtím měl nad látkou 116 px
prázdného plátna a pod ní 82 px — a přesně to se dorovnávalo ručním posunem.
Šířka je zastropovaná na 860 px, jinak by praporec na širokém monitoru vyrostl
přes půl obrazovky. Text sedí v látce podle poměru, ne v pixelech: bordura je
na 61,7 % výšky, tyč zabírá vršek, takže střed nápisu vychází ve 45 % té
vzdálenosti a drží v každé velikosti.

**Štít** vede na kanál Brohemians v nové záložce (rozehraný večer se nemá
zavírat kvůli prokliku). Přesahuje přes levý konec praporce záporným okrajem,
takže zůstává v toku a nic pod ním nepřeskakuje.

**Název akce** stojí od 0.24.11 nad tabulkou přihlášených, ne v panelu akce:
patří celému večeru, ne nastavení hry. Vidí ho všichni; adminovi je celý nadpis
tlačítkem, které ho promění v pole. Tužka vedle textu se objeví pod kurzorem
a je klikací taky. Panel akce se místo toho jmenuje „Nastavení Lobby“ a stejný
nadpis uvnitř sloupce s nastavením odešel — říkal totéž podruhé.

Pole pro přejmenování roste s textem (šířku drží neviditelná kopie nápisu)
a je vyrovnané tak, aby se při přepnutí nehnul ani text, ani zbytek stránky:
záporný svislý okraj bere zpátky jeho odsazení a rámeček (naměřeno 8,38 px),
záporný levý sedí na tomtéž vytažení, jaké má rámeček pod kurzorem.

### 3.19 Sloupec stavu: odpočet, „Zzz“, meče a bublina

Poslední dva sloupce tabulky přihlášených jsou oddělené schválně. V jednom by
šířka tlačítka „Jsem tu!“ odsouvala odpočet a sloupec by se řádek od řádku
neshodoval; a sloupec s tlačítkem má pevnou šířku, jinak by se při jeho
objevení roztáhl z 20 na 91 px a posunul všechny ostatní.

Značka je vždycky jedna ze tří a stojí na stejném místě: zkřížené meče (hraje
zápas), odpočet, nebo „Zzz“. Odpočet vidí hráč u sebe a admin u všech —
potřebuje přehled, kdo za chvíli usne. Minuty jsou na dvě číslice, aby se
šířka buňky s každou vteřinou neměnila.

**Bublina** je vlastní (`.napoveda`, text v `data-napoveda`), ne systémový
`title`: ta systémová čeká vteřinu a vypadá jako z jiné stránky. U spáče říká,
jak dlouho je pryč.

### 3.20 Animace: přejezd řádků a výška panelu

**Řádky** přejíždějí na nové místo technikou FLIP: ve stejném snímku, ve kterém
React vykreslil nové pořadí, se řádek vrátí tam, kde byl, a nechá se dojet.
Měří se poloha **vůči tabulce**, ne vůči oknu ani stránce — jinak se do uložené
polohy promítne odrolování nebo cokoliv, co se nad tabulkou objeví, a řádek pak
odlétá mimo seznam. Pojistkou je i zábradlí: posun delší než celá tabulka je
známka staré polohy a animace se vynechá.

Přejíždí se **jen přeskládání**. Když hráč přibude nebo zmizí, posunou se řádky
z docela jiného důvodu a přejezd z toho dělal poskakující zmatek.

**Výška panelu** přihlášených se při výběru hráče do sestavy zkracuje plynule
(`web/src/vyska.ts`, 200 ms). Měří se spočtená výška, ne obalový obdélník:
panel je `content-box` a jeho obdélník nese i 34px rám, takže dosadit jedno za
druhé znamenalo pustit přejezd o 80 px vedle.

Obojí respektuje `prefers-reduced-motion` a při tažení řádku myší se animace
vynechá.

---

### 3.20 AI v sestavě (od 0.25.0, 9. 9. 2026)

**Záměr uživatele doslova:** „když kliknu přidat AI button, tak se v lobby
objeví pseudo hráč, bude se jmenovat AI a všechno ostatní bude fungovat jak
u normálního hráče (jen se jí nebude zobrazovat elo tabulka při najetí,
protože AI nemá žádné elo)“. AI je **legitimní hráč**, ne berlička jako
zkušební: „kdyby Admin chtěl utvořit hru proti AI, ať je to možné“.

**Jak to je.** Tlačítko `+ AI` na řádku „Pořadí hráčů můžeš přetáhnout
myší“ posadí do sestavy počítač. Odtud se chová jako každý jiný účastník:
barva, tým, civilizace, přetahování, výsledek zápasu, archiv i historie.
Karta se statistikami se u něj neukáže a do součtu ELO týmu nevstupuje —
nepíše se ani mezi „bez ELO“, protože tam patří lidi, kterým se statistiky
nestáhly, a to je jiná informace.

**Identita.** `src/shared/aiHraci.ts`: sedm kusů `ai:1`…`ai:7`, všechny se
jménem „AI“ (rozlišuje je barva a slot, jako ve hře; číslo je jen v id, aby
šlo přidat víc AI naráz — sestava dvakrát totéž id nepustí). Prefix `ai:`
je stejný trik jako `test:` u zkušebních. Řádek v `player` si zakládá sám
`createZapas` ze sdíleného seznamu — **žádný seed v migraci**, aby jméno
nebylo v repu na dvou místech a nemohlo se rozejít.

**Tři místa, která předpokládala „účastník = přihlášený člověk“:**
1. `createZapas` (`db/matches.ts`) — kontrola „už není přihlášený“ AI
   přeskočí; AI se do akce nehlásí.
2. `sestavSedadla` (`matches/composition.ts`) — host se vybírá jen mezi
   lidmi. Lobby zakládá někdo, kdo sedí u hry.
3. `zkontrolujLobby` (`shared/lobbyKontrola.ts`) — porovnávají se jen lidé
   a k řádku „Hráči“ se připíše `(+ N AI neověřeno)`.

**AI Difficulty.** Přidání *první* AI blikne na políčko `aiObtiznost`
(stejné `blikni()` jako po Ctrl+Z), pokud je na „–“. Bez AI v lobby na
obtížnosti nezáleží, s AI ano; nastavit stupeň musí admin sám.

**Kontrola AI (dodělané v 0.25.6).** Původně se AI z kontroly vyřadila
s dovětkem „+ N AI neověřeno“, protože se zdálo, že ji hra v datech
neukazuje. Živá lobby 9. 9. 2026 ukázala opak: AI má `profileInfo.id` −1
jako prázdný slot, ale `status` 2 (člověk 0, prázdno 1) a vyplněná
metadata. Kontrola ji proto ověřuje jako člověka — počet, barvu i tým.
Rozlišit dvě AI mezi sebou nejde (nemají id), takže se páruje podle barvy:
napřed AI, které barvu ze sestavy mají, zbylé v pořadí.

### 3.21 Zkušební hráči se mažou, ne odhlašují (od 0.25.1, 9. 9. 2026)

**Záměr uživatele doslova:** „zkušební lidi se odstraní v momentě kdy
kliknu na odstranit zkušební hráče, tak se prostě smažou všude (a všechny
jejich hry s tím, včetně těch kde je reálný hráč, prostě jakmile je tam
přítomen zkušební hráč, tak se jejich hra/záznam o hře smaže taky)“.

**Jak to bylo.** `withdraw()` jen přepsal `prihlaska.stav` na `odhlasen`.
Zápasy, řádky v `player` i vše ostatní zůstávalo — historie se plnila
hrami, které nic nedokazují.

**Jak to je.** `smazZkusebniHrace()` (`db/events.ts`) v jedné transakci
smaže zápasy, ve kterých zkušební hráč seděl (**i dohrané, i ty s reálnými
lidmi**), jejich události, přihlášky a řádky v `player`. Zápasů bez
zkušebního hráče se to nedotkne. Pořadí kroků je dané cizími klíči:
`ucastnik.steam_id` ani `udalost.kdo` nemají `ON DELETE`, takže `player`
nemůže jít první. Vrací počet zkušebních, kteří byli v akci přihlášení.

**Proč to nevadí.** Zkušební hráči nejsou náhodní — je to pevný seznam
v `matches/zkusebniHraci.ts`, DB řádky jsou jen jeho otisk. Po smazání se
příště založí znovu se stejnými čísly.

### 3.23 Čísla režimů opravená, Empire Wars zamyká zaškrtávátko (0.25.5)

**Nalezená vada.** Tabulka `REZIMY` (Game Mode, `options[5]`) byla převzatá
z aoe2.net a od čtyřky výš seděla o jedna vedle: „King of the Hill“ mělo 4
místo 5, „Capture the Relic“ posílalo 8, což je ve hře Turbo Random Map, a
režimy 1 (Regicide), 11 (Sudden Death), 12 (Battle Royale) a 13 (Empire
Wars) chyběly úplně. Kontrola lobby proto u těchhle režimů hlásila cizí
jméno a Rob nastavoval jiný režim, než vybral.

**Jak se to ověřilo.** Čísla jsou z herního `OptionsGameMode` (Control API
hry) — dva nezávislé zdroje, a sedí i s živým seznamem lobby, kde běžely
režimy 1 a 13, které stará tabulka neznala. Zapsáno v
`docs/analyza-automaticke-hledani-lobby.md` §6.

**Empire Wars.** Uživatel: „když se vybere Game Mode Empire wars, tak se
natvrdo odškrtne v advanced settings Empire Wars mode a deaktivuje se — 
v tomto modu toto nastavení je natvrdo takhle nastavené, tak potřebuju aby
to zrcadlilo chování ve hře.“ Výběr režimu 13 (`REZIM_EMPIRE_WARS`) proto
nastaví `empireWars: false` a zaškrtávátko zašedne — stejný vzor jako
Team Positions bez Team Together. Odchod z režimu ho zase odemkne.

**Ověřeno naživo (9. 9. 2026, vlastní lobby uživatele).** Empire Wars je
opravdu režim 13 a `89` u něj zůstává `n`. Navíc se ukázalo, že režim
přehodí i `Starting Age` na Feudal a `Victory` na Standard — panel to od
0.25.6 dělá taky. Při odchodu z režimu se nic nevrací, stejně jako ve hře.

**Co všechno Empire Wars přepne (ověřeno 9. 9. 2026).** Kromě věku a
vítězství odškrtne i modifikátory hry: Regicide, Allow Cheats, Turbo Mode,
Full Tech Tree a Sudden Death. Antiquity nechá být. Zamčené zůstane jedině
zaškrtávátko Empire Wars — ostatní jdou po přepnutí dál měnit, takže je
panel taky nezamyká.

**Opravené číselníky (0.25.6).** Proti témuž zdroji se prošla všechna
nastavení a našly se další tři vady: **Extreme u AI obtížnosti je −1, ne
5**; `Reveal Map` žádné „No Fog“ (3) nemá; `Victory` zná i Time Limit (7),
Score (8) a Last Man Standing (11), `Resources` i Random (6) a velikosti
map i Ludicrous (480).

**Nedodělané.** Stejnou vazbu by nejspíš chtěly i režimy Regicide (1) a
Sudden Death (11), které mají v Advanced Settings vlastní zaškrtávátko.
Uživatel žádal jen Empire Wars a jestli se hra chová u ostatních dvou
stejně, nebylo ověřeno — stejně tak není jasné, jestli je odškrtnutí
modifikátorů vlastnost Empire Wars, nebo to hra dělá při každé změně Game
Mode. Neověřené zůstávají hodnoty číselníků, které se v lobby zatím
neobjevily (Ludicrous, Random suroviny, Time Limit / Score / Last Man
Standing); Extreme = −1 ověřené 9. 9. 2026 je.

### 3.22 Preset lobby schovaný (od 0.25.2, 9. 9. 2026)

Tlačítka „Uložit preset lobby“ a „Načíst uložený preset“ jsou schovaná
konstantou `PRESETY_VIDET` v `NastaveniLobby.tsx` — ne smazaná. Server obě
cesty (`onUlozit`, `ulozene`) umí dál, takže se vrací přepnutím jedné
konstanty. „Reset nastavení“ zůstal. Důvod: nastavení žije na akci a drží
se mezi večery samo, takže snímek nikdy nic nepřidal.

### 3.24 Pre-Lobby nastavení: modální okno a jeho závažnosti (0.26.0–0.28.1)

**Záměr.** Okno „Create Lobby“ ve hře se nastavuje **před** založením lobby
a po založení už s ním nejde hnout. Rob si ho tedy musí naklikat správně
napoprvé — a web mu má napřed říct, co tam má nastavit, a pak zkontrolovat,
že to tak opravdu je.

**Kde to je.** Tlačítko „Pre-Lobby Nastavení“ je v záhlaví panelu vedle
nadpisu „Nastavení Lobby“; otevře **modální okno** (`PreLobby.tsx`,
`.prelobby-stin` přes celou obrazovku, zavírá Escape i kliknutí mimo).
Není to další sloupec v panelu schválně: zakládání lobby je jeden krok
mimo běžné nastavování hry a řeší se jednou za večer. Nadpis okna je
„Create Lobby Nastavení“, křížek čtvercový v úrovni nadpisu.

**Co okno nese.** Řádek po řádku podle hry: Lobby Name (jméno příští
lobby, jen ke čtení), Lobby Type, Visibility, Players, Co-Op Campaign,
věta „These Settings can not be changed after game creation.“, Set
Password s kostkou na přegenerování, Allow Spectators, Hide Civilizations,
Spectator Delay, Server, Data Mod. Hodnoty nabídek jsou odečtené z herní
nabídky (9. 9. 2026) včetně pořadí serverů; „–“ znamená „je to jedno“
stejně jako v panelu.

**Heslo vzniká dopředu (0.26.0, migrace 016 + 017).** Sloupec
`akce.pristi_heslo` drží heslo pro **příští** lobby, takže ho jde ukázat
dřív, než zápas vůbec vznikne. `createZapas` si ho vezme a rovnou uloží
nové; kostka v okně volá `pripravPristiHeslo`. Migrace 017 doplnila heslo
akcím, které už existovaly.

**Závažnosti (0.26.5, 0.27.17, 0.28.0).** Nejsou stejné pro všechno:

| Volba | Pravidlo |
|---|---|
| Visibility | Public napevno. Private jde vybrat, ale hned se vrátí zpátky, řádek se zatřese, nad formulářem se objeví „A tak jseš debil, nebo co?“ a od 0.27.11 se k tomu přehraje `debil.mp3` |
| Allow Spectators | jen zapnuto/vypnuto, výchozí zapnuto; odškrtnout nejde — odmítne to stejně jako Private (Rob vysílá, bez diváků by neměl kdo koukat) |
| Hide Civilizations | tři stavy jako v panelu, výchozí **odškrtnuto** (se skrytými civilizacemi nemá komentář o čem) |
| Players | výchozí 2, rozdíl je jen upozornění |
| Spectator Delay | výchozí None; do 3 minut upozornění, od 4 chyba (komentář utíká hře) |
| Server | výchozí „Default“; ostatní podle tabulky `KVALITA_SERVERU` — zelené upozornění, žluté a červené chyba |
| Lobby Type | Unranked, jiná hodnota je chyba |
| Data Mod | „Definitive Set“, hra jinou možnost nemá |

**Uložené `null` z dřívějška (0.28.0, migrace 018).** Diváci i skryté
civilizace bývaly tříbodové, takže akce z té doby mají v nastavení `null`.
`doplnNastaveni` vyplňuje jen chybějící klíče, ne prázdné hodnoty —
u diváků se proto `null` srovná na zapnuto rovnou při čtení (jiná poloha
stejně není přípustná), u civilizací by ale přepis při čtení zabil možnost
zvolit „je to jedno“, tak to jednorázově srovnala migrace.

**Zamítnuto.** Vlastní panel místo modálu (uživatel: „Jak jsem říkal chci
to jako MODÁLNÍ OKNO!“) a přebírání hesla z předchozí lobby — hra si
heslo nikam necachuje, což byla chybná domněnka agenta, kterou uživatel
vyvrátil.

### 3.25 Okno Create Lobby postavené z herních dílů (0.27.0–0.28.x)

**Záměr.** Host má před sebou vidět **přesně to, co uvidí ve hře**, jen
s vyplněnými hodnotami — aby jen opisoval. Do 9. 9. 2026 tu byl snímek
obrazovky s přebitými třemi poli (`web/src/assets/create-lobby.webp`,
v repu zůstal); jenže když režie změnila třeba server nebo zpoždění
diváků, snímek dál tvrdil své.

**Jak to je.** `OknoCreateLobby.tsx` a blok `.okno-lobby*` ve `styl.css`.
Okno je jen obrázek k opsání, ne formulář — nastavuje se v `PreLobby.tsx`.
Klikací je jedině jméno a heslo (`Kopirovatelne`); od 0.27.19 se pole při
najetí rozsvítí (podbarvit je nejde, vnitřek kreslí `fill` z `border-image`).

**Herní díly.** Pergamen, ozdoba záhlaví, rozbalovátko, šipka,
zaškrtávátka, křížek, rám a vstupní pole — všechno z
`AoE2DE\widgetui\textures`, seznam a příkazy jsou v
[`docs/grafika.md`](grafika.md). Písmo je **Times Ten** (hra v XAML
předepisuje Times New Roman; Book Antiqua je tam jen zakomentovaná
z dřívějška), ořezané `fontTools` na 26 kB. Sazba má pevných 19 px, popisky
21 px a text zesiluje stín o půl pixelu vedle sebe ve vlastní barvě
(u zelených polí zeleně) — hra sází tučněji, než jaký řez písma je k mání.

**Který pergamen (0.27.16).** Původně `popup_menu_bg_large.png`, což je
jiný list. Správný se našel měřením: ze snímku ze hry se vytáhla silueta
okna (jasový práh plus teplota barvy) a porovnala se sloupec po sloupci
s alfa maskou každého kandidáta — `popup_menu_bg_small.png` má na spodním
okraji korelaci 0,94 a na pravém 0,88, ostatní zůstaly pod 0,5. Poznávací
znamení je zub na spodním okraji.

**Rám a jeho výplň (0.27.12, vráceno).** Rám je `boxstyle2_*` — devět dílů
64×64 složených `mrizka.py` do mřížky 3×3. Uvnitř dílů je **neprůhledná
šedá 67,67,67**, což je vnitřek krabice pro tmavé menu; v okně přebíjí
pergamenovou desku. `mrizka.py --klic 67` ji odstraní a tmavší přechod pod
zlatem převede na poloprůhledný stín. Nasazený rám ji zatím **má** —
uživatel si ho ladí ve Photoshopu (podklady dostal do `Downloads`).
Devítidílných rámů je ve hře osm; přehled je v `docs/grafika.md`.

**Náhledová stránka.** `web/nahled/okno.html` (mimo build) vykreslí okno
i modál nad ním; `?bezmodalu` modál vypne. Slouží k porovnání se snímkem
ze hry přes headless Chrome, bez přihlášení jako admin.

**Poučení.** Většina kol tady byla o tom, že se udělalo něco jiného, než co
bylo v zadání: zvětšila se pole místo písma, ztenčil rám místo zesílení,
postavil panel místo modálu. Rozměry, které uživatel odečte v DevTools,
jsou vždycky rychlejší cesta než odhad.

### 3.26 Kontrola lobby: tři sekce, Players ze slotů, skloňování (0.26.3–0.28.3)

**Tři sekce.** Pre-Lobby (první, rozbalená), Nastavení Lobby a Další
nastavení; všechny tři kreslí jedna komponenta `Sekce`
(`KontrolaLobby.tsx`), jen „Další nastavení“ si pamatuje, že je sbalené.
Hlavní sekce dostala vlastní záhlaví až v 0.28.2 — do té doby visela pod
tlačítkem jako volný seznam.

**Players jsou sloty, ne `maxplayers` (0.26.8, 0.28.3).** `maxplayers`
v inzerátu je vždycky 8. Skutečný počet je kolik slotů **není zavřených**
(`status !== 1`). Co bylo v okně Create Lobby navolené, hra neposílá
vůbec: napříč 83 živými lobby nesedí žádný klíč `options` s počtem
otevřených slotů líp než náhodou. Rozdíl proti zápasu jsou tedy prázdné
otevřené sloty, do kterých může vlézt kdokoliv — řádek to od 0.28.3 říká
naplno: „Players: 4, má být 2 (2 sloty jsou prázdné a otevřené — zavři je
ve hře)“. Zůstává upozornění, ne chyba.

**Skloňování a barvy (0.28.1).** „má mít modrá“ znělo jako nákupní
seznam; obě barvy v té větě jsou předmět, takže se berou ze čtvrtého pádu
(`BARVA_KOHO_CO` v `shared/types.ts` — osm barev, tabulka je levnější než
pravidla). Barva 6 se navíc jmenovala fialová, ačkoliv je ve hře růžová
(`#f955af`); přejmenovala se i se svým odstínem na webu (`--b6: #e055a8`).

**Barva v 1v1 (0.26.4).** Ve dvou hráčích na barvě nezáleží, takže je to
jen upozornění; číslo týmu vadí, jen když ho mají oba stejné.

### 3.27 Zkušební hráči, AI a úklid dat (0.25.0–0.25.1, úklid 9. 9. 2026)

Doplněk k §3.20 a §3.21: „Odebrat zkušební“ maže zkušební hráče **všude**
— zápasy, ve kterých seděli (včetně dohraných a včetně těch, kde vedle nich
hráli skuteční lidé), jejich události, přihlášky a nakonec řádky hráčů,
v jedné transakci (`smazZkusebniHrace`). Pořadí kroků je dané cizími klíči.

**9. 9. 2026 večer** se totéž pustilo ručně proti všem třem databázím
(`DELETE ... WHERE steam_id LIKE 'test:%'`), protože zkušební data
zůstávala z dřívějška: ostrá 1 zápas a 5 hráčů, dev 8 zápasů a 6 hráčů,
experimental 2 zápasy a 5 hráčů. Dotčené řádky se předtím stáhly do CSV
(u uživatele, ne v repu). AI hráčů (`ai:*`) se tenhle úklid netýká — jsou
to plnohodnotní hráči a jejich zápasy mají zůstat.

---

### 3.28 Zkušební pozadí s dvouocasými lvy (0.28.4, 12. 9. 2026)

**Odkud.** Zkouška napojení na Codex (GPT Image) — postup a poučení v
`grafika.md` §3 „Dvouocasý lev“ a v paměti. Lvi na praporcích jsou překreslení
podle státního znaku (anatomie, dva ocasy, všichni natočení do náměstí) a pak
o krok zhrubnutí, aby vypadali jako stará výšivka. Čtyři kola: erbovní
(příliš čistý), zkroucený ocas (dlouhý prompt s „intertwine“), čistý se
správným ocasem, a nakonec zhrubnutý — ten je v repu.

**Co je v kódu.** `web/src/assets/ui/pozadi-nove.webp` (99 kB, 1672×941)
vedle původního `pozadi.webp`; třída `pozadi-nove` na `<html>` přepne
`background-image` (`styl.css`). Admin ji přepíná v patičce přepínačem
„Nové lvy“, který je vidět jen v debug módu; volba je v `localStorage`
(`rezie.pozadi-nove`) jako ostatní přepínače. Test v `App.test.tsx`.

**Zdroje mimo repo.** `_grafika/final/pozadi_lvi_codex_v4.png` (vstup pro
export) a všechna čtyři kola ve scratchpadu session (`codex-lev/`), prompty
`prompt.txt`–`prompt4.txt` tamtéž; relace Codexu v `~/.codex/sessions/2026/09/12/`.

**Co se rozhodne.** Které pozadí zůstane — pak druhý soubor, třída i přepínač
zmizí (viz §5).

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

**Doplněno 9. 9. 2026 (měřeno na živých lobby).**

| Co | Stav |
|---|---|
| `options[96]` = `passwordprotected`, ne Hide Civilizations | ověřeno pokusem: tři lobby bez hesla měly `n`, tatáž lobby s heslem `y`; statisticky sedí přes 112 lobby |
| `options[85]` = Hide Civilizations | ověřeno přepnutím tam a zpět na vlastní lobby |
| `maxplayers` je vždycky 8 | ověřeno; skutečný počet je počet slotů se `status !== 1` |
| Počet hráčů z okna Create Lobby | v `options` **není** — napříč 83 lobby žádný klíč nesedí s počtem otevřených slotů (§3.26) |
| `status` slotu: 0 = otevřený (i obsazený člověkem), 1 = zavřený, 2 = AI | ověřeno |
| Pre-lobby pole přímo v inzerátu: `matchtype_id`, `visible`, `observerdelay`, `relayserver_region` | ověřeno |
| Herní panel může ukazovat něco jiného, než co lobby inzeruje | pozorováno u Lock Teams: hra si po přepnutí režimu nechala zaškrtnuté políčko, ale posílala vypnuto. Není to zpoždění přenosu — jedno přepnutí se propsalo okamžitě |

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
6. **Archiv odehraných večerů** (uživatel 9. 9.): procházet akce a v nich
   zápasy s kompletním nastavením, týmy a civilizacemi. Data pro to od 0.21.0
   v databázi jsou — viz §3.16, včetně toho, co ještě chybí. Obrazovka
   navržená není.
7. **Rám okna Create Lobby doladit ve Photoshopu** (uživatel 9. 9. večer):
   podklady dostal — nasazená verze, varianta s odklíčovanou šedou výplní
   a devět původních dílů ze hry. Až vrátí upravený obrázek, převede se
   `nastroje/grafika/export.py` do `web/src/assets/ui/lobby-ram.webp`;
   musí zůstat 66×66 a dělený na třetiny, jinak přestane sedět `slice`.
8. **Vazba režimu na zaškrtávátko u Regicide a Sudden Death** je hotová
   (§3.23), ale **nezjistilo se**, jestli odškrtnutí modifikátorů dělá
   Empire Wars, nebo hra při každé změně Game Mode.
9. **Zavřený zápas znovu otevřít z UI** — od 0.27.13 to jde jedině přes
   API. Kdyby to někdy chybělo, tlačítko patří jinam než do režie (třeba
   do archivu z bodu 6).
7. **Lhůty aktivity nastavitelné adminem** (uživatel 8. 9.): dnes je patnáct
   minut, pět za kliknutí a čtyřminutový odstup pevně v `shared/aktivita.ts`.
   Práh pro „Jsem tu!“ se z lhůty už počítá, takže se změní jedním číslem.
8. **Vlastní rozbalovací seznam místo `<select>`** (uživatel 8. 9.: „prostě
   jsi měl udělat ul li seznamy, které by se chovali identicky, ale to teď
   nedělejme“). Nativní `<select>` neumí obarvit zvýraznění položky a
   `appearance: base-select` se neosvědčilo (viz komentář v `styl.css`).

10. **Které pozadí zůstane** (od 0.28.4, §3.28): původní lvi z GPT Image
    z 8. 9., nebo překreslení podle státního znaku z 12. 9.? Uživatel si je
    porovnává přepínačem „Nové lvy“ v debug módu. Po rozhodnutí smazat druhý
    webp, třídu `pozadi-nove` a přepínač.

Drobné známé nedodělky:

- Lišta nové verze pomůže až stránkám od 0.16.0; starší si lidé obnoví sami.
- `docs/analyza-projektu.md` je snímek k 6. 9. (0.1.0) — architektura platí,
  ale čísla (počty testů, migrací, řádků) a část API jsou zastaralé. Sekce
  o rizicích stojí za přečtení pořád.
- README obsahuje starší sekce o tunelu a nasazení u Roba
  (`docs/nasazeni-u-roba.md`), které se od nasazení na jouki.cz nepoužívají,
  ale nejsou špatně.

---

## 6. Historie verzí (7.–9. 9. 2026)

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
| 0.16.4-16.4 | 8. 9. ~01:30 | Založena větev `experimental`, verzování `X.Y.Z-A.B` |
| 0.16.4-16.x | 02:00–19:00 | Grafický kabátek: paleta z loga, pozadí, rámy, praporec, ozdoby, písmo Cinzel; dvě kola připomínek |
| 0.17.0 | 19:30 | Hotfix: žádný strop hráčů na barvě ani v týmu; **release do `main`** |
| 0.17.1 | 19:40 | Velikost mapy podle unikátních barev, ne podle hlav |
| 0.18.0 | 20:49 | Sloučení kabátku do `dev`; **release PR #9** |
| 0.18.1 | 20:57 | Čitelnost obou řádků tlačítka Spectate; **release** |
| 0.19.0 | 21:13 | Dohrané zápasy pod běžící, sekce „Historie zápasů“ |
| 0.19.1 | 21:18 | Tmavý reliéf na zašedlém Spectate; **release PR #11** |
| 0.20.0 | 22:01 | Lhůta aktivity přihlášek, „Jsem tu!“, tabulka nad panel, skok na nový zápas (migrace 013) |
| 0.21.0 | 22:18 | Otisk nastavení a ELO k zápasu (migrace 014), vlastní řádek zvýrazněný, tlačítka do hlavičky |
| 0.22.0 | 22:48 | Historie zápasů i pro hráče, sbalování karty, odchod ze stránky odhlašuje z akce |
| 0.22.1 | 23:00 | „Ukončit akci“ nad panel, přejezd řádků při usínání |
| 0.22.2 | 23:15 | Rám, praporec a oddělovač odklíčované přes Scenario |
| 0.23.0 | 23:20 | Vlastní odpočet u hráče, „Jsem tu!“ už minutu po obnovení |
| 0.23.1 | 23:24 | Lock Teams zapnutý ve výchozím presetu |
| 0.23.2 | 23:30 | Prohlubeň panelu lícuje s rámem; oprava odlétajících řádků |
| 0.23.3 | 23:40 | Praporec: srovnat tón, ne kresbu; posun času po minutě |
| 0.24.0 | 23:45 | Přejmenování akce |
| 0.24.1–0.24.3 | 23:47–23:55 | Odpočet nehýbe sloupcem; tužka tlumená; tón praporce |
| 0.24.4–0.24.10 | 9. 9. 00:03–00:51 | Praporec vcelku a bez deformace, ořez plátna, kompozice záhlaví, odstupy nadpisu |
| 0.24.11–0.24.16 | 01:01–01:23 | Název akce nad tabulku a klikací, panel „Nastavení Lobby“, štít 172 px a odkaz na kanál, rostoucí pole |
| 0.24.17–0.24.24 | 01:27–01:48 | Pořadí ve stavovém sloupci, hover nadpisu, zkušební tlačítka nahoru, `bez-vzhledu` místo přebíjení |
| 0.24.25–0.24.30 | 01:50–02:11 | Pole neposouvá stránku, stín ozdob v panelech, sloupce se nehýbou, vlastní bublina |
| 0.24.31–0.24.37 | 02:13–02:31 | Opravy animací (FLIP vůči tabulce, jen přeskládání, výška v content-boxu), kratší hlášky; **release PR #12 (0.24.37)** |
| 0.24.38 | 9. 9. 11:24 | Načtení presetu před Reset (pořadí tlačítek) |
| 0.25.0 | 11:41 | AI v sestavě: tlačítko `+ AI`, sedm `ai:1`…`ai:7`, host jen z lidí, kontrola lobby počítá jen lidi, blikání AI Difficulty (§3.20) |
| 0.25.1 | 11:41 | Zkušební hráči se mažou včetně svých zápasů a řádků v `player` (§3.21) |
| 0.25.2 | 11:41 | Tlačítka presetu schovaná konstantou `PRESETY_VIDET` (§3.22) |
| 0.25.3 | 11:47 | Úklid nepoužitého importu |
| 0.25.4 | 11:58 | Tlačítko `+ AI` vycentrované vůči textu vedle |
| 0.25.5 | 12:07 | Opravená čísla režimů (byla o jedna vedle) a Empire Wars zamyká svoje zaškrtávátko (§3.23) |
| 0.25.6 | 12:35 | Kontrola ověřuje AI sloty (status 2), opravené číselníky (Extreme = −1 a další), Empire Wars nasadí i Feudal a Standard victory (§3.20, §3.23) |
| 0.25.7 | 12:52 | Empire Wars odškrtne i Regicide, cheaty, Turbo, Full Tech Tree a Sudden Death; Extreme = −1 ověřené naživo |
| 0.25.8 | 13:05 | Treaty Length je nabídka jako ve hře (po pěti do 60, pak 90), ne volné číslo — hlídá to i server |
| 0.25.9 | 13:20 | Režim Regicide zamyká svoje zaškrtávátko stejně jako Empire Wars (vazba zobecněná do `ZASKRTAVATKO_REZIMU`) |
| 0.25.10 | 13:35 | Sudden Death taky zamyká svoje zaškrtávátko a nasazuje Conquest; nastavení podle režimu je tabulka `NASTAVENI_REZIMU`. Ludicrous (480) ověřený naživo |
| 0.25.11 | 14:05 | „Vyhrála AI“ místo „Vyhrál AI“ (AI je česky rodu ženského) |
| 0.25.12 | 14:15 | Population je nabídka jako ve hře (po 25 do 250, pak po stovkách do 500) |
| 0.25.13 | 14:40 | Server přijme i Time Limit, Score a Last Man Standing — dřív je zahodil a výběr se sám přepnul zpátky |
| 0.25.14 | 14:55 | Přepínače Civilization Set přes celou šířku; čtení pre-lobby polí z inzerátu |
| 0.26.0 | 15:20 | Heslo příští lobby vzniká dopředu u akce (migrace 016), zápas si ho vezme |
| 0.26.1 | 15:45 | Pre-Lobby jako modální okno podle herního „Create Lobby“ |
| 0.26.2 | 16:05 | Mřížka okna, tmavší pozadí, monochromatická kostka, výchozí Unranked / None / Definitive Set / Co-Op vypnutá (migrace 017) |
| 0.26.3 | 16:30 | Kontrola dostala sekci Pre-Lobby; heslo a diváci se do ní přesunuli z hlavní |
| 0.26.4 | 16:45 | Barva v 1v1 je jen upozornění |
| 0.26.5 | 17:10 | Pre-Lobby: Public napevno (Private vynadá a zatřese), výchozí 2 hráči a Default server, závažnosti podle zpoždění a kvality serveru |
| 0.26.6 | 16:17 | Pre-Lobby je v kontrole první a rozbalená |
| 0.26.7 | 16:19 | Vykřičník upozornění zarovnaný jako ostatní značky a tučnější |
| 0.26.8 | 16:22 | Players se čtou z nezavřených slotů — `maxplayers` je vždycky 8 |
| 0.26.9 | 16:29 | Nadpisy panelů odsazené za rám |
| 0.27.0 | 16:45 | Okno Create Lobby postavené z herních dílů místo snímku obrazovky |
| 0.27.1–0.27.10 | 17:00–19:51 | Doladění okna proti hře: rozměry, rám, pole, tři pokusy o písmo (Cinzel → Book Antiqua → Georgia → Times Ten), výřezy `border-image` podle hodnot odečtených v DevTools |
| 0.27.11 | 20:27 | K Private se kromě zatřesení a nadávky přehraje `debil.mp3`; přehrávání zvuku má jedno místo (`web/src/zvuk.ts`) |
| 0.27.12 | 20:35 | `mrizka.py --klic` umí odstranit šedou výplň z rámu (nasazený rám ji zatím má, viz §3.25) |
| 0.27.13 | 21:26 | Křížek zavřený zápas ze stránky opravdu odstraní, i v Debug módu |
| 0.27.14 | 21:29 | Ikona kopírování u pravého okraje polí |
| 0.27.15 | 21:36 | Text okna zesílený stínem o půl pixelu (nadpis 0,6 px, zbytek 0,5 px; zelená pole zeleně) |
| 0.27.16 | 21:48 | Správný pergamen (`popup_menu_bg_small.png`), nalezený porovnáním siluety okrajů |
| 0.27.17 | 22:09 | Allow Spectators zapnutý napevno, Hide Civilizations výchozí vypnuté; nadpis „Create Lobby Nastavení“, čtvercový křížek; náhledová stránka umí i modál |
| 0.27.18 | 22:15 | Uložené `null` u diváků se srovná při čtení |
| 0.27.19 | 22:19 | Hover na kopírovatelných polích, popisky 21 px, řádky s větším odstupem |
| 0.28.0 | 22:21 | Hide Civilizations má zpátky „je to jedno“, výchozí odškrtnuto; migrace 018 srovná uložené `null` |
| 0.28.1 | 22:35 | Barvy v kontrole ve čtvrtém pádě; barva 6 je růžová i odstínem |
| 0.28.2 | 22:47 | Hlavní sekce kontroly má vlastní sbalitelné záhlaví; všechny tři sekce kreslí jedna komponenta |
| **0.28.3** | 22:52 | Players vysvětlí, že rozdíl jsou prázdné otevřené sloty; **release PR #13** |

Před tím (3.–6. 9.): návrh a plán, zjednodušení stavů akce (spec 5. 9.),
zrcadlo dialogu Create Lobby, onboarding pro přispěvatele (0.1.0).

Od 0.19.1 dál je většina řádků reakce na screenshot s připomínkou; proto jich
je tolik a proto jsou po jedné věci. Verze se zvedá u každé změny chování,
i když je to jen odstup nebo barva.

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

Přibylo 8.–9. 9. při kabátku a kolech připomínek:

- **`all: unset` platí jen v klidovém stavu.** Tlačítko, které se nemá tvářit
  jako tlačítko, dostane pod kurzorem hnědý přechod z obecného
  `button:hover:enabled`. Dvakrát jsem to zkusil přebít vlastním pravidlem
  a dvakrát to bylo špatně; správně je vyjmout ho z obecných pravidel
  (třída `bez-vzhledu`).
- **`:not(.trida)` zvedne váhu selektoru o třídu.** Vyjmutí přes `:not()`
  přebilo pravidlo pro zlatá tlačítka, které stálo na tom, že je specifičtější,
  a „+“ zhnědlo. Použít `:not(:where(.trida))` — `:where()` váhu nemění.
- **Rozměry se musí měřit ve stejné veličině, v jaké se zapisují.** Panel je
  `content-box`; jeho `getBoundingClientRect()` nese i 34px rám, takže dosazení
  do `height` znamenalo o 80 px vedle. Na animaci výšky brát
  `getComputedStyle(el).height`.
- **FLIP měřit vůči rodiči, ne vůči oknu ani stránce.** Vůči oknu do polohy
  vleze odrolování, vůči stránce cokoliv, co se nad prvkem objeví. Obojí se
  projeví tak, že prvek přiletí odněkud úplně mimo.
- **Animovat jen to, co je opravdu přeskládání.** Přibytí a úbytek řádku posune
  ostatní z jiného důvodu; přejezd z toho udělá poskakující zmatek.
- **Dvoje hodiny v jedné komponentě se rozejdou.** Odpočet tikal po vteřinách,
  seznam po dvaceti — mezi tím byl řádek „aktivní“ bez odpočtu i bez „Zzz“,
  tedy prázdný. Buď jedny hodiny, nebo krajní stav ošetřit (00:00).
- **Textové pole si nad text drží rezervu** (naměřeno 10–11 px, nezávisle na
  délce). Kdo šířku pole počítá z neviditelné kopie textu, musí ji připočíst,
  jinak se text odroluje a první písmeno zmizí.
- **Sloupce tabulky se mění podle obsahu.** Tlačítko, které se občas objeví,
  potřebuje sloupec s pevnou šířkou, jinak přeskládá celou tabulku.
- **Ověřovat hover skutečným najetím myší**, ne nasazením třídy: obecná
  pravidla pro `:hover` se jinak nikdy neprojeví a chyba se najde až na dev.
- **Zpětné uvozovky v bash heredocu.** `python -c "…"` s uvozovkami je nechá
  vyhodnotit shellem a v komentáři pak zůstane díra. Psát skript do
  scratchpadu heredocem s `<<'PYEOF'`.
