# Nasazení na jouki.cz a pracovní postup (dev → main)

Web běží na serveru jouki.cz ve **třech** kopiích, každá z jedné větve repozitáře:

| Větev | Adresa | K čemu |
|---|---|---|
| `main` | <https://jouki.cz/aoe> | ostrá verze, na kterou se posílají lidé |
| `dev` | <https://jouki.cz/aoe/dev> | vývojová verze, odtud se releasuje; musí zůstat pořád vydatelná, aby šel kdykoliv poslat hotfix |
| `experimental` | <https://jouki.cz/aoe/experimental> | pískoviště na velké pokusy, které se klidně zahodí (od 8. 9. 2026) |

**Commit do větve = nasazení.** Nic dalšího se nedělá: po pushi se na serveru
sestaví nový obraz, proběhnou migrace a nová verze se objeví na adrese. Trvá
to zhruba dvě až tři minuty. Ověření, že běží to, co má:

```
curl -s https://jouki.cz/aoe/api/health        # {"ok":true,"verze":"X.Y.Z"}
curl -s https://jouki.cz/aoe/dev/api/health
curl -s https://jouki.cz/aoe/experimental/api/health
```

Stejná verze je vidět v patičce stránky.

> Tenhle soubor je psaný pro každého, kdo do repa přispívá, i pro jeho agenta.
> **Neobsahuje žádné přihlašovací údaje a žádné do něj nepatří** — repo je
> veřejné. Přístup na server má jen správce serveru; přispěvatel ho k ničemu
> nepotřebuje, nasazení se spouští samo z commitu.

---

## 1. Pracovní postup

Tři větve, jeden směr:

```
experimental ──► merge, když pokus vyjde ──┐
      │                                    ▼
      │      dev ── commit, commit ──►  PR  ────►  main
      ▼                 │                            │
jouki.cz/aoe/           ▼                            ▼
  experimental   jouki.cz/aoe/dev              jouki.cz/aoe
```

1. **Běžná práce jde do `dev`.** Do `main` se přímo necommituje.
2. **Každý commit, který mění chování, zvedne verzi** (viz kapitola 2). Verze
   se zvedá ve větvi `dev`; do `main` se dostane s releasem.
3. **Release se dělá jen na výslovný pokyn** („releasni“, „pushni do main“,
   „merguj“). Release = pull request `dev → main` a jeho merge:

   ```
   gh pr create --base main --head dev --title "Release vX.Y.Z — souhrn" --body "…"
   gh pr merge --merge
   ```

   Merge do `main` spustí nasazení ostré verze. Větev `dev` se při merge
   **nikdy nemaže**.
4. Po releasu ověřit, že `https://jouki.cz/aoe/api/health` vrací verzi, která
   se právě releasovala. Trvá to pár minut; než se nový build rozběhne, běží
   dál ten starý.

### 1.1 Větev `experimental`

Na velké přestavby, u kterých není jisté, že se nechají. Smysl je udržet
`dev` pořád vydatelnou: když se večer objeví chyba, hotfix jde do `dev` a
odtud rovnou do `main`, aniž by ho blokoval rozdělaný pokus.

```
git checkout experimental && git merge dev     # vzít si aktuální dev
…                                             # pokusy; nasazuje se samo
git checkout dev && git merge experimental    # pokus vyšel
git checkout experimental && git reset --hard dev
git push --force-with-lease origin experimental   # pokus se zahazuje
```

- **Nikdy se nereleasuje přímo z `experimental` do `main`.** Vždycky
  nejdřív merge do `dev` a odtud PR.
- Verze se na `experimental` zvedá stejně jako jinde, ať `/api/health`
  a patička říkají pravdu. Při merge zpátky do `dev` bude v `package.json`
  a `src/shared/verze.ts` konflikt — vyřešit tak, že se vezme verze z `dev`
  a znovu se spustí `npm run verze` (`-- minor`, když pokus přinesl novou
  funkci nebo migraci).
- Migrace z `experimental` se aplikují jen na `rob_aoe_experimental`. **Do
  `dev` se dostanou až s mergem**, takže jejich pořadové číslo se může krýt
  s migrací, která mezitím vznikla v `dev` — před mergem zkontrolovat čísla
  v `database/` a případně soubor přečíslovat. Zahozená databáze se dá
  smazat a nechat vytvořit znovu.
- Zahození větve je bezpečné: `main` ani `dev` o ní nevědí a nasazení na
  `/aoe/experimental` běží samostatně nad vlastní databází.

Proč takhle: ostrá adresa je ta, kterou Rob posílá lidem před streamem.
Nesmí se na ní objevit nic, co neprošlo dev verzí. A protože nasazení je
automatické, jediná brzda mezi „rozdělaná změna“ a „lidi to vidí“ je právě
pull request do `main`.

---

## 2. Verzování

Verze je na dvou místech, která **musí být stejná**: `version` v kořenovém
`package.json` a `VERZE` v `src/shared/verze.ts` (odtud ji čte backend do
`/api/health` a frontend do patičky). Test `src/shared/verze.test.ts` shodu
hlídá, takže rozjetá verze neprojde `npm test`.

Zvedá se **jedním příkazem**, který změní obojí naráz:

```
npm run verze            # patch: 0.2.3 → 0.2.4
npm run verze -- minor   # 0.2.3 → 0.3.0
npm run verze -- major   # 0.2.3 → 1.0.0
npm run verze -- 1.4.0   # přesně tahle
```

Čísla se v tomhle projektu jmenují **první.prostřední.poslední**
(`0.16.3`): poslední = oprava nebo drobnost, prostřední = nová funkce
nebo migrace, první = velká změna celého večera. `npm run verze` hýbe
posledním, `-- minor` prostředním, `-- major` prvním.

Pravidla:

- **Patch** při každé změně chování (oprava, drobná úprava UI, změna textu).
  Bumpuje se v tomtéž commitu jako změna, ne zvlášť.
- **Minor** při nové funkci nebo změně datového modelu (nová migrace).
- **Major** jen když se mění něco, na co si lidi zvykli (jiný průběh večera,
  jiné adresy).
- Verze se **nikdy nesnižuje** a v `main` nikdy nesmí být vyšší než v `dev`.
- Změna, která nemění chování (dokumentace, testy, komentáře), verzi zvedat
  nemusí. Když si nejsi jistý, zvedni patch — je to levnější než hádat, která
  z pěti stejných verzí zrovna běží.

Proč: verze v patičce a v `/api/health` je jediný způsob, jak se u živého
webu za pár vteřin zjistí, jestli prohlížeč drží nový build, nebo starý z
mezipaměti. Dvě různé verze se stejným číslem tuhle informaci zničí.

### 2.1 Verzování větve `experimental`

Pokusná větev má **vlastní tvar verze**: `X.Y.Z-A.B`.

| část | co znamená |
|---|---|
| `X.Y.Z` před pomlčkou | verze `dev`, ze které pokus vyšel. Během celého pokusu se **nemění** — je to razítko výchozího bodu. |
| `A.B` za pomlčkou | vlastní verzování pokusu. Nemá první číslo, protože **pokus nikdy nemění první číslo webu** — to smí jen release z `dev` do `main`. |

**Začíná se zdvojením.** Pokus vyšlý z `dev` na `0.16.3` začne na
`0.16.3-16.3`: dvojčíslí je zpočátku opsané z devu, takže je na první
pohled vidět, že pokus zatím nikam neposunul.

```
npm run verze -- experiment   # 0.16.3 → 0.16.3-16.3 (jen ve větvi experimental)
npm run verze                 # 0.16.3-16.3 → 0.16.3-16.4  (drobnost)
npm run verze -- minor        # 0.16.3-16.28 → 0.16.3-17.0 (velká změna)
```

Pomlčka je záměrně to, co semver bere jako předvydání: `0.16.3-16.4` je
podle npm **starší** než `0.16.3`, což přesně sedí — pokus je odbočka,
ne novější verze webu.

#### Co se stane při mergi zpátky do `dev`

Verze v `package.json` a `src/shared/verze.ts` se při mergi vždycky
pohádají. **Konflikt se řeší ve prospěch `dev`** a pak jeden příkaz
dopočítá výsledek:

```
git checkout dev && git merge experimental
# konflikt ve verzi vyřešit tak, že zůstane verze z dev
npm run verze -- z-experimentu        # verzi pokusu si přečte z větve experimental
npm run verze -- z-experimentu 0.16.3-17.9   # nebo se předá ručně
```

Rozhoduje **jediná otázka: zvedl pokus svoje první číslo proti základu,
ze kterého vyšel?**

| verze `dev` | verze pokusu | první číslo pokusu | výsledek v `dev` |
|---|---|---|---|
| `0.16.3` | `0.16.3-16.28` | 16, základ má taky 16 → beze změny | `0.16.4` |
| `0.16.3` | `0.16.3-17.9` | 17 proti základu 16 → zvedlo se | `0.17.0` |
| `0.18.1` | `0.16.3-17.9` | zvedlo se | `0.19.0` |
| `0.18.1` | `0.16.3-16.28` | beze změny | `0.18.2` |

Počítá se vždycky **z aktuální verze `dev`**, ne z čísel pokusu. Dev mohl
mezitím ujet dopředu (hotfixy) a jeho verze nikdy nesmí klesnout ani se
zopakovat — poslední dva řádky tabulky jsou přesně tenhle případ.

#### A pak se pokus přezaloží

Po mergi se `experimental` srovná s novým `dev` a pokusné verzování
**začne znovu od zdvojení** nové verze devu:

```
git checkout experimental && git merge dev
# konflikt ve verzi vyřešit ve prospěch dev
npm run verze -- experiment    # dev 0.19.0 → 0.19.0-19.0
```

Bez argumentu si příkaz základ vezme z větve `dev` sám, když je vlastní
verze ještě ta stará pokusná; jinak zdvojí verzi, kterou má.

Pravidla jsou celá v `scripts/verze.ts` a hlídá je `scripts/verze.test.ts`
(tabulka výše je v něm doslova jako testy). Skript navíc odmítne:

- `npm run verze -- major` na pokusu (první číslo pokus nemění),
- `npm run verze -- experiment` mimo větev `experimental`,
- obyčejný bump ve větvi, která má pokusnou verzi — to znamená špatně
  vyřešený konflikt a příkaz rovnou napoví `z-experimentu`.

---

## 3. Jak nasazení funguje

### 3.1 Server

Jeden VPS (Hetzner, Ubuntu), na kterém běží [Coolify](https://coolify.io) —
správce kontejnerů s reverzní proxy Traefik a certifikáty Let's Encrypt.
Coolify už hostuje ostatní věci na jouki.cz; tenhle web je v něm zaregistrovaný
jako tři aplikace:

| Coolify aplikace | Větev | Veřejná adresa | Proměnná `BASE_URL` | Build ARG `BASE_PATH` |
|---|---|---|---|---|
| `aoe-web` | `main` | `https://jouki.cz/aoe` | `https://jouki.cz/aoe` | `/aoe/` |
| `aoe-web-dev` | `dev` | `https://jouki.cz/aoe/dev` | `https://jouki.cz/aoe/dev` | `/aoe/dev/` |
| `aoe-web-experimental` | `experimental` | `https://jouki.cz/aoe/experimental` | `https://jouki.cz/aoe/experimental` | `/aoe/experimental/` |

Obě staví z veřejného repa (`https://github.com/vtencer3-lab/rob-aoe-web`)
podle `Dockerfile` v kořeni. Sestavený kontejner obsluhuje API i frontend
z jednoho procesu (`node dist/src/main.js`), přesně jako `npm start` lokálně.

### 3.2 Cesta `/aoe` a `/aoe/dev`

Traefik směruje `Host(jouki.cz) && PathPrefix(/aoe)` do kontejneru a **prefix
před předáním odstraní** — server uvnitř vidí `/api/akce`, ne
`/aoe/api/akce`. Routy v kódu jsou proto pořád na kořeni a nic se v nich
nemění. Prefix je potřeba jen tam, kde adresa jde zpátky do prohlížeče:

| Co | Kde se řeší | Z čeho |
|---|---|---|
| adresy assetů (`/aoe/assets/…`) a všechna volání `fetch` z frontendu | `web/vite.config.ts` (`base`), `web/src/cesty.ts` | build ARG `BASE_PATH` |
| přesměrování po přihlášení a ze zkušebních dveří, cesta cookie | `src/config.ts` (`basePath`, `domovskaCesta`) | `BASE_URL` |
| návratová adresa pro Steam OpenID | `src/auth/steamOpenId.ts` | `BASE_URL` |
| název cookie se sezením (`sid_aoe`, `sid_aoe_dev`, `sid_aoe_experimental`) | `src/config.ts` (`cookieNazev`) | `BASE_URL` |

Název cookie se liší schválně: všechny kopie běží na téže doméně a cookie
s cestou `/aoe` prohlížeč posílá i na `/aoe/dev` a `/aoe/experimental`. Se
stejným názvem by se o jedno sezení přetahovaly. Název se z cesty odvozuje
sám (`nazevCookie`), takže další kopie nepotřebuje zásah do kódu.

Delší prefix `/aoe/dev` i `/aoe/experimental` má v Traefiku přednost před
`/aoe` automaticky (priorita podle délky pravidla), takže vývojová ani
pokusná verze nepotřebuje v ostré žádnou výjimku.

### 3.3 Co se děje po pushi

Nasazení spouštějí dvě nezávislé cesty; stačí, aby fungovala jedna:

1. **Hlídač větví na serveru** (systemd timer, každou minutu). Ptá se GitHubu
   na aktuální commit větví `main`, `dev` a `experimental` (`git ls-remote`,
   veřejné repo,
   bez přihlášení). Když se commit změnil a Coolify ho ještě nenasadilo,
   požádá Coolify o nasazení. Tohle funguje vždy a nepotřebuje v repu nic.
2. **GitHub Action** `.github/workflows/deploy.yml`. Po pushi do `main`,
   `dev` nebo `experimental` zavolá Coolify přímo, takže nasazení začne
   hned, ne až za minutu.
   Potřebuje k tomu secret `COOLIFY_TOKEN` v nastavení repa (Settings →
   Secrets and variables → Actions). **Nastavit ho může jen vlastník repa**;
   token vydá správce serveru. Dokud secret není, akce jen skončí s poznámkou
   a nasazení zajistí hlídač.

Ať přijde požadavek odkudkoliv, Coolify udělá totéž: stáhne větev, sestaví
obraz podle `Dockerfile`, spustí kontejner, počká na `/api/health` a teprve pak
na něj přepne provoz. Starý kontejner běží, dokud nový není zdravý — výpadek
je jen okamžik přepnutí (SSE spojení se přeruší a stránka se sama znovu
připojí).

### 3.4 Migrace

Kontejner před startem serveru spustí `node dist/scripts/migrate.js`. Migrace
jsou tedy součástí nasazení a **nová migrace v `dev` se projeví v `rob_aoe_dev`
hned, v `rob_aoe` až s releasem** (a migrace z `experimental` jen v
`rob_aoe_experimental`, dokud se větev nemerguje). Migrace musí být proto vždycky dopředně
kompatibilní se starým kódem: mezi startem migrace a přepnutím provozu ještě
pár vteřin běží předchozí verze nad novým schématem.

### 3.5 Databáze

Každá kopie má **vlastní databázi** (`rob_aoe`, `rob_aoe_dev`,
`rob_aoe_experimental`) na jednom PostgreSQL 18, který na serveru už běžel
pro jiné projekty. Přístup k němu mají jen kontejnery na serveru, zvenčí
není vidět. Vývojová i pokusná databáze se dají kdykoliv vyprázdnit; ostrá
ne. Databázové testy běží proti čtvrté, `rob_aoe_test`.

### 3.6 Proměnné prostředí

Nastavují se v Coolify u každé aplikace zvlášť, do repa nepatří:

| Proměnná | ostrá | vývojová | pokusná |
|---|---|---|---|
| `DATABASE_URL` | `postgres://…/rob_aoe` | `postgres://…/rob_aoe_dev` | `postgres://…/rob_aoe_experimental` |
| `BASE_URL` | `https://jouki.cz/aoe` | `https://jouki.cz/aoe/dev` | `https://jouki.cz/aoe/experimental` |
| `BASE_PATH` (build) | `/aoe/` | `/aoe/dev/` | `/aoe/experimental/` |
| `HOST` | `0.0.0.0` | `0.0.0.0` | `0.0.0.0` |
| `PORT` | `3000` | `3000` | `3000` |
| `ADMIN_STEAM_ID` | seznam `hrac_id` s režií oddělený čárkou (Rob + správce); bere Steam ID i `xbox:<xuid>`, jméno proměnné zůstalo kvůli nasazení (viz `docs/prehled-praci-a-zameru.md` §3.57) | totéž | totéž |
| `STEAM_API_KEY` | volitelné | volitelné | volitelné |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | nastaveno 17. 9. 2026 — táž registrace jako dev | registrace z entra.microsoft.com | **nenastaveno** — pokusná Microsoft přihlášení nemá |
| `LOG_LEVEL` | `info` | `info` | `info` |
| `DEV_PRISTUP` | nenastavovat | nenastavovat | nenastavovat |
| `ZKUSEBNI_HRACI` | `true` — na výslovné přání uživatele od 9. 9. 2026, ať jdou zkušební hráči a přetáčení času i na ostré | `true` — tlačítka „+ Zkušební hráč“ v režii | `true` |

Zkušební dveře (`/api/dev/*`) se na `https` samy zavírají, takže na jouki.cz
nejsou dostupné ani ve vývojové verzi. Zkouška večera nasucho se dělá lokálně.

---

### 3.6.1 Přihlášení Microsoft účtem: co je kde

Zprovozněno na ostré 17. 9. 2026. Kód sám nestačí — drží to tři věci, každá
jinde, a když jedna chybí, selže to jinak:

**Registrace v Azure.** Jediná, sdílená všemi nasazeními, `AoE 2 komunitky`,
ID aplikace `87a13d9c-6d99-4090-abbd-ad985c042691`, adresář *Default Directory*
(`mjoukalgmail.onmicrosoft.com`). Má čtyři návratové adresy — ostrá, dev,
pokusná a `http://localhost:3000` — všechny ve tvaru
`<base>/api/auth/microsoft/return`. Adresa **musí být zapsaná v té registraci,
jejíž `client_id` server posílá**; jinak Microsoft vrátí chybovou stránku až po
přesměrování, ne dřív.

Ověřit zvenku jde bez přihlašování: vzít `Location` z `/api/auth/microsoft`,
podstrčit do něj jinou `redirect_uri` a porovnat velikost odpovědi. Přijatá
adresa vrátí přihlašovací stránku (desítky kB), nezapsaná chybovou (~3 kB).

17. 9. 2026 existovala krátce **druhá registrace** (`75037941-…`), založená
omylem a bez tajného kódu. Smazána. Kdyby se někdy zdálo, že „adresa je
zapsaná a stejně to nefunguje“, tohle je ten případ — zapsaná byla ve špatné
aplikaci.

**Tajemství v Coolify.** `MS_CLIENT_ID` a `MS_CLIENT_SECRET` u každé aplikace
zvlášť. Tajný kód Azure podruhé neukáže; když se ztratí, generuje se nový.
Bez obou proměnných se routy Microsoftu **vůbec nezaregistrují** (viz
`src/http/server.ts`), `/api/auth/microsoft` vrací 404 a frontend erb neukáže —
`GET /api/me` v tom případě vrací `maMicrosoft: false` a tlačítko se vykreslí
jako prosté „Přihlásit se přes Steam“. Je to záměr, ne porucha: nenabízet
cestu, která končí chybou.

**Admin práva.** Viz §3.6.2 — je to past.

#### 3.6.2 `ADMIN_STEAM_ID` je jediný zdroj pravdy o právech

`je_admin` v databázi **není** místo, kam se práva zapisují ručně.
`komuDatAdmina()` (`src/auth/routes.ts`) vrací při neprázdném seznamu
`config.adminHracIds.includes(hracId)` — tedy `false` pro každý účet, který
v proměnné chybí — a `upsertPlayer`/`upsertHracXbox` to přes
`COALESCE($4, player.je_admin)` zapíšou. **Práva nastavená jen v databázi se
tedy při nejbližším přihlášení toho účtu sama smažou.**

Proměnná bere Steam ID i `xbox:<xuid>`, odděluje se čárkou, mezerou nebo
středníkem. Xbox XUID se zjistí z `player.hrac_id` (tvar `xbox:<xuid>`).

Zjištěno 17. 9. 2026 při zprovozňování ostré: obě aplikace měly v proměnné
jediné Steam ID, zatímco databáze vedla tři adminy. Rob i Trokner by o režii
přišli při svém dalším přihlášení, aniž by kdokoliv sáhl na nastavení. Seznamy
byly srovnány s tím, co v databázích platilo, a doplněny o `xbox:` položku.

**Při přidávání admina tedy vždycky proměnná, ne `UPDATE`.** Kontrola, že
proměnná a databáze nejsou rozejité:

```bash
docker exec <postgres> psql -U postgres -d rob_aoe -t \
  -c "SELECT hrac_id FROM player WHERE je_admin;"
```

#### 3.6.3 Zkouška přihlášení od nuly

Souhlasnou obrazovku (to, co uvidí nový hráč) vrátí zpět odebrání souhlasu na
<https://account.live.com/consent/Manage> → *AoE 2 komunitky* → odebrat
oprávnění. S právy na webu to nesouvisí — ta se řídí výhradně §3.6.2.

#### 3.6.4 Azure kredit

Předplatné `Azure subscription 1` má bezplatný kredit 200 US$ s platností do
16. 10. 2026. Na některých obrazovkách je přepočtený na eura (171,73 €) — je to
táž položka, ne úbytek. Náklady jsou nulové a v předplatném nejsou žádné
prostředky.

Vypršení kreditu nemá na přihlašování dopadnout: registrace aplikace je objekt
adresáře (Entra ID Free), ne předplatného, a jde založit i bez Azure
předplatného. **Neověřeno praxí** — ověří se až 16. 10. 2026.

---

## 3.7 Návrat na předchozí verzi

Před každým releasem do `main` se na dosavadní stav `main` pověsí značka
`vX.Y.Z`. Návrat pak není pátrání v historii, ale jeden příkaz.

**Nejdřív zjisti, jestli mezi verzemi přibyla migrace:**

```bash
git diff --name-only vX.Y.Z..main -- database/
```

Migrace jsou v `database/`; složka `migrations/` v repu nikdy nebyla, takže
příkaz s ní vypsal prázdno pokaždé — i když migrace přibyly.

Když je výpis prázdný, je návrat čistě otázka kódu a nic se neztratí. Když
prázdný není, databáze už je napřed a **samotné vrácení kódu nestačí** —
migrace se nevrací samy a stará verze nemusí novou strukturu unést. To je
případ na rozmyšlenou, ne na rychlý příkaz.

> **Migrace 027 a 028 zpátky nejdou.** Runner ve `scripts/migrate.ts` zná jen
> dopředný směr a žádná migrace zpětnou variantu nemá. Migrace 027 přejmenovala
> `player.steam_id` na `hrac_id` (a totéž v pěti dalších tabulkách), migrace 028
> `steam_name` na `platforma_jmeno` a `steam_hra` na `hra_vlastnictvi`. Verze
> 1.7.5 a starší po nich **nenaběhnou** — čtou sloupce, které už neexistují.
> `git revert` tedy u téhle dvojice nestačí: buď se dopíše a pustí zpětná
> migrace, nebo se obnoví záloha ostré databáze `rob_aoe` (§3.5), nebo se místo
> návratu opraví to, co je rozbité, a vydá se další verze. Vybrat se to musí **dřív**, než se
> revert pushne — jinak ostrá verze spadne na startu.

**Vrácení, které nechává historii být** (doporučené, `main` jde dál dopředu):

```bash
git checkout main && git pull
git revert -m 1 <hash merge commitu releasu>   # -m 1 = vrátit se na stav main před mergem
git push origin main
curl -s https://jouki.cz/aoe/api/health        # musí hlásit starou verzi
```

Revert merge commitu má jeden háček: až se stejná práce bude vydávat znovu,
git ji považuje za už sloučenou a `main` by ji nedostal. Musí se proto před
dalším releasem vrátit i ten revert (`git revert <hash revertu>` na `dev`).

**Tvrdý návrat** (jen když je potřeba mít `main` přesně jako předtím):

```bash
git checkout main && git reset --hard vX.Y.Z && git push --force-with-lease origin main
```

Přepisuje historii sdílené větve, takže jen po dohodě s ostatními adminy.

V obou případech se `dev` nechává být — chyba se opraví tam a vydá znovu.

## 4. Když se něco nepovede

- **Po pushi se nic nezměnilo.** Počkej tři minuty a zkus `/api/health`.
  Když verze pořád nesedí, build nejspíš spadl (typicky typová chyba ve
  frontendu, viz `CONTRIBUTING.md`) — Coolify v tom případě nechá běžet
  starou verzi. Spusť lokálně celý `npm run build`; když projde, je chyba
  na straně serveru a je to na jeho správce.
- **Stránka se načte, ale bez CSS/JS, nebo volá `/api` mimo `/aoe`.** Build
  proběhl bez `BASE_PATH`, nebo `BASE_URL` a `BASE_PATH` nesedí. Obojí je
  konfigurace v Coolify, ne v repu.
- **Přihlášení přes Steam se vrátí s 401 „přihlášení nepatří tomuhle webu“.**
  `BASE_URL` neodpovídá adrese v prohlížeči (jiná cesta, lomítko na konci).
- **Ostrá verze zobrazuje zastaralý stav.** Ověř verzi v patičce; prohlížeč
  může držet starý bundle. Assety mají v názvu hash, takže tvrdý refresh stačí.
- **Tentýž dotaz vrací jednou 404 a podruhé 302 (nebo dvě různé verze).**
  Během nasazení běží krátce **dva kontejnery** a proxy mezi ně dělí provoz;
  starý ještě nezná nové proměnné. Není to chyba konfigurace a nic se s tím
  nedělá — Coolify starý kontejner po zdravotní kontrole sám zastaví, řádově
  do minuty. Ověřit:

  ```bash
  docker ps --filter "name=<uuid aplikace>" --format "{{.Names}}\t{{.Status}}"
  ```

  Dokud to vypisuje dva řádky, jakékoliv měření zvenku je nespolehlivé —
  počkat, až zbude jeden, a teprve pak měřit. Měřit se má **jedním**
  požadavkem (`curl -i -o soubor -w '%{http_code}'`), ne dvěma voláními po
  sobě: dvě volání mohou padnout na dva různé kontejnery a vypadá to jako
  protiřečící si výsledky.

Cokoliv, co vyžaduje přístup na server, řeší správce serveru. V repu má být
všechno, co je potřeba k tomu, aby nasazení proběhlo samo: `Dockerfile`,
migrace a tenhle popis.

## Coolify API: přidání proměnné prostředí

Ověřeno 16. 9. 2026 při zapínání Microsoft přihlášení na devu.

```bash
# UUID aplikací jsou v /root/aoe-deploy/watch.sh: main, dev, experimental
A=https://coolify.jouki.cz/api/v1/applications/wxju55zz9imrhn9lco0drrvc
curl -X POST -H "Authorization: Bearer $COOLIFY_TOKEN" -H "Content-Type: application/json"      -d '{"key":"MS_CLIENT_ID","value":"..."}' "$A/envs"
curl "https://coolify.jouki.cz/api/v1/deploy?uuid=wxju55zz9imrhn9lco0drrvc"      -H "Authorization: Bearer $COOLIFY_TOKEN"
```

**Pole `is_preview` a `is_build_time` v těle vracejí HTTP 422**, i když je
dokumentace zmiňuje. Bez nich požadavek projde a vrátí `{"uuid": "..."}`.

`GET /envs` vrací **každý klíč dvakrát** (běhové i buildové prostředí), takže
seznam se čte přes množinu, ne přes pole.

Po `POST /envs` musí přijít `/deploy`. Samotný `/restart` nové proměnné
nenačte — to je zapsané výš a platí to i tady.

---

## 5. Přestěhování adresy na robdiesalot.com/aoe (rozpracováno 19. 9. 2026)

Uživatel chce, aby web žil na `robdiesalot.com/aoe`. Není to kosmetika —
rozhoduje to o tom, kudy poteče provoz **celého Robova webu**.

### 5.1 Proč to nejde jednodušeji

`robdiesalot.com` běží u **profiwh** (85.93.165.127, sdílený hosting, Apache,
WordPress, přístup jen FTP + MySQL). Naše aplikace je Node se SSE a Postgresem,
takže na tom hostingu běžet nemůže. Rozdvojení cesty `/aoe` tedy musí udělat
někdo **před** profiwh. Změřeno 19. 9. 2026:

| Možnost | Výsledek |
|---|---|
| iframe ve WordPressu | **Ne.** `steamcommunity.com/openid/login` posílá `X-Frame-Options: DENY`, naše cookie má `SameSite=Lax` (v cizím rámu se neposílá) a Safari s Firefoxem blokují cizí cookies plošně |
| `.htaccess` s `RewriteRule [P]` | **Ne.** Chybí `mod_proxy` — pravidlo končí chybou 500, zatímco totéž bez `[P]` projde. `ProxyPass` v `.htaccess` neplatí vůbec |
| PHP proxy skript | Technicky ano (`allow_url_fopen` i `curl` zapnuté), ale běží to jako **PHP-FPM**: každé SSE spojení drží jednoho workera navždy. Deset diváků = deset zabraných workerů |
| Podoména `aoe.robdiesalot.com` | Funguje a je nejlevnější, ale uživatel trvá na tvaru s lomítkem |

### 5.2 Zvolené řešení

DNS `robdiesalot.com` míří na náš VPS. Traefik pak:

- `Host(robdiesalot.com) && PathPrefix(/aoe)` → aplikace `aoe-web` (štítky od Coolify)
- `Host(robdiesalot.com)` s `priority: 1` → zpátky na profiwh

WordPress zůstává u profiwh a nikdo ho nestěhuje. K originu se chodí **po
HTTPS** se `serverName: robdiesalot.com`, aby WordPress viděl skutečný https
požadavek a nedělal přesměrovací smyčku.

**Ověřeno 19. 9. 2026** dočasným předpisem jen na HTTP (bez certifikátu, tedy
bez rizika ACME) a oslovením naší IP s hlavičkou `Host`:

| Test | Výsledek |
|---|---|
| domovská stránka přes náš VPS vs. přímo z profiwh | **193 099 B v obou případech, bajt na bajt** |
| `/wp-login.php` | 200 |
| `/wp-admin/` | 302 na `https://robdiesalot.com/wp-login.php` — správná doména, žádná smyčka |
| `/feed/`, CSS z tématu | 200, správný `content-type` |

Testovací předpis byl smazán, veřejný web se o něm nedozvěděl.

### 5.3 Co je připravené a kde

Obojí leží **mimo** sledovanou složku, takže to zatím nic nedělá:

- `/root/aoe-deploy/robdiesalot.yaml` — rozcestník na profiwh
- `/root/aoe-deploy/jouki-aoe-redirect.yaml` — 308 ze starého `jouki.cz/aoe`

**Nenasazovat dřív, než DNS míří na nás.** Předpis nese `certresolver`
a Traefik si o certifikát řekne hned, jak ho načte; dokud doména míří na
profiwh, HTTP-01 výzva selže a opakovaná selhání se počítají do limitů
Let's Encryptu.

### 5.4 Postup přepnutí

1. **Google Cloud DNS** (tam je doména, ne u profiwh): snížit TTL A záznamu
   `robdiesalot.com` z 14 400 na 300 a **počkat 4 hodiny**, než staré
   odpovědi vyprší. `www` je CNAME na kořen, ten se neřeší.
2. **Azure** → registrace `AoE 2 komunitky` → Authentication → přidat
   `https://robdiesalot.com/aoe/api/auth/microsoft/return`. Udělat **předem**,
   ať nevznikne okno, kdy přihlášení Microsoftem nefunguje.
3. Přepnout A záznam na **178.104.160.182**.
4. `mv /root/aoe-deploy/robdiesalot.yaml /data/coolify/proxy/dynamic/` —
   Traefik složku sleduje (`providers.file.watch=true`), restart není potřeba.
   Ověřit, že `https://robdiesalot.com/` vrací WordPress a že naskočil
   certifikát.
5. V Coolify u `aoe-web` přidat doménu `https://robdiesalot.com/aoe`
   a nastavit `BASE_URL=https://robdiesalot.com/aoe`. `BASE_PATH` zůstává
   `/aoe/` — cesta se nemění, takže frontend se překládat nemusí. Deploy.
6. Odebrat `jouki.cz` z domén aplikace a nasadit
   `jouki-aoe-redirect.yaml` do sledované složky.
7. Ověřit: přihlášení Steamem, přihlášení Microsoftem, odkaz `aoe2de://`,
   živý přenos stavu (SSE) a že `jouki.cz/aoe` přesměrovává.

### 5.5 Co to stojí a jak couvnout

Náš VPS se stává vstupními dveřmi celého `robdiesalot.com`. Naměřeno 19. 9.
2026: `coolify-proxy` běží **4 měsíce s nulou restartů**, stroj **19 týdnů**,
automatický restart po aktualizaci je vypnutý. Nasazení jednotlivých aplikací
proxy nerestartují — ověřeno na kontejnerech s uptime 8 minut vedle proxy
s uptime 4 měsíce.

Robův web tedy **neshodí** nasazení `/aoe` ani žádné jiné aplikace. **Shodí ho**
restart stroje (jeden čeká — `/var/run/reboot-required` existuje), restart
`coolify-proxy` při aktualizaci Coolify, výpadek VPS a chyba v tomhle předpisu.

**Záchranná brzda:** s TTL 300 stačí v Google Cloud DNS vrátit A záznam na
`85.93.165.127` a WordPress je za pět minut zpátky i bez nás. Ztratí se jen
`/aoe`. Proto se TTL po přepnutí **nezvyšuje zpátky**.
