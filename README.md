# Komunitní hry Robdiesalot (AoE2 DE)

## K čemu to je

Web pro přihlašování na Robovy komunitní custom hry v Age of Empires II: Definitive
Edition — nahrazuje ruční hlášení na Discordu ověřenými Steam údaji a dává Robovi
spolehlivé tlačítko Spectate do každé lobby. Podrobný návrh a zdůvodnění je v
[`docs/superpowers/specs/2026-09-03-aoe2-komunitni-hry-web-design.md`](docs/superpowers/specs/2026-09-03-aoe2-komunitni-hry-web-design.md).

## Co potřebuješ

- Node.js 24 nebo novější.
- PostgreSQL (vyvíjeno a testováno na verzi 17).
- Bezplatný Steam Web API klíč z <https://steamcommunity.com/dev/apikey>.

## Rozjetí

```
npm install
npm --prefix web install
cp .env.example .env
```

Vyplň v `.env` aspoň `DATABASE_URL` a `ADMIN_STEAM_ID` (viz níže) a spusť migrace:

```
npm run db:migrate
```

Pak spusť backend a frontend zvlášť (backend samotný proměnné z `.env` nenačítá —
je potřeba mít je nastavené v prostředí, ve kterém příkaz běží; viz sekce
Proměnné prostředí níže):

```
npm run dev
npm --prefix web run dev
```

Backend poslouchá na `PORT` (výchozí 3000), frontend na Vite dev serveru, který
`/api` proxuje na backend (`web/vite.config.ts`).

## Proměnné prostředí

Nic v projektu zatím `.env` samo nenačítá (viz sekce Testy — vědomě, kvůli
ochraně vývojové databáze). Proměnné je potřeba mít nastavené v prostředí, ve
kterém příkaz běží, např. v PowerShell:

```
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe"
$env:BASE_URL="http://localhost:3000"
$env:ADMIN_STEAM_ID="76561198xxxxxxxxx"
$env:STEAM_API_KEY="…"
npm start
```

**Nastav je vždycky všechny najednou**, ne jen tu, kterou zrovna měníš. Každý
`npm start` čte jen to, co má v prostředí zrovna k dispozici, a chybějící
`ADMIN_STEAM_ID` by při dalším Robově přihlášení přepsalo jeho `je_admin` na
false. Server se proto bez `DATABASE_URL` nebo `ADMIN_STEAM_ID` rovnou odmítne
spustit a řekne, která chybí.

| Proměnná | K čemu | Co se stane bez ní |
|---|---|---|
| `DATABASE_URL` | připojení k PostgreSQL, tvar `postgres://uzivatel:heslo@host:port/databaze` | server se nespustí — „Chybí proměnná prostředí DATABASE_URL." |
| `ADMIN_STEAM_ID` | Steam ID (64bitové) Robova účtu | server se nespustí. (Kdyby se spustil, přihlašovací routa by při každém přihlášení zapsala `je_admin = false` a Robovi by uprostřed večera zmizel panel režie bez jediné chybové hlášky.) |
| `BASE_URL` | veřejná adresa, na které web lidem běží (musí přesně sedět s tím, kam se prohlížeč skutečně dívá) | použije se `http://localhost:3000`. Steam se po ověření vrací na `BASE_URL` a návrat na jinou adresu se odmítne, takže přihlášení přes tunel bez správné hodnoty neprojde |
| `PORT` | port, na kterém backend poslouchá (výchozí 3000) | použije se výchozí hodnota 3000 |
| `STEAM_API_KEY` | klíč pro Steam Web API (odehrané hodiny ve hře) | hráčům se neukážou odehrané hodiny — zbytek funguje |
| `LOG_LEVEL` | úroveň serverového logu (výchozí `info`) | loguje se od `info` výš |

## Testy

- `npm test` — rychlé hermetické testy, bez sítě a bez databáze.
- `npm run test:db` — testy nad databází, potřebují běžící PostgreSQL a
  proměnnou `DATABASE_URL` nastavenou na testovací databázi, jejíž jméno končí
  na `_test` (např. `rob_aoe_test`). Tyhle testy volají `TRUNCATE` nad
  tabulkami cílové databáze, takže je před spuštěním nastavená kontrola: pokud
  jméno databáze v `DATABASE_URL` nekončí na `_test`, run se rovnou zastaví
  chybou dřív, než se stihne cokoliv smazat.
- `npm run test:web` — testy frontendu (`web/`).

## Vystavení ven

### Krok 1 — sestavit produkční build

```
npm run build
```

`npm run build` sestaví backend (`tsc`), zkopíruje SQL migrace do `dist/database`
(aby je po sestavení našel i zkompilovaný migrátor) a sestaví frontend
(`web/dist`).

Spuštění produkčního serveru (obsluhuje API i sestavený frontend z jednoho
procesu, bez běžícího Vite):

```
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe"
$env:BASE_URL="http://localhost:3000"
$env:ADMIN_STEAM_ID="76561198xxxxxxxxx"
$env:STEAM_API_KEY="…"
npm start
```

Otevři `http://localhost:3000` a ověř, že se stránka načte i s CSS/JS ze
`web/dist` — bez Vite dev serveru běžícího vedle.

### Krok 2 — vystavit to tunelem (dělá člověk, ne tenhle skript)

**Ne port forwarding** — vystavil by domácí IP adresu. Postgres zůstává jen na
`localhost`, ven jde jen web přes Cloudflare Tunnel:

```
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Vezmi vypsanou adresu `https://…trycloudflare.com`, nastav ji do `BASE_URL` a
server restartuj — Steam se po přihlášení vrací právě na `BASE_URL`, takže se
to musí shodovat. **Při restartu nastav znovu i všechny ostatní proměnné**
(hlavně `ADMIN_STEAM_ID`), jinak se server odmítne spustit:

```
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe"
$env:BASE_URL="https://…trycloudflare.com"
$env:ADMIN_STEAM_ID="76561198xxxxxxxxx"
$env:STEAM_API_KEY="…"
npm start
```

### Krok 3 — ověřit realtime přes tunel (dělá člověk, potřeba dva prohlížeče)

Otevři tunelovou adresu ve dvou prohlížečích. V jednom se přihlas do akce a
ověř, že se to ve druhém objeví **samo, bez refreshe**. Pokud by se změny
objevovaly opožděně nebo v dávkách, chybí na SSE routě (`/api/stream`)
hlavičky `cache-control: no-cache` a `x-accel-buffering: no` — v aktuálním
kódu (`src/http/routes/stream.ts`) jsou obě nastavené.

## Jak to funguje ve zkratce

AoE2 DE má vlastní protokol pro odkazy do lobby. `aoe2de://0/<id>` je
připojení jako hráč, `aoe2de://1/<id>` je připojení jako **divák** do téže
lobby — liší se jen prvním číslem za `aoe2de://`. Ukládá se jen číselné ID
lobby a oba odkazy se z něj odvozují (viz `src/aoe/lobbyUri.ts`).

## Známá omezení

- Chování na verzi hry z Microsoft Store / Xbox aplikace není ověřené — nikdo
  z týmu tuhle verzi nemá k dispozici na otestování.
- URL helper AoE2 DE (`AOEURLHelper.exe`), který odkazy `aoe2de://` zpracovává,
  je hlášeně nespolehlivý, pokud hráč v dané herní relaci ještě nebyl v lobby
  prohlížeči. Proto je na kontrolní obrazovce vždy vidět i název lobby a číslo
  k ručnímu vyhledání, ne jen klikací odkaz.
