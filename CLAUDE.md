# Pokyny pro práci na tomhle repu

Web pro komunitní večery českého AoE2 DE streamera Robdiesalota. Lidé se
přihlásí Steamem, Rob za vysílání skládá zápasy, každý dostane instrukce na
míru, host jednou vloží odkaz z lobby a všem — včetně Robova Spectate — z něj
vznikne funkční odkaz.

> **Nejsi autor repa?** Tenhle soubor popisuje zvyky a **lokální prostředí
> autora** — cesty a jména databází níž platí na jeho stroji, ne na tvém.
> Rozjetí na cizím stroji, mapu kódu a pasti má [`CONTRIBUTING.md`](CONTRIBUTING.md).
>
> **Nová session, která má navázat na předchozí práci:** nejdřív přečíst
> [`docs/prehled-praci-a-zameru.md`](docs/prehled-praci-a-zameru.md) — stav,
> postup jedné změny, záměry za funkcemi, čekající rozhodnutí. Po větší
> práci ho aktualizovat (sekce 1, 5, 6).

**Celý produkt stojí na jedné číslici.** `aoe2de://0/<id>` připojí do lobby jako
hráče, `aoe2de://1/<id>` do téže lobby jako diváka. Ukládá se **jen to číslo**,
oba odkazy se z něj odvozují. Nikdy neukládat sestavené URI.

## Větve, verze a nasazení (platí pro každého agenta v tomhle repu)

Web běží na **jouki.cz** ve třech kopiích a nasazuje se samo z commitu:
`dev` → <https://jouki.cz/aoe/dev>, `main` → <https://jouki.cz/aoe>,
`experimental` → <https://jouki.cz/aoe/experimental>.
Podrobně v [`docs/nasazeni-jouki-cz.md`](docs/nasazeni-jouki-cz.md).

- **Pracuje se ve větvi `dev`.** Do `main` se přímo necommituje.
- **`experimental` je na velké pokusy, které se klidně zahodí.** Zakládá se
  z `dev`, nasazuje se na `/aoe/experimental` nad vlastní databází a do
  `main` nejde nikdy přímo — vždycky přes merge do `dev`. Smysl: `dev`
  zůstane kdykoliv vydatelná pro hotfix. Postup a řešení konfliktu verzí
  má [`docs/nasazeni-jouki-cz.md`](docs/nasazeni-jouki-cz.md) §1.1.
- **Každý commit, který mění chování, zvedne verzi:** `npm run verze`
  (patch) v tomtéž commitu. Nová funkce nebo migrace = `npm run verze -- minor`.
  Verze je v `package.json` a `src/shared/verze.ts`, příkaz mění obojí.
- **Na `experimental` má verze tvar `X.Y.Z-A.B`** — před pomlčkou verze
  devu, ze které pokus vyšel (nemění se), za pomlčkou vlastní dvojčíslí
  pokusu; první číslo webu pokus nikdy nemění. Zakládá se zdvojením
  (`npm run verze -- experiment`: `0.16.3` → `0.16.3-16.3`), po mergi do
  devu se výsledná verze devu dopočítá `npm run verze -- z-experimentu`
  a pokus se přezaloží z nové verze devu. Pravidla a tabulka případů:
  [`docs/nasazeni-jouki-cz.md`](docs/nasazeni-jouki-cz.md) §2.1.
- **Release jen na výslovný pokyn** („releasni“, „pushni do main“): PR
  `dev → main` a merge. Tím se nasadí ostrá verze. `dev` se nemaže.
- Po nasazení ověřit `curl https://jouki.cz/aoe/dev/api/health` (nebo `/aoe/`),
  že vrací verzi, která se právě pushla.
- **Do repa nikdy nepatří přihlašovací údaje** — je veřejné. Nasazení žádné
  nepotřebuje.

## Vzhled

Web má od 8. 9. 2026 (zatím jen `experimental`) grafický kabátek v podobě
herního rozhraní AoE2 DE s českou heraldikou. Barvy, písmo, rámy, odkud
jsou obrázky a jak je vygenerovat znovu — [`docs/grafika.md`](docs/grafika.md).
**Barvu nikdy nepsat napevno do pravidla**, paleta je v `:root`.

## Konvence

- **Identifikátory i uživatelské texty česky**, commity anglicky (rozkazovací
  způsob v předmětu). Komentáře česky a k věci: proč, ne co.
- TypeScript ESM: `NodeNext`, `strict`, `noUncheckedIndexedAccess`,
  `verbatimModuleSyntax`, přípona `.js` v importech.
- Rozdělení testů: `*.test.ts` hermetické (bez sítě a DB), `*.db.test.ts` proti
  databázi, `web/src/**/*.test.tsx` frontend.
- SSE posílá **vždycky celý stav, nikdy přírůstky**. Obnova po výpadku je pak
  zdarma. Redakce podle diváka (`redigujProDivaka`) běží nad jedním kanálem.
- Jeden kanál v hubu (`KANAL_AKCE`), ne kanál na akci. `buildAkceStav()` žádné
  id nebere — vždycky staví tu jednu otevřenou akci, kterou pouští migrace 003.

## Příkazy

```
npm run db:migrate          # migrace (čte .env)
npm run dev                 # server s watch
npm --prefix web run dev    # frontend s watch
npm run build && npm start  # produkční build a běh na :3000
npm run verze               # zvedne patch verzi (package.json + src/shared/verze.ts)

npm test                    # hermetické
npm run test:db             # databázové — POZOR níž
npm --prefix web test       # frontend
npx tsc --noEmit            # typová kontrola BACKENDU — na web/ nesahá
npm --prefix web exec tsc -- -b --force   # typová kontrola frontendu
```

**`npx tsc --noEmit` frontend nekontroluje.** Kořenový `tsconfig.json` `web/`
nezahrnuje; frontend má vlastní `tsc -b`, který běží až uvnitř `npm run build`.
A protože `build` je řetěz přes `&&`, chyba v typech (klidně jen ve fixturách
testů) tiše zastaví `vite build` — `web/dist` zůstane starý, server dál
servíruje předchozí bundle a v prohlížeči se změna neprojeví. Po zásahu do
sdílených typů proto vždycky doběhnout celý `npm run build` a podívat se, že
se změnil hash souboru ve `web/dist/assets`.

`.env` čtou jen `dev`, `start` a `db:migrate` (`--env-file-if-exists`).
Testy schválně ne.

## Bezpečnost a zábradlí

- **`DATABASE_URL` nikdy nemíří na `rob_aoe`, když běží `npm run test:db`.**
  Ty testy volají `TRUNCATE`. Kontrola na příponu `_test` je druhá pojistka, ne
  první — první jsi ty.
- `.env` je gitignorované a musí takové zůstat. Obsahuje Steam API klíč.
- Zkušební dveře (`/api/dev/*`) mají dva zámky: bez `DEV_PRISTUP=true` se
  routy vůbec neregistrují a i se zapnutou proměnnou odmítají obsluhovat,
  jakmile `BASE_URL` míří na `https`. Ten druhý zámek je ten, který drží —
  proměnná v `.env` zůstane zapnutá napořád. Nesahat na něj.
- Admin je sloupec `player.je_admin`, žádné heslo. Viz README.

## Lokální prostředí (Windows)

- `psql` není v PATH: `/c/Program\ Files/PostgreSQL/17/bin/psql.exe`
- Databáze `rob_aoe` (ostrá) a `rob_aoe_test`, přihlášení `postgres/postgres`.
- Server drží port 3000; před restartem starý proces zabít
  (`Get-NetTCPConnection -LocalPort 3000 -State Listen`).
- Bash i PowerShell jsou k dispozici, každý má svou syntaxi.

## Jak se tu pracuje

Spouštění a živé ověření dělá Claude, ne uživatel: přebuildovat, restartovat,
ověřit curlem a teprve pak odpovídat. Zelená sada testů není důkaz, že UI
funguje — několik vad viditelných na první pohled jí prošlo. Vizuální kontrola
zůstává na uživateli.
