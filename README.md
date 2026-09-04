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

`npm run dev`, `npm start` a `npm run db:migrate` si `.env` načtou samy
(`node --env-file-if-exists=.env`). Testy nad databází ho **záměrně nečtou** —
kdyby ho četly, `npm run test:db` by mazal tabulky ve vývojové databázi
z `.env` místo v testovací (viz sekce Testy).

Co je v prostředí nastavené ručně, má přednost před `.env`. Pro jednorázový
běh s jinou hodnotou tedy stačí proměnnou nastavit v shellu, např. v PowerShell:

```
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe"
$env:BASE_URL="http://localhost:3000"
$env:ADMIN_STEAM_ID="76561198xxxxxxxxx"   # nebo $env:ADMIN_BOOTSTRAP="true"
$env:STEAM_API_KEY="…"
npm start
```

**Nastav je vždycky všechny najednou**, ne jen tu, kterou zrovna měníš. Každý
`npm start` čte jen to, co má v prostředí zrovna k dispozici, a chybějící
`ADMIN_STEAM_ID` by při dalším Robově přihlášení přepsalo jeho `je_admin` na
false. Server se proto bez `DATABASE_URL` a bez `ADMIN_STEAM_ID` rovnou odmítne
spustit a řekne, která chybí.

**Když Robovo Steam ID nemáš**, nastav místo něj `ADMIN_BOOTSTRAP=true`.
Adminem se pak stane první, kdo se přihlásí — a jenom dokud žádný admin
neexistuje: každý další už práva nedostane a tomu prvnímu se při dalších
přihlášeních neodeberou. Není to dočasný režim, může zůstat zapnutý natrvalo;
jakmile admin existuje, nedělá nic a server na něj přestane upozorňovat.

Dokud admin neexistuje, platí, že **kdo drží adresu, drží režii** — server na to
při startu upozorní, takže se přihlas dřív, než adresu komukoliv pošleš. Stejné
pravidlo platí, kdyby někdo někdy smazal řádek s adminem z tabulky `player`:
další přihlášený režii převezme.

Vyplněné `ADMIN_STEAM_ID` má vždycky přednost a `ADMIN_BOOTSTRAP` přebije, takže
zapsáním Robova ID se prvnímu adminovi práva při jeho dalším přihlášení odeberou.

| Proměnná | K čemu | Co se stane bez ní |
|---|---|---|
| `DATABASE_URL` | připojení k PostgreSQL, tvar `postgres://uzivatel:heslo@host:port/databaze` | server se nespustí — „Chybí proměnná prostředí DATABASE_URL." |
| `ADMIN_STEAM_ID` | Steam ID (64bitové) Robova účtu | server se nespustí, dokud nezapneš `ADMIN_BOOTSTRAP`. (Kdyby se spustil, přihlašovací routa by při každém přihlášení zapsala `je_admin = false` a Robovi by uprostřed večera zmizel panel režie bez jediné chybové hlášky.) |
| `ADMIN_BOOTSTRAP` | pojistka pro provoz bez Robova Steam ID: `true` udělá admina z prvního přihlášeného, dokud žádný admin neexistuje | nic — je to náhrada za `ADMIN_STEAM_ID`, ne doplněk. Když je vyplněné `ADMIN_STEAM_ID`, tahle proměnná se ignoruje |
| `BASE_URL` | veřejná adresa, na které web lidem běží (musí přesně sedět s tím, kam se prohlížeč skutečně dívá) | použije se `http://localhost:3000`. Steam se po ověření vrací na `BASE_URL` a návrat na jinou adresu se odmítne, takže přihlášení přes tunel bez správné hodnoty neprojde |
| `PORT` | port, na kterém backend poslouchá (výchozí 3000) | použije se výchozí hodnota 3000 |
| `STEAM_API_KEY` | bezplatný klíč z <https://steamcommunity.com/dev/apikey>, kterým se web ptá Steamu na odehrané hodiny v AoE2 a na profilovou přezdívku s avatarem | neukážou se odehrané hodiny ani avatary. ELO, herní přezdívka i počet odehraných her chodí ze žebříčku Worlds Edge, který žádný klíč nechce, takže zbytek funguje beze změny. Bez klíče se Steamu vůbec neptáme, takže se nikomu u jména neobjeví varování o chybě |
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

## Zkouška večera nasucho (bez čtyř Steam účtů)

Celý večer se dá projít samotný, na jednom stroji. Zapni v `.env`
`DEV_PRISTUP=true` (na localhostu je to výchozí) a používej dvě adresy:

- `http://localhost:3000/api/dev/naplnit?pocet=3` — nasype do právě běžící
  akce zkušební hráče (Pepa, Jana, Karel, Lída, Mirek, Tonda — pořád tytéž,
  takže opakované volání nikoho nezdvojí). S vlastním účtem jsi čtvrtý a je
  z čeho složit 2v2.
- `http://localhost:3000/api/dev/login?jmeno=Pepa` — přihlásí tě jako ten
  zkušební hráč, bez Steamu. Otevři si to v anonymním okně a máš vedle sebe
  dvě různé role naráz: v jednom okně režii, ve druhém obrazovku hráče nebo
  hosta. Zpátky k sobě se dostaneš přes `?steamId=<tvoje Steam ID>`.

Na stránce je k tomu dole čárkovaná lišta „Zkušební režim“, takže se adresy
nemusí psát ručně.

**Přenos režie.** Admin je natrvalo ten, kdo se přihlásil první — obvykle ty.
Tím pádem si vlastním účtem nejde vyzkoušet, jak web vypadá očima obyčejného
hráče: panel režie svítí i uprostřed zápasu, který zrovna hraješ. Tlačítko
„Režii dej účtu Rezie“ ji předá zkušebnímu režisérovi (přihlásíš se za něj
v anonymním okně), ty zůstaneš běžný hráč se svým skutečným Steam účtem a
`Režii dej tomuhle účtu` ti ji kdykoliv vrátí. Adminů je vždycky přesně
jeden — přepis běží jedním příkazem, aby mezistav neprolétl ven přes SSE.

Samotné zkušební přihlášení admina neuděluje a na cizí práva nesahá; režii
mění jen ta jedna routa, která je na to určená.

**Než web vystavíš ven, vezmi si režii zpátky.** Zkušební režisér je pro
`ADMIN_BOOTSTRAP` plnohodnotný admin, takže bootstrap nikoho dalšího nepovýší
— a tlačítko, kterým se režie vrací, žije za zkušebními dveřmi, které se přes
`https` zavřou. Kdo si zkusí večer očima hráče a pak nastartuje tunel, přijde
o panel režie a v UI se k němu nedostane. Cesta zpátky vede jen přes databázi,
jedním příkazem (dvěma by mezistav bez admina stihl proletět ven přes SSE):

```
UPDATE player SET je_admin = (steam_id = '76561198xxxxxxxxx');
```

**Dveře se samy zavírají.** Zapnutá proměnná nestačí: obě routy odmítají
obsluhovat, jakmile `BASE_URL` míří na `https`, tedy jakmile web běží přes
tunel. Proměnná tak může v `.env` zůstat ležet zapnutá — přes veřejnou
adresu se jimi přihlásit nedá. Při startu se do logu vypíše, v jakém stavu
jsou.

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
ověř, že se to ve druhém objeví **samo, bez refreshe**.

**Přes `*.trycloudflare.com` to samo neteče a je to vada tunelu, ne webu.**
Bezplatný quick tunnel drží celé tělo odpovědi, dokud odpověď neskončí — a
SSE stream schválně nekončí nikdy. Změřeno sondou mimo aplikaci: na
localhostu chodí události po sekundě, přes tunel nedorazí za 40 sekund ani
bajt, a když se odpověď nechá po čtyřech sekundách skončit, spadne všechno
najednou v okamžiku jejího konce. Nepomůže výplň (zkoušeno do 16 kB), vypnutá
komprese, ani přepnutí `cloudflared --protocol http2` místo výchozího QUIC.
Hlavičkami se to ubránit nedá: `x-accel-buffering: no` edge z odpovědi
zahodí. Chová se tak i `text/plain`, takže o typ obsahu nejde.

Proto se stránka po pár vteřinách ticha sama přepne na **dotazování**
`/api/akce` (viz `web/src/useAkceStav.ts`). Vrací doslova týž redigovaný
payload jako stream, takže se večer chová správně, jen se stav obnovuje po
třech vteřinách místo okamžitě. Až se objeví první zpráva ze streamu,
dotazování se samo vypne.

Když chceš skutečný realtime, potřebuješ cestu ven, která nebufferuje —
pojmenovaný Cloudflare tunel na vlastní doméně, Tailscale Funnel, ngrok nebo
podobně. Poznáš to na první pohled: hláška „Obnovuji spojení…“ zmizí a změny
naskakují okamžitě, ne po třívteřinových skocích.

## Jak to funguje ve zkratce

AoE2 DE má vlastní protokol pro odkazy do lobby. `aoe2de://0/<id>` je
připojení jako hráč, `aoe2de://1/<id>` je připojení jako **divák** do téže
lobby — liší se jen prvním číslem za `aoe2de://`. Ukládá se jen číselné ID
lobby a oba odkazy se z něj odvozují (viz `src/aoe/lobbyUri.ts`).

## Známá omezení

- Bezplatný Cloudflare quick tunnel (`*.trycloudflare.com`) SSE nepropustí —
  viz Krok 3 výše. Web na tom nespadne (přepne se na dotazování), ale realtime
  přes něj nedostaneš.
- Předaná režie na zkušebním účtu přežije zavření zkušebních dveří, takže
  vystavení ven tě může o panel režie připravit — viz konec sekce „Zkouška
  večera nasucho“. Vyplněné `ADMIN_STEAM_ID` tuhle díru zavírá celou.
- Chování na verzi hry z Microsoft Store / Xbox aplikace není ověřené — nikdo
  z týmu tuhle verzi nemá k dispozici na otestování.
- URL helper AoE2 DE (`AOEURLHelper.exe`), který odkazy `aoe2de://` zpracovává,
  je hlášeně nespolehlivý, pokud hráč v dané herní relaci ještě nebyl v lobby
  prohlížeči. Proto je na kontrolní obrazovce vždy vidět i název lobby a číslo
  k ručnímu vyhledání, ne jen klikací odkaz.
