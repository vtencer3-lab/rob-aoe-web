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
| `ADMIN_STEAM_ID` | seznam Steam ID s režií oddělený čárkou (Rob + správce) | totéž | totéž |
| `STEAM_API_KEY` | volitelné | volitelné | volitelné |
| `LOG_LEVEL` | `info` | `info` | `info` |
| `DEV_PRISTUP` | nenastavovat | nenastavovat | nenastavovat |
| `ZKUSEBNI_HRACI` | nenastavovat | `true` — tlačítka „+ Zkušební hráč“ v režii | `true` |

Zkušební dveře (`/api/dev/*`) se na `https` samy zavírají, takže na jouki.cz
nejsou dostupné ani ve vývojové verzi. Zkouška večera nasucho se dělá lokálně.

---

## 3.7 Návrat na předchozí verzi

Před každým releasem do `main` se na dosavadní stav `main` pověsí značka
`vX.Y.Z`. Návrat pak není pátrání v historii, ale jeden příkaz.

**Nejdřív zjisti, jestli mezi verzemi přibyla migrace:**

```bash
git diff --name-only vX.Y.Z..main -- migrations/
```

Když je výpis prázdný, je návrat čistě otázka kódu a nic se neztratí. Když
prázdný není, databáze už je napřed a **samotné vrácení kódu nestačí** —
migrace se nevrací samy a stará verze nemusí novou strukturu unést. To je
případ na rozmyšlenou, ne na rychlý příkaz.

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

Cokoliv, co vyžaduje přístup na server, řeší správce serveru. V repu má být
všechno, co je potřeba k tomu, aby nasazení proběhlo samo: `Dockerfile`,
migrace a tenhle popis.
