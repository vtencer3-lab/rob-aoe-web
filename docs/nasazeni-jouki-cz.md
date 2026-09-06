# Nasazení na jouki.cz a pracovní postup (dev → main)

Web běží na serveru jouki.cz ve dvou kopiích, každá z jedné větve repozitáře:

| Větev | Adresa | K čemu |
|---|---|---|
| `main` | <https://jouki.cz/aoe> | ostrá verze, na kterou se posílají lidé |
| `dev` | <https://jouki.cz/aoe/dev> | vývojová verze, tady se zkouší všechno nové |

**Commit do větve = nasazení.** Nic dalšího se nedělá: po pushi se na serveru
sestaví nový obraz, proběhnou migrace a nová verze se objeví na adrese. Trvá
to zhruba dvě až tři minuty. Ověření, že běží to, co má:

```
curl -s https://jouki.cz/aoe/api/health        # {"ok":true,"verze":"X.Y.Z"}
curl -s https://jouki.cz/aoe/dev/api/health
```

Stejná verze je vidět v patičce stránky.

> Tenhle soubor je psaný pro každého, kdo do repa přispívá, i pro jeho agenta.
> **Neobsahuje žádné přihlašovací údaje a žádné do něj nepatří** — repo je
> veřejné. Přístup na server má jen správce serveru; přispěvatel ho k ničemu
> nepotřebuje, nasazení se spouští samo z commitu.

---

## 1. Pracovní postup

Dvě větve, jeden směr:

```
dev  ──── commit, commit, commit ────►  PR  ────►  main
 │                                                  │
 ▼                                                  ▼
jouki.cz/aoe/dev                              jouki.cz/aoe
```

1. **Všechna práce jde do `dev`.** Do `main` se přímo necommituje.
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

---

## 3. Jak nasazení funguje

### 3.1 Server

Jeden VPS (Hetzner, Ubuntu), na kterém běží [Coolify](https://coolify.io) —
správce kontejnerů s reverzní proxy Traefik a certifikáty Let's Encrypt.
Coolify už hostuje ostatní věci na jouki.cz; tenhle web je v něm zaregistrovaný
jako dvě aplikace:

| Coolify aplikace | Větev | Veřejná adresa | Proměnná `BASE_URL` | Build ARG `BASE_PATH` |
|---|---|---|---|---|
| `aoe-web` | `main` | `https://jouki.cz/aoe` | `https://jouki.cz/aoe` | `/aoe/` |
| `aoe-web-dev` | `dev` | `https://jouki.cz/aoe/dev` | `https://jouki.cz/aoe/dev` | `/aoe/dev/` |

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
| název cookie se sezením (`sid_aoe`, `sid_aoe_dev`) | `src/config.ts` (`cookieNazev`) | `BASE_URL` |

Název cookie se liší schválně: obě verze běží na téže doméně a cookie s
cestou `/aoe` prohlížeč posílá i na `/aoe/dev`. Se stejným názvem by se obě
verze o jedno sezení přetahovaly.

Delší prefix `/aoe/dev` má v Traefiku přednost před `/aoe` automaticky
(priorita podle délky pravidla), takže vývojová verze nepotřebuje žádnou
výjimku v ostré.

### 3.3 Co se děje po pushi

Nasazení spouštějí dvě nezávislé cesty; stačí, aby fungovala jedna:

1. **Hlídač větví na serveru** (systemd timer, každou minutu). Ptá se GitHubu
   na aktuální commit větví `main` a `dev` (`git ls-remote`, veřejné repo,
   bez přihlášení). Když se commit změnil a Coolify ho ještě nenasadilo,
   požádá Coolify o nasazení. Tohle funguje vždy a nepotřebuje v repu nic.
2. **GitHub Action** `.github/workflows/deploy.yml`. Po pushi do `main` nebo
   `dev` zavolá Coolify přímo, takže nasazení začne hned, ne až za minutu.
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
hned, v `rob_aoe` až s releasem**. Migrace musí být proto vždycky dopředně
kompatibilní se starým kódem: mezi startem migrace a přepnutím provozu ještě
pár vteřin běží předchozí verze nad novým schématem.

### 3.5 Databáze

Ostrá a vývojová verze mají **oddělené databáze** (`rob_aoe`, `rob_aoe_dev`)
na jednom PostgreSQL 18, který na serveru už běžel pro jiné projekty.
Přístup k němu mají jen kontejnery na serveru, zvenčí není vidět. Vývojová
databáze se dá kdykoliv vyprázdnit; ostrá ne.

### 3.6 Proměnné prostředí

Nastavují se v Coolify u každé aplikace zvlášť, do repa nepatří:

| Proměnná | ostrá | vývojová |
|---|---|---|
| `DATABASE_URL` | `postgres://…/rob_aoe` | `postgres://…/rob_aoe_dev` |
| `BASE_URL` | `https://jouki.cz/aoe` | `https://jouki.cz/aoe/dev` |
| `BASE_PATH` (build) | `/aoe/` | `/aoe/dev/` |
| `HOST` | `0.0.0.0` | `0.0.0.0` |
| `PORT` | `3000` | `3000` |
| `ADMIN_STEAM_ID` nebo `ADMIN_BOOTSTRAP` | viz README | viz README |
| `STEAM_API_KEY` | volitelné | volitelné |
| `LOG_LEVEL` | `info` | `info` |
| `DEV_PRISTUP` | nenastavovat | nenastavovat |

Zkušební dveře (`/api/dev/*`) se na `https` samy zavírají, takže na jouki.cz
nejsou dostupné ani ve vývojové verzi. Zkouška večera nasucho se dělá lokálně.

---

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
