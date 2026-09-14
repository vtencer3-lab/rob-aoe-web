# Jak se tu pracuje: větve, verze, testy, nasazení

Podrobnosti o serveru, Coolify, proměnných a návratu releasu jsou v
[`../nasazeni-jouki-cz.md`](../nasazeni-jouki-cz.md). Tady je pracovní
rytmus, který se osvědčil, a proč.

## Tři větve, tři nasazení

| větev | kde běží | k čemu |
|---|---|---|
| `dev` | jouki.cz/aoe/dev | veškerá práce; každý push se nasadí sám (hlídač na VPS: `git ls-remote` + Coolify API) |
| `main` | jouki.cz/aoe | ostrá; jen přes PR z `dev`, na výslovný pokyn |
| `experimental` | jouki.cz/aoe/experimental | pískoviště na velké pokusy nad vlastní DB; do `main` nikdy přímo |

Do `main` se přímo necommituje. `dev` musí zůstat kdykoli vydatelná pro
hotfix — proto velké pokusy do `experimental`.

## Verze (`scripts/verze.ts`, `npm run verze`)

Verze je ve dvou souborech naráz (`package.json` a `src/shared/verze.ts` —
patička, `/api/health`, lišta „nová verze“); příkaz mění obojí.

- **Každý commit, který mění chování, zvedne verzi** v tomtéž commitu:
  `npm run verze` (patch), `npm run verze -- minor` (nová funkce nebo
  migrace), `-- major` jen mimo pokus, `-- 1.2.3` přesně.
- `experimental` má tvar `X.Y.Z-A.B`: před pomlčkou verze devu, ze které
  pokus vyšel (nemění se), za pomlčkou vlastní dvojčíslí. Založení
  zdvojením `npm run verze -- experiment` (`1.0.0` → `1.0.0-0.0`), po mergi do
  devu `npm run verze -- z-experimentu` dopočítá verzi devu (zvedl pokus
  první číslo za pomlčkou? → minor, jinak patch). Semver bere pomlčku jako
  předvydání, což sedí: pokus je odbočka, ne novější verze.
- Merge devu do experimental: konflikt jen ve dvou souborech s verzí,
  řeší se ve prospěch devu a pak `-- experiment`.

## Build: číst návratový kód, ne výstup

```
npm run build > /tmp/build.log 2>&1; echo "BUILD EXIT=$?"; grep -E "error TS" /tmp/build.log
```

`npm run build | grep …` vrací kód `grep`u, ne buildu — tak odešel
nepostavitelný 0.32.0 a server dál servíroval starý bundle. `build` je
řetěz `tsc` (backend) `&& tsc -b` (frontend, včetně typů ve fixturách
testů) `&& vite build`; chyba v typech testu zastaví vite a `web/dist`
zůstane starý. `npx tsc --noEmit` frontend **nekontroluje**.

## Testy

- `npm test` — hermetické backend (`*.test.ts`, bez sítě a DB).
- `npm run test:web` — frontend (vitest + Testing Library, jsdom). jsdom
  neumí geometrii, IntersectionObserver, MediaSource, `element.animate`,
  pointer capture — kód má pro ně tiché větve, testy mockují.
- Databázové (`*.db.test.ts`) se **spouští jen na serveru**:
  `ssh root@<vps> "/root/aoe-deploy/test-db.sh dev"` (kontejner node proti
  `rob_aoe_test`). Lokálně Postgres není. Volají `TRUNCATE` — `DATABASE_URL`
  nikdy na ostrou DB; kontrola přípony `_test` je druhá pojistka.
- DB testy sdílejí data, co `TRUNCATE player, akce` nesmaže (globální
  nastavení) — resetovat v `beforeEach`.

## Po pushi

1. Počkat na health: `curl https://jouki.cz/aoe/dev/api/health` musí vrátit
   verzi, která se právě pushla (smyčka po 10 s, ~1–3 min).
2. S migrací spustit DB testy na serveru (migrace se aplikují při startu
   kontejneru).
3. Vizuální kontrola zůstává na uživateli — zelené testy nejsou důkaz, že
   UI funguje (několik vad jimi prošlo). Kde to jde, ověřit v prohlížeči
   (Claude in Chrome: změřit `getBoundingClientRect`, computed style).

## Release

```
git tag -a vX.Y.Z -m "main před releasem …" origin/main && git push origin vX.Y.Z
gh pr create --base main --head dev --title "Release X.Y.Z: …" --body "…"
gh pr merge <n> --merge --subject "Release X.Y.Z"
curl -s https://jouki.cz/aoe/api/health
```

Značka na dosavadním `main` je cesta zpět (`nasazeni-jouki-cz.md` §3.7:
nejdřív `git diff --name-only vX.Y.Z..main -- database/`, s migrací samotný
návrat kódu nestačí). GitHub API mívá výpadky (502) — opakovat s pauzou,
`gh pr view <n> --json state` ověří, jestli merge prošel. Release jen na
výslovný pokyn („pushni do mainu“).

## Dokumentace

- `docs/prehled-praci-a-zameru.md`: sekce 1 (stav větví a testů), 3.x
  (co se udělalo a proč, i zamítnuté varianty), 5 (co čeká), 6 (historie
  verzí s časy). Po každé změně chování doplnit — je to zdroj pro novou
  session.
- `docs/know-how/` (tento adresář): přenositelné know-how bez historie.
- `CLAUDE.md` v kořeni: zvyky a lokální prostředí autora; `CONTRIBUTING.md`
  pro cizí stroj.

## Tajemství

Repo je veřejné: žádné klíče (Steam, Scenario, TinyPNG, Coolify token)
nikdy do repa ani do výpisů. `.env` je gitignorované; klíče služeb jsou
mimo repo (`~/.scenario_api.json`, MMWT `settings.json`). Debug routy
`/api/dev/*` mají dva zámky (env + odmítnutí na https).
