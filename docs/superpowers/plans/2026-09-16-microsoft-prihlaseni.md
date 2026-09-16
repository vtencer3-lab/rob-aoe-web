# Přihlášení Microsoft účtem — implementační plán

> **Pro agenty:** POVINNÝ SUB-SKILL: použij `superpowers:subagent-driven-development`
> (doporučeno) nebo `superpowers:executing-plans` a jdi úkol po úkolu. Kroky
> mají zaškrtávátka (`- [ ]`) kvůli sledování postupu.

**Cíl:** Hráč, který má AoE2 DE z Microsoft Store nebo přes PC Game Pass, se
přihlásí Microsoft účtem a na webu funguje úplně stejně jako hráč ze Steamu.

**Architektura:** Klíč hráče přestává být Steam ID a stává se z něj neutrální
`hrac_id` se sloupcem na platformu. Microsoft se přihlašuje přes OAuth s scope
`XboxLive.signin`, token se vymění za XSTS, ze kterého vypadne XUID a gamertag.
Gamertagem se ve Worlds Edge dohledá herní profil a od té chvíle je hráč
v systému k nerozeznání od Steam hráče.

**Tech stack:** TypeScript ESM (NodeNext, strict), Fastify 5, PostgreSQL přes
`pg`, Vitest, React + Vite ve `web/`.

**Spec:** [`docs/superpowers/specs/2026-09-16-microsoft-prihlaseni-design.md`](../specs/2026-09-16-microsoft-prihlaseni-design.md)

## Globální omezení

- **Pracuje se ve větvi `dev`.** Do `main` se přímo necommituje.
- **Identifikátory i uživatelské texty česky**, commity anglicky v rozkazovacím
  způsobu, komentáře česky a o tom *proč*, ne *co*.
- **Každý commit, který mění chování, zvedne verzi** v tomtéž commitu:
  `npm run verze` (patch), `npm run verze -- minor` (nová funkce nebo migrace).
- **Do repa nikdy nepatří přihlašovací údaje** — repo je veřejné.
  `MS_CLIENT_ID` a `MS_CLIENT_SECRET` žijí jen v Coolify.
- `npx tsc --noEmit` **frontend nekontroluje**. Vždycky i
  `npm --prefix web exec tsc -- -b --force` a celý `npm run build`.
- Kontrola před každým commitem, v tomto pořadí:

  ```bash
  npx tsc --noEmit
  npm --prefix web exec tsc -- -b --force
  npm test
  npm --prefix web test -- --run
  npm run build; echo "EXIT=$?"
  ```

  `npm run build` je řetěz přes `&&` — nikdy ho neposílat do `grep`, vždycky
  číst návratový kód.
- Databázové testy běží na VPS, lokálně Postgres neběží:
  `ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"`
- **Žádný token do logu.** Microsoft access token, XSTS token ani `uhs`
  se nikdy nesmí dostat do `console` ani do `app.log` — ani v chybové větvi,
  ani "dočasně při ladění". Logují se jen přeložené hlášky.
- **Zelená sada testů není důkaz, že UI funguje.** Vizuální kontrolu dělá
  uživatel.

---

## Mapa souborů

**Nové:**

| soubor | odpovědnost |
|---|---|
| `database/027_hrac_id.sql` | přejmenování klíče a sloupce se jménem, nové sloupce platformy |
| `src/auth/microsoftOAuth.ts` | čistě výpočetní část OAuth: PKCE, authorize URL, návratová adresa |
| `src/auth/microsoftOAuth.test.ts` | hermetické testy k tomu |
| `src/external/xboxLive.ts` | výměna Microsoft tokenu za XSTS, gamerpic, herní historie |
| `src/external/xboxLive.test.ts` | hermetické testy k tomu (parsování odpovědí, chybové kódy) |
| `src/auth/microsoftRoutes.ts` | routy `/api/auth/microsoft` a `/api/auth/microsoft/return` |
| `src/auth/microsoftRoutes.db.test.ts` | databázové testy přihlašovací cesty |

**Měněné (hlavní):**

| soubor | co se v něm mění |
|---|---|
| `src/db/players.ts` | nové sloupce, `upsertHracXbox`, přejmenování |
| `src/db/sessions.ts`, `src/db/events.ts`, `src/db/chat.ts`, `src/db/matches.ts` | přejmenovaný sloupec v SQL |
| `src/external/worldsEdge.ts` | dotaz podle aliasu a podle `profile_id`, profil ve výsledku |
| `src/external/worldsEdgeLobby.ts` | mapa přes `profile_id` místo filtru na `/steam/` |
| `src/players/refresh.ts` | zdroje statistik podle platformy |
| `src/http/server.ts` | registrace nových rout, volba zdrojů podle platformy |
| `src/config.ts` | `msClientId`, `msClientSecret`, varování při startu |
| `src/shared/types.ts` | `hracId`, `platformaJmeno`, `Vlastnictvi` |
| `web/src/App.tsx` | druhé přihlašovací tlačítko |
| `web/src/views/KartaHrace.tsx` | platforma u jména |

---

## Úkol 1: Sonda a brána

**Tohle není kód k udržení.** Výstupem je odpověď na otázku, jestli nám
Microsoft `XboxLive.signin` vůbec povolí. Dokud na ni není odpověď, nesmí
vzniknout žádný produkční kód.

**Soubory:**
- Vytvořit: `<scratchpad>/sonda-xbox.mjs` (scratchpad, **ne** repo)
- Upravit: `docs/superpowers/specs/2026-09-16-microsoft-prihlaseni-design.md` (sekce 2.3 → ověřeno)

**Rozhraní:**
- Konzumuje: nic
- Produkuje: zápis do specu; hodnoty, které úkoly 5–9 potřebují znát
  (tvar `DisplayClaims`, `titleId` hry, tvar gamerpic adresy)

- [ ] **Krok 1: Registrace aplikace v Microsoft Entra**

Na <https://entra.microsoft.com> → App registrations → New registration:

- Name: `Robovy AoE večery`
- Supported account types: **Personal Microsoft accounts only**
- Redirect URI: typ **Web**, hodnota `http://localhost:3000/api/auth/microsoft/return`

Po založení přidat do Redirect URIs ještě:

```
https://jouki.cz/aoe/api/auth/microsoft/return
https://jouki.cz/aoe/dev/api/auth/microsoft/return
https://jouki.cz/aoe/experimental/api/auth/microsoft/return
```

V Certificates & secrets vytvořit client secret. Client ID a secret uložit
**mimo repo** (uživatel je vloží do Coolify v úkolu 12).

- [ ] **Krok 2: Sonda ve scratchpadu**

```js
// sonda-xbox.mjs — jednorázová sonda, po zápisu výsledků do specu se maže.
// Spouští se: node sonda-xbox.mjs "<kod-z-prohlizece>"
import { createServer } from "node:http";

const CLIENT_ID = process.env.MS_CLIENT_ID;
const CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const REDIRECT = "http://localhost:3000/api/auth/microsoft/return";

const authUrl =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize?" +
  new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT,
    scope: "XboxLive.signin",
    state: "sonda",
  });
console.log("Otevři v prohlížeči:\n" + authUrl + "\n");

// Zachytí návrat a projde celý řetěz. Vypisuje syrové odpovědi — o to jde.
createServer(async (req, res) => {
  const kod = new URL(req.url, "http://localhost:3000").searchParams.get("code");
  res.end("Hotovo, vrat se do terminalu.");
  if (!kod) return;

  const token = await (await fetch(
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code: kod,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT,
      }),
    },
  )).json();
  console.log("1) token:", JSON.stringify(token).slice(0, 200));
  if (!token.access_token) return;

  const xbl = await (await fetch("https://user.auth.xboxlive.com/user/authenticate", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: "d=" + token.access_token,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    }),
  })).json();
  console.log("2) XBL:", JSON.stringify(xbl.DisplayClaims));

  const xsts = await (await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      Properties: { SandboxId: "RETAIL", UserTokens: [xbl.Token] },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    }),
  })).json();
  console.log("3) XSTS DisplayClaims:", JSON.stringify(xsts.DisplayClaims));

  const xui = xsts.DisplayClaims?.xui?.[0];
  if (!xui) return;
  const hlavicka = {
    Authorization: `XBL3.0 x=${xui.uhs};${xsts.Token}`,
    accept: "application/json",
  };

  const profil = await (await fetch(
    `https://profile.xboxlive.com/users/xuid(${xui.xid})/profile/settings?settings=GameDisplayPicRaw`,
    { headers: { ...hlavicka, "x-xbl-contract-version": "3" } },
  )).json();
  console.log("4) gamerpic:", JSON.stringify(profil).slice(0, 400));

  const tituly = await (await fetch(
    `https://titlehub.xboxlive.com/users/xuid(${xui.xid})/titles/titlehistory/decoration/detail`,
    { headers: { ...hlavicka, "x-xbl-contract-version": "2", "accept-language": "en-US" } },
  )).json();
  const aoe = (tituly.titles ?? []).filter((t) => /Age of Empires II/i.test(t.name ?? ""));
  console.log("5) AoE2 v historii:", JSON.stringify(aoe).slice(0, 600));

  // 6) herní profil podle gamertagu
  const gt = encodeURIComponent(JSON.stringify([xui.gtg]));
  const we = await (await fetch(
    `https://aoe-api.worldsedgelink.com/community/leaderboard/getPersonalStat?title=age2&aliases=${gt}`,
  )).json();
  console.log("6) Worlds Edge podle gamertagu:", JSON.stringify(we.statGroups?.[0]?.members));
}).listen(3000);
```

- [ ] **Krok 3: Tester se jednou přihlásí**

Uživatel pošle testerovi adresu z kroku 2 a zároveň návod z přílohy B specu.
Zaznamenat:

1. Prošel `XboxLive.signin`, nebo Microsoft vrátil chybu? (**brána**)
2. Obsahuje `xui[0]` klíče `xid` a `gtg`?
3. Vrátil `titlehub` AoE2 DE? Jaké má `titleId`? Co vrátí účet se skrytým
   soukromím (tester si ho na minutu přepne v nastavení Xboxu)?
4. Souhlasí `gtg` s aliasem, který tester vidí ve hře? Našel ho krok 6
   podle gamertagu, a začíná nalezené `name` na `/xboxlive/`?
5. Co udělal `aoe2de://0/123456789` a co vypsal `reg query`?

- [ ] **Krok 4: Zapsat výsledky do specu a rozhodnout**

Sekci 2.3 specu přepsat z „co ověřené není“ na naměřené hodnoty. Do sekce 6.2
doplnit konkrétní `titleId`.

**Brána:** když `XboxLive.signin` neprošel, **úkoly 5 až 9 se ruší** a místo
nich se plánuje příloha A specu (párování přes založenou lobby). Úkoly 2, 3,
4, 10 a 12 platí beze změny — jsou na Microsoftu nezávislé.

- [ ] **Krok 5: Commit (jen spec, sonda se maže)**

```bash
rm "<scratchpad>/sonda-xbox.mjs"
git add docs/superpowers/specs/2026-09-16-microsoft-prihlaseni-design.md
git commit -m "Docs: record what the Xbox Live sign-in probe measured"
```

---

## Úkol 2: Migrace 027 a přejmenování klíče hráče

Klíč hráče přestává být Steam ID. Migrace a přejmenování v kódu **musí být
jeden commit** — jakmile se přejmenuje sloupec, každý dotaz ve starém kódu
selže.

**Nulová změna chování.** Důkazem je zelená sada testů beze změny jejich
očekávání (mění se jen jména v nich).

**Soubory:**
- Vytvořit: `database/027_hrac_id.sql`
- Upravit: všechny `.ts`/`.tsx` v `src/` a `web/src/` (mechanicky, skriptem)
- Nesahat: `database/001`–`026` (historie migrací musí zůstat, jak byla)

**Rozhraní:**
- Konzumuje: nic
- Produkuje: sloupec `player.hrac_id` a pole `hracId` napříč kódem;
  `PlayerRow` s poli `hracId`, `platforma`, `steamId`, `xboxXuid`,
  `xboxGamertag`, `weProfil`, `weProfilId`

- [ ] **Krok 1: Napsat migraci**

```sql
-- database/027_hrac_id.sql
-- Klíč hráče přestává být Steam ID: hráč z Microsoft Store žádné nemá a bez
-- neutrálního klíče by se do databáze nedal zapsat vůbec. Hodnoty stávajících
-- řádků se nemění, takže se nesahá na data ani na cizí klíče — mění se jen
-- jméno sloupce. Zkušební hráči (`test:pepa`) tam ostatně nejsou od začátku.
ALTER TABLE player    RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE session   RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE prihlaska RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE prihlaska RENAME COLUMN svolal_steam_id TO svolal_hrac_id;
ALTER TABLE ucastnik  RENAME COLUMN steam_id TO hrac_id;
ALTER TABLE zprava    RENAME COLUMN steam_id TO hrac_id;

-- Platforma a identifikátory na ní. `steam_id` se vrací jako obyčejný sloupec:
-- u Steam hráčů má stejnou hodnotu jako klíč, u Microsoft hráčů je prázdný.
ALTER TABLE player ADD COLUMN platforma TEXT NOT NULL DEFAULT 'steam'
  CHECK (platforma IN ('steam', 'xbox'));
ALTER TABLE player ADD COLUMN steam_id      TEXT UNIQUE;
ALTER TABLE player ADD COLUMN xbox_xuid     TEXT UNIQUE;
ALTER TABLE player ADD COLUMN xbox_gamertag TEXT;

-- Profil ve Worlds Edge. `we_profil_id` je číslo, které backend hry používá
-- pro obě platformy — na něm stojí rozpoznání hráčů v seznamu lobby.
ALTER TABLE player ADD COLUMN we_profil    TEXT;
ALTER TABLE player ADD COLUMN we_profil_id INTEGER UNIQUE;

-- Dosavadní hráči jsou všichni ze Steamu; zkušební `test:` nechat bez steam_id.
UPDATE player SET steam_id = hrac_id WHERE hrac_id ~ '^\d{17}$';
```

- [ ] **Krok 2: Ověřit migraci proti testovací databázi**

```bash
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
```

Očekávaný výsledek: **selže**, protože kód ještě mluví o `steam_id`. To je
v pořádku — tímhle krokem se jen potvrdí, že migrace samotná projde a že
červená je způsobená kódem, ne SQL.

- [ ] **Krok 3: Napsat přejmenovací skript do scratchpadu**

Globální „najdi a nahraď“ tady **nesmí** projít: `steamName`, `steamHodiny`,
`steamApiKey`, `verifyWithSteam` a spol. zůstávají, protože opravdu jde
o Steam. Proto výslovný seznam a hranice slova.

```js
// <scratchpad>/prejmenuj-hracid.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Pořadí je od nejdelšího: kdyby se hranice slova někde nechytla, ať se
// dřív trefí ta konkrétnější dvojice.
const NAHRADY = [
  ["clenoveSteamIds", "clenoveHraci"],
  ["svolal_steam_id", "svolal_hrac_id"],
  ["steamIdAdmina", "hracIdAdmina"],
  ["adminSteamIds", "adminHracIds"],
  ["hostSteamId", "hostHracId"],
  ["mapaSteamId", "mapaHracu"],
  ["kdoSteamId", "kdoHracId"],
  ["o_steam_id", "o_hrac_id"],
  ["jaSteamId", "jaHracId"],
  ["steamIds", "hracIds"],
  ["steamId", "hracId"],
  ["steam_id", "hrac_id"],
];

// Jen src/ a web//: database/001–026 je historie migrací a musí zůstat.
const soubory = execSync("git ls-files src web/src", { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f));

let zmeneno = 0;
for (const soubor of soubory) {
  const puvodni = readFileSync(soubor, "utf8");
  let text = puvodni;
  for (const [z, na] of NAHRADY) {
    text = text.replace(new RegExp(`\\b${z}\\b`, "g"), na);
  }
  if (text !== puvodni) {
    writeFileSync(soubor, text);
    zmeneno++;
  }
}
console.log(`Upraveno souborů: ${zmeneno}`);
```

- [ ] **Krok 4: Spustit skript a zkontrolovat, co zbylo**

```bash
node "<scratchpad>/prejmenuj-hracid.mjs"
grep -rnE "\bsteamId\b|\bsteam_id\b" src web/src --include="*.ts" --include="*.tsx"
```

Očekávaný výsledek druhého příkazu: **jediný zbytek** je `extractSteamId`
v `src/auth/steamOpenId.ts` a `player.steam_id` v novém SQL z kroku 6 —
oboje je vědomé, protože jde opravdu o Steam. Cokoliv jiného dohledat ručně.

- [ ] **Krok 5: Doplnit nové sloupce do `PlayerRow` a `DbRow`**

`src/db/players.ts` — rozšířit seznam sloupců, oba typy a `mapuj`:

```ts
export const PLAYER_SLOUPEC_NAZVY = [
  "hrac_id",
  "platforma",
  "steam_id",
  "xbox_xuid",
  "xbox_gamertag",
  "we_profil",
  "we_profil_id",
  "alias",
  "steam_name",
  "avatar_url",
  "country",
  "elo_1v1",
  "elo_nejvyssi",
  "odehrano_her",
  "posledni_zapas",
  "steam_hodiny",
  "steam_hra",
  "staty_stazeny_v",
  "staty_chyba",
  "zebricky",
  "je_admin",
] as const;
```

```ts
export type Platforma = "steam" | "xbox";

export interface PlayerRow {
  hracId: string;
  platforma: Platforma;
  /** Vyplněné jen u Steam hráčů; u Microsoft hráčů null. */
  steamId: string | null;
  xboxXuid: string | null;
  xboxGamertag: string | null;
  /** Kanonické jméno profilu ve Worlds Edge, `/steam/…` nebo `/xboxlive/…`. */
  weProfil: string | null;
  /** Číselný profil ve Worlds Edge; na něm stojí rozpoznání v lobby. */
  weProfilId: number | null;
  // … zbytek polí beze změny
}
```

`DbRow` dostane tytéž sloupce v snake_case a `mapuj` je přepíše jedna ku jedné.

- [ ] **Krok 6: Doplnit `platforma` a `steam_id` do `upsertPlayer`**

`upsertPlayer` je odteď Steam větev, takže musí sama zapsat, že jde o Steam.
Jinak by u nového hráče zůstalo `steam_id` prázdné a sekce 7 ho v lobby
nenajde.

**Pozor na zkušební hráče.** `upsertPlayer` volají čtyři místa a tři z nich
posílají `test:pepa` (`src/auth/devRoutes.ts:76,106,128`,
`src/http/routes/zkusebni.ts:51`). Takový řádek by dostal
`steam_id = 'test:pepa'` — lež, a navíc by to zabralo unikátní hodnotu.

Řeší to `CASE` přímo v dotazu, podle stejné podmínky, jakou používá migrace.
Žádná druhá funkce a žádné volající místo se nemění:

```ts
export async function upsertPlayer(hracId: string, jeAdmin: boolean | null): Promise<PlayerRow> {
  const { rows } = await getPool().query<DbRow>(
    // Zkušební hráč (`test:pepa`) projde toutéž cestou, ale Steam ID nedostane:
    // atrapa pro večer nasucho žádný účet nemá a unikátní hodnotu by jen zabrala.
    `INSERT INTO player (hrac_id, platforma, steam_id, je_admin)
     VALUES ($1, 'steam', CASE WHEN $1 ~ '^\d{17}$' THEN $1 END,
             COALESCE($2::boolean, false))
     ON CONFLICT (hrac_id) DO UPDATE SET
       steam_id = COALESCE(EXCLUDED.steam_id, player.steam_id),
       je_admin = COALESCE($2::boolean, player.je_admin)
     RETURNING ${SLOUPCE}`,
    [hracId, jeAdmin],
  );
  return mapuj(rows[0]!);
}
```

Test, který to hlídá, do `src/db/players.db.test.ts`:

```ts
it("zkušební hráč projde bez Steam ID", async () => {
  const hrac = await upsertPlayer("test:pepa", null);
  expect(hrac.steamId).toBeNull();
  expect(hrac.platforma).toBe("steam");
});

it("Steam hráč dostane steam_id shodné s klíčem", async () => {
  const hrac = await upsertPlayer("76561198014056480", null);
  expect(hrac.steamId).toBe("76561198014056480");
});
```

- [ ] **Krok 7: Spustit celou kontrolu**

```bash
npx tsc --noEmit
npm --prefix web exec tsc -- -b --force
npm test
npm --prefix web test -- --run
npm run build; echo "EXIT=$?"
```

Očekávaný výsledek: **všechno zelené**, `EXIT=0`. Jestli některý test padá na
něčem jiném než jménu proměnné, přejmenování něco rozbilo — najít a opravit,
ne test přepsat.

- [ ] **Krok 8: Databázové testy**

```bash
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
```

Očekávaný výsledek: zelené. (V kroku 2 byly červené — to je ten rozdíl.)

- [ ] **Krok 9: Verze a commit**

```bash
npm run verze -- minor
git add -A
git commit -F - <<'EOF'
Rename the player key from steam_id to hrac_id

A player who owns the game through the Microsoft Store has no Steam ID, so
as long as steam_id is the primary key and the target of six foreign keys,
such a player cannot be written to the database at all. The key stops naming
a platform; platform-specific identifiers move to their own columns.

The column already held values that were not Steam IDs: test players have
been stored as test:<name> since 0.25.0.

No behaviour changes. The green suite is the proof.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
curl -s https://jouki.cz/aoe/dev/api/health
```

Očekávaný výsledek `curl`: verze, která se právě pushla.

---

## Úkol 3: Přejmenování zobrazovaného jména a vlastnictví hry

Microsoft hráč potřebuje jméno dřív, než dorazí ELO — a jediné pole, které tu
roli dnes hraje, se jmenuje `steam_name`. Stejně tak ikona vlastnictví hry
bude podle specu §6.2 platit pro obě platformy.

Zase **nulová změna chování**, zase mechanické, ale oddělené od úkolu 2, aby
šlo jedno přijmout a druhé odmítnout.

**Soubory:**
- Vytvořit: `database/028_platforma_jmeno.sql`
- Upravit: `.ts`/`.tsx` v `src/` a `web/src/` (skriptem)

**Rozhraní:**
- Konzumuje: `hracId` z úkolu 2
- Produkuje: pole `platformaJmeno` a `hraVlastnictvi` v `PlayerRow`,
  `PlayerView` i `UcastnikView`; typ `Vlastnictvi`

- [ ] **Krok 1: Migrace**

```sql
-- database/028_platforma_jmeno.sql
-- Jméno z platformy a vlastnictví hry přestávají být vázané na Steam: obojí
-- se u hráče z Microsoft Store plní stejně, jen z jiného zdroje. Hodiny
-- zůstávají steam_hodiny — ty Microsoft nezveřejňuje vůbec.
ALTER TABLE player RENAME COLUMN steam_name TO platforma_jmeno;
ALTER TABLE player RENAME COLUMN steam_hra  TO hra_vlastnictvi;
```

- [ ] **Krok 2: Přejmenovací skript**

```js
// <scratchpad>/prejmenuj-jmeno.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const NAHRADY = [
  ["SteamVlastnictvi", "Vlastnictvi"],
  ["o_steam_name", "o_platforma_jmeno"],
  ["steamName", "platformaJmeno"],
  ["steam_name", "platforma_jmeno"],
  ["steamHra", "hraVlastnictvi"],
  ["steam_hra", "hra_vlastnictvi"],
];

const soubory = execSync("git ls-files src web/src", { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f));

for (const soubor of soubory) {
  const puvodni = readFileSync(soubor, "utf8");
  let text = puvodni;
  for (const [z, na] of NAHRADY) {
    text = text.replace(new RegExp(`\\b${z}\\b`, "g"), na);
  }
  if (text !== puvodni) writeFileSync(soubor, text);
}
```

- [ ] **Krok 3: Spustit a zkontrolovat zbytky**

```bash
node "<scratchpad>/prejmenuj-jmeno.mjs"
grep -rnE "\bsteamName\b|\bsteam_name\b|\bsteamHra\b|\bsteam_hra\b" src web/src
```

Očekávaný výsledek: **žádný výstup**. Pozor, `parseSteamHra` a `SteamHra`
v `src/external/steam.ts` zůstávají — ty popisují odpověď Steamu, ne sloupec.

- [ ] **Krok 4: Opravit komentáře, které začaly lhát**

Přejmenování nechá komentáře beze změny. Projít a přepsat ty, které mluví
o Steamu tam, kde už jde o obě platformy — nejmíň:

- `src/shared/types.ts` u typu `Vlastnictvi`,
- `src/db/players.ts` u `hraVlastnictvi`,
- `web/src/zapas.ts` u `jmenoHrace`.

Nové znění u `Vlastnictvi`:

```ts
/**
 * Jestli hráč hru na svém účtu má: `ma`, `nema` (účet je vidět, hra tam není),
 * `soukromy` (knihovna na Steamu nebo herní historie na Xboxu je skrytá,
 * takže to ověřit nejde).
 */
export type Vlastnictvi = "ma" | "nema" | "soukromy";
```

- [ ] **Krok 5: Celá kontrola, databázové testy, verze, commit**

```bash
npx tsc --noEmit && npm --prefix web exec tsc -- -b --force
npm test && npm --prefix web test -- --run
npm run build; echo "EXIT=$?"
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
npm run verze -- minor
git add -A
git commit -F - <<'EOF'
Rename steam_name and steam_hra to platform-neutral columns

A Microsoft player needs a display name before the leaderboard answers, and
the only field that plays that role today is called steam_name. Game
ownership gets the same treatment: the three states mean the same thing on
both platforms, a hidden Xbox game history being the counterpart of a private
Steam library.

Hours stay steam_hodiny. Microsoft does not publish them at all.

No behaviour changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 4: Worlds Edge — dotaz podle aliasu a podle profilu

Dnes umí `fetchPersonalStat` jen `/steam/<id>`. Potřebuje umět i alias
(pro první dohledání Microsoft hráče) a `profile_id` (pro každou další
obnovu, protože alias se může změnit). A musí vracet i to, co dohledal.

**Soubory:**
- Upravit: `src/external/worldsEdge.ts`
- Test: `src/external/worldsEdge.test.ts`

**Rozhraní:**
- Konzumuje: nic z předchozích úkolů
- Produkuje:
  - `LeaderboardStats` nově s `profil: string | null` a `profilId: number | null`
  - `fetchPersonalStatPodleAliasu(alias: string, fetchImpl?): Promise<LeaderboardStats | null>`
  - `fetchPersonalStatPodleProfilu(profilId: number, fetchImpl?): Promise<LeaderboardStats | null>`

- [ ] **Krok 1: Napsat padající testy**

Do `src/external/worldsEdge.test.ts`. Fixtura je zkrácená živá odpověď
ze sondy 16. 9. 2026.

```ts
const XBOX_ODPOVED = {
  result: { code: 0, message: "SUCCESS" },
  statGroups: [
    {
      id: 4972952,
      members: [
        {
          profile_id: 6458213,
          name: "/xboxlive/D3B6B94FC53483297CEEA5A85933D3129D8A5B36",
          alias: "MING4888",
          personal_statgroup_id: 4972952,
          country: "tw",
        },
      ],
    },
  ],
  leaderboardStats: [
    {
      statgroup_id: 4972952,
      leaderboard_id: 3,
      wins: 43,
      losses: 44,
      rating: 1067,
      highestrating: 1082,
      lastmatchdate: 1736577544,
      rank: -1,
    },
  ],
};

it("dohledá Xbox hráče podle aliasu a vrátí jeho profil", () => {
  const staty = parsePersonalStatPodleAliasu(XBOX_ODPOVED, "MING4888");
  expect(staty).toMatchObject({
    alias: "MING4888",
    elo1v1: 1067,
    country: "tw",
    profil: "/xboxlive/D3B6B94FC53483297CEEA5A85933D3129D8A5B36",
    profilId: 6458213,
  });
});

it("odmítne Steam profil, i když se alias shoduje", () => {
  const steamOdpoved = structuredClone(XBOX_ODPOVED);
  steamOdpoved.statGroups[0].members[0].name = "/steam/76561198014056480";
  // Žebříček je pro obě platformy společný: bez téhle kontroly by Microsoft
  // hráč dostal statistiky cizího Steam hráče se stejnou přezdívkou.
  expect(parsePersonalStatPodleAliasu(steamOdpoved, "MING4888", "/xboxlive/")).toBeNull();
});

it("dotaz podle aliasu posílá parametr aliases", async () => {
  let volanaUrl = "";
  const falesnyFetch = (async (url: string) => {
    volanaUrl = url;
    return { ok: true, json: async () => XBOX_ODPOVED } as unknown as Response;
  }) as unknown as typeof fetch;

  await fetchPersonalStatPodleAliasu("MING4888", falesnyFetch);
  expect(volanaUrl).toContain("aliases=");
  expect(decodeURIComponent(volanaUrl)).toContain('["MING4888"]');
});

it("dotaz podle profilu posílá parametr profile_ids", async () => {
  let volanaUrl = "";
  const falesnyFetch = (async (url: string) => {
    volanaUrl = url;
    return { ok: true, json: async () => XBOX_ODPOVED } as unknown as Response;
  }) as unknown as typeof fetch;

  await fetchPersonalStatPodleProfilu(6458213, falesnyFetch);
  expect(decodeURIComponent(volanaUrl)).toContain("profile_ids=[6458213]");
});
```

Do stávajícího testu Steam větve přidat kontrolu, že i ta nově vrací profil:

```ts
it("u Steam hráče vyplní profil i profilId", () => {
  const staty = parsePersonalStat(STEAM_ODPOVED, "76561198014056480");
  expect(staty?.profil).toBe("/steam/76561198014056480");
  expect(typeof staty?.profilId).toBe("number");
});
```

- [ ] **Krok 2: Spustit, ať padnou**

```bash
npm test -- worldsEdge
```

Očekávaný výsledek: FAIL, „parsePersonalStatPodleAliasu is not defined“.

- [ ] **Krok 3: Implementace**

V `src/external/worldsEdge.ts`. Společné jádro se vytáhne, ať Steam a Xbox
větev nerozejdou (dnes je v `parsePersonalStat` zadrátované hledání podle
`/steam/<id>`).

```ts
export interface LeaderboardStats {
  alias: string;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
  zebricky: ZebricekRadek[];
  /** Kanonické jméno profilu, `/steam/…` nebo `/xboxlive/…`. */
  profil: string | null;
  /** Číslo profilu; používá ho obnova statistik i rozpoznání v lobby. */
  profilId: number | null;
}

/** Rozšířit o dvě pole, která se dosud nečetla. */
interface Member {
  name?: unknown;
  alias?: unknown;
  personal_statgroup_id?: unknown;
  country?: unknown;
  profile_id?: unknown;
}

/**
 * Najde člena podle vlastní podmínky; zbytek zpracování je pro obě platformy
 * stejný. Dosud bylo hledání podle `/steam/<id>` zadrátované uvnitř, takže
 * Xbox větev by se od Steam větve mohla nepozorovaně rozejít.
 */
function statyZOdpovedi(
  json: unknown,
  vyhovuje: (member: Record<string, unknown>) => boolean,
): LeaderboardStats | null {
  if (!jeObjekt(json)) return null;
  const data = json as { statGroups?: unknown; leaderboardStats?: unknown };
  if (!Array.isArray(data.statGroups)) return null;

  let member: Member | undefined;
  for (const skupina of data.statGroups) {
    if (!jeObjekt(skupina)) continue;
    const members = skupina.members;
    if (!Array.isArray(members)) continue;
    const nalezeny = members.find((m) => jeObjekt(m) && vyhovuje(m)) as Member | undefined;
    if (nalezeny) {
      member = nalezeny;
      break;
    }
  }
  if (!member || typeof member.alias !== "string") return null;

  const statgroupId = member.personal_statgroup_id;
  const staty = Array.isArray(data.leaderboardStats) ? data.leaderboardStats : [];
  const radek = staty.find(
    (s) => jeObjekt(s) && s["statgroup_id"] === statgroupId && s["leaderboard_id"] === ZEBRICEK_1V1,
  ) as Record<string, unknown> | undefined;

  const wins = radek ? cisloNeboNull(radek["wins"]) : null;
  const losses = radek ? cisloNeboNull(radek["losses"]) : null;
  const lastMatch = radek ? cisloNeboNull(radek["lastmatchdate"]) : null;

  const zebricky: ZebricekRadek[] = [];
  for (const s of staty) {
    if (!jeObjekt(s) || s["statgroup_id"] !== statgroupId) continue;
    const id = cisloNeboNull(s["leaderboard_id"]);
    if (id === null) continue;
    zebricky.push({
      id,
      rating: cisloNeboNull(s["rating"]),
      nejvyssi: cisloNeboNull(s["highestrating"]),
      poradi: cisloNeboNull(s["rank"]),
      vyhry: cisloNeboNull(s["wins"]) ?? 0,
      prohry: cisloNeboNull(s["losses"]) ?? 0,
    });
  }

  return {
    alias: member.alias,
    country: typeof member.country === "string" ? member.country : null,
    elo1v1: radek ? cisloNeboNull(radek["rating"]) : null,
    eloNejvyssi: radek ? cisloNeboNull(radek["highestrating"]) : null,
    odehranoHer: wins !== null && losses !== null ? wins + losses : null,
    posledniZapas: lastMatch !== null ? new Date(lastMatch * 1000) : null,
    zebricky,
    profil: typeof member.name === "string" ? member.name : null,
    profilId: cisloNeboNull(member.profile_id),
  };
}

export function parsePersonalStat(json: unknown, steamId: string): LeaderboardStats | null {
  return statyZOdpovedi(json, (m) => m["name"] === `/steam/${steamId}`);
}

/**
 * Dohledání podle herního jména. `vyzadovanyPrefix` je pojistka: žebříček je
 * pro Steam i Xbox společný, takže bez něj by Microsoft hráč dostal
 * statistiky cizího Steam hráče, který má shodou okolností stejný alias.
 */
export function parsePersonalStatPodleAliasu(
  json: unknown,
  alias: string,
  vyzadovanyPrefix = "/xboxlive/",
): LeaderboardStats | null {
  return statyZOdpovedi(
    json,
    (m) =>
      m["alias"] === alias &&
      typeof m["name"] === "string" &&
      m["name"].startsWith(vyzadovanyPrefix),
  );
}

export function parsePersonalStatPodleProfilu(
  json: unknown,
  profilId: number,
): LeaderboardStats | null {
  return statyZOdpovedi(json, (m) => m["profile_id"] === profilId);
}

export async function fetchPersonalStatPodleAliasu(
  alias: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const aliasy = encodeURIComponent(JSON.stringify([alias]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&aliases=${aliasy}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStatPodleAliasu(await res.json(), alias);
}

export async function fetchPersonalStatPodleProfilu(
  profilId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const profily = encodeURIComponent(JSON.stringify([profilId]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&profile_ids=${profily}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStatPodleProfilu(await res.json(), profilId);
}
```

- [ ] **Krok 4: Uložit profil do databáze**

`PlayerStatsUpdate` v `src/db/players.ts` dostane dvě pole a `savePlayerStats`
dva parametry navíc (stejným vzorem `COALESCE` jako alias):

```ts
export interface PlayerStatsUpdate {
  // … stávající pole
  weProfil?: string | null;
  weProfilId?: number | null;
  chyba: string | null;
}
```

```sql
       we_profil    = COALESCE($16, we_profil),
       we_profil_id = COALESCE($17::integer, we_profil_id),
```

V `src/players/refresh.ts` se obojí přidá do skládaného `staty`:

```ts
      weProfil: zebricek?.profil ?? null,
      weProfilId: zebricek?.profilId ?? null,
```

Tím se `we_profil_id` doplní i Steam hráčům, bez migrace dat a bez dotazu navíc.

- [ ] **Krok 5: Testy zeleně**

```bash
npm test -- worldsEdge
npm test
```

Očekávaný výsledek: PASS.

- [ ] **Krok 6: Verze a commit**

```bash
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'EOF'
Look up leaderboard profiles by alias and by profile id

The Xbox identifier in the game's backend is a 40-character hash, not the
XUID, so it cannot be derived from a Microsoft sign-in. A probe on 16 Sep
2026 showed getPersonalStat also answers to aliases, which is the only
bridge from a gamertag to a game profile.

The profile id comes back from the same answer, so Steam players get it
filled in too, with no migration and no extra request.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 5: Microsoft OAuth — výpočetní část

Čistě hermetický modul: staví adresy, počítá PKCE, nic nesíťuje. Stejný vzor
jako `steamOpenId.ts`.

**Soubory:**
- Vytvořit: `src/auth/microsoftOAuth.ts`, `src/auth/microsoftOAuth.test.ts`
- Upravit: `src/config.ts`

**Rozhraní:**
- Konzumuje: nic
- Produkuje:
  - `navratovaUrlMicrosoft(baseUrl: string): string`
  - `vytvorPkce(): { verifier: string; challenge: string }`
  - `buildAuthUrlMicrosoft(baseUrl, clientId, state, challenge): string`
  - `buildTokenBody(baseUrl, clientId, clientSecret, kod, verifier): URLSearchParams`
  - `config.msClientId`, `config.msClientSecret`, `config.maMicrosoft`

- [ ] **Krok 1: Padající testy**

```ts
// src/auth/microsoftOAuth.test.ts
import { describe, expect, it } from "vitest";
import {
  buildAuthUrlMicrosoft,
  buildTokenBody,
  navratovaUrlMicrosoft,
  vytvorPkce,
} from "./microsoftOAuth.js";

describe("navratovaUrlMicrosoft", () => {
  it("visí pod základní cestou webu a nezdvojí lomítko", () => {
    expect(navratovaUrlMicrosoft("https://jouki.cz/aoe/dev/")).toBe(
      "https://jouki.cz/aoe/dev/api/auth/microsoft/return",
    );
  });
});

describe("vytvorPkce", () => {
  it("challenge je base64url SHA-256 verifieru, bez výplně", () => {
    const { verifier, challenge } = vytvorPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toContain("=");
    expect(challenge).not.toContain("+");
    expect(challenge).not.toContain("/");
  });

  it("pokaždé jiný", () => {
    expect(vytvorPkce().verifier).not.toBe(vytvorPkce().verifier);
  });
});

describe("buildAuthUrlMicrosoft", () => {
  const url = new URL(
    buildAuthUrlMicrosoft("https://jouki.cz/aoe", "klient-1", "stav-1", "vyzva-1"),
  );

  it("míří na spotřebitelský tenant", () => {
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
  });

  it("žádá jen XboxLive.signin — nic víc web nepotřebuje", () => {
    expect(url.searchParams.get("scope")).toBe("XboxLive.signin");
  });

  it("posílá PKCE i state", () => {
    expect(url.searchParams.get("code_challenge")).toBe("vyzva-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("stav-1");
  });

  it("návratová adresa je táž, kterou pak ověřuje výměna tokenu", () => {
    expect(url.searchParams.get("redirect_uri")).toBe(
      navratovaUrlMicrosoft("https://jouki.cz/aoe"),
    );
  });
});

describe("buildTokenBody", () => {
  it("obsahuje code_verifier a stejnou návratovou adresu", () => {
    const body = buildTokenBody(
      "https://jouki.cz/aoe",
      "klient-1",
      "tajemstvi",
      "kod-1",
      "overovatel-1",
    );
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("kod-1");
    expect(body.get("code_verifier")).toBe("overovatel-1");
    expect(body.get("redirect_uri")).toBe(navratovaUrlMicrosoft("https://jouki.cz/aoe"));
  });
});
```

- [ ] **Krok 2: Spustit, ať padnou**

```bash
npm test -- microsoftOAuth
```

Očekávaný výsledek: FAIL, „Cannot find module './microsoftOAuth.js'“.

- [ ] **Krok 3: Implementace**

```ts
// src/auth/microsoftOAuth.ts
import { createHash, randomBytes } from "node:crypto";

const AUTORIZACE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
export const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

/**
 * Adresa, na kterou Microsoft vrací kód. Jedno místo pro obě strany: staví ji
 * odchozí požadavek i výměna tokenu, takže se nemůžou rozejít — a Microsoft
 * obě porovnává.
 */
export function navratovaUrlMicrosoft(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/auth/microsoft/return`;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * PKCE. Web sice má client secret, ale kód putuje přes prohlížeč uživatele —
 * verifier je to jediné, co drží útočníka, který kód odchytí, dál od tokenu.
 */
export function vytvorPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrlMicrosoft(
  baseUrl: string,
  clientId: string,
  state: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: navratovaUrlMicrosoft(baseUrl),
    // Nic než přihlášení k Xboxu nepotřebujeme: žádný e-mail, žádný profil
    // a hlavně žádný offline_access — refresh token by byl jen tajemství
    // navíc, které by se muselo hlídat.
    scope: "XboxLive.signin",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTORIZACE}?${params.toString()}`;
}

export function buildTokenBody(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  kod: string,
  verifier: string,
): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: kod,
    grant_type: "authorization_code",
    redirect_uri: navratovaUrlMicrosoft(baseUrl),
    code_verifier: verifier,
  });
}
```

- [ ] **Krok 4: Konfigurace a varování při startu**

Do `src/config.ts`, vedle `steamApiKey`:

```ts
  msClientId: process.env["MS_CLIENT_ID"] ?? "",
  msClientSecret: process.env["MS_CLIENT_SECRET"] ?? "",
  /** Bez obou hodnot se Microsoft routy vůbec neregistrují a tlačítko se neukáže. */
  get maMicrosoft(): boolean {
    return this.msClientId !== "" && this.msClientSecret !== "";
  },
```

A varování stejného tvaru jako `varovaniSteamKlic`:

```ts
/**
 * Chybějící registrace se navenek projeví jen tím, že tlačítko není vidět —
 * a to vypadá stejně jako záměr. Řádek při startu je jediné místo, kde se to
 * dá poznat.
 */
export function varovaniMicrosoft(): string | null {
  if (config.maMicrosoft) return null;
  return (
    "MS_CLIENT_ID nebo MS_CLIENT_SECRET chybí: přihlášení Microsoft účtem je " +
    "vypnuté a tlačítko se neukáže. Registrace se zakládá na entra.microsoft.com."
  );
}
```

Zavolat v `src/main.ts` vedle ostatních varování:

```ts
const varovaniMs = varovaniMicrosoft();
if (varovaniMs) console.warn(varovaniMs);
```

Odpovídající test do `src/config.test.ts`:

```ts
it("varuje, když Microsoft registrace chybí, a mlčí, když je", () => {
  process.env["MS_CLIENT_ID"] = "";
  process.env["MS_CLIENT_SECRET"] = "";
  expect(varovaniMicrosoft()).toContain("MS_CLIENT_ID");
  process.env["MS_CLIENT_ID"] = "a";
  process.env["MS_CLIENT_SECRET"] = "b";
  expect(varovaniMicrosoft()).toBeNull();
});
```

- [ ] **Krok 5: Testy zeleně a commit**

```bash
npm test -- microsoftOAuth config
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'EOF'
Add the computational half of the Microsoft sign-in

Addresses, PKCE and the token body, with no network in sight, mirroring how
steamOpenId.ts is split. The scope stays XboxLive.signin alone: the site
needs a gamertag and an XUID, not a mailbox, and skipping offline_access
means there is no refresh token to guard.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 6: Xbox Live — výměna tokenu, gamerpic, herní historie

**Soubory:**
- Vytvořit: `src/external/xboxLive.ts`, `src/external/xboxLive.test.ts`

**Rozhraní:**
- Konzumuje: `Vlastnictvi` z úkolu 3
- Produkuje:
  - `interface XboxIdentita { xuid: string; gamertag: string; uhs: string; token: string }`
  - `parseXstsChybu(json: unknown): string | null`
  - `parseXstsIdentitu(json: unknown): Omit<XboxIdentita, "token"> | null`
  - `parseGamerpic(json: unknown): string | null`
  - `parseHerniHistorii(json: unknown): Vlastnictvi`
  - `ziskejXboxIdentitu(accessToken: string, fetchImpl?): Promise<XboxIdentita>`
  - `nactiGamerpic(id: XboxIdentita, fetchImpl?): Promise<string | null>`
  - `nactiVlastnictvi(id: XboxIdentita, fetchImpl?): Promise<Vlastnictvi | undefined>`

- [ ] **Krok 1: Padající testy**

```ts
// src/external/xboxLive.test.ts
import { describe, expect, it } from "vitest";
import {
  parseGamerpic,
  parseHerniHistorii,
  parseXstsChybu,
  parseXstsIdentitu,
} from "./xboxLive.js";

describe("parseXstsIdentitu", () => {
  it("vytáhne XUID, gamertag a uhs", () => {
    expect(
      parseXstsIdentitu({
        Token: "xsts-token",
        DisplayClaims: { xui: [{ uhs: "123456", xid: "2535412345678901", gtg: "Jouki in Rage" }] },
      }),
    ).toEqual({ xuid: "2535412345678901", gamertag: "Jouki in Rage", uhs: "123456" });
  });

  it("chybějící claim je null, ne prázdný řetězec", () => {
    expect(parseXstsIdentitu({ DisplayClaims: { xui: [{ uhs: "1" }] } })).toBeNull();
  });

  it("nespadne na odpovědi, která není objekt", () => {
    expect(parseXstsIdentitu("ne")).toBeNull();
    expect(parseXstsIdentitu({ DisplayClaims: { xui: "ne" } })).toBeNull();
  });
});

describe("parseXstsChybu", () => {
  it("účet bez Xbox profilu dostane návod, ne kód", () => {
    expect(parseXstsChybu({ XErr: 2148916233 })).toContain("nemá Xbox profil");
  });

  it("dětský účet taky", () => {
    expect(parseXstsChybu({ XErr: 2148916238 })).toContain("rodiny");
  });

  it("neznámý kód se přeloží obecně, ale nezamlčí se", () => {
    expect(parseXstsChybu({ XErr: 1 })).toContain("1");
  });

  it("odpověď bez XErr chybou není", () => {
    expect(parseXstsChybu({ Token: "t" })).toBeNull();
  });
});

describe("parseGamerpic", () => {
  it("vytáhne adresu obrázku ze settings", () => {
    expect(
      parseGamerpic({
        profileUsers: [
          { settings: [{ id: "GameDisplayPicRaw", value: "https://images-eds.xboxlive.com/x" }] },
        ],
      }),
    ).toBe("https://images-eds.xboxlive.com/x");
  });

  it("chybějící nastavení je null", () => {
    expect(parseGamerpic({ profileUsers: [{ settings: [] }] })).toBeNull();
  });
});

describe("parseHerniHistorii", () => {
  it("hra v historii znamená, že ji hráč má", () => {
    expect(
      parseHerniHistorii({
        titles: [{ titleId: "2064168993", name: "Age of Empires II: Definitive Edition" }],
      }),
    ).toBe("ma");
  });

  it("historie bez té hry znamená, že ji nemá", () => {
    expect(parseHerniHistorii({ titles: [{ titleId: "1", name: "Forza Horizon 5" }] })).toBe("nema");
  });

  it("jiná hra ze série se za ni nevydává", () => {
    // Sonda 16. 9. 2026 našla v téže historii i Age of Empires Online.
    // Porovnávání podle jména by na ni sedlo.
    expect(
      parseHerniHistorii({ titles: [{ titleId: "1297289123", name: "Age of Empires Online" }] }),
    ).toBe("nema");
  });

  it("skryté soukromí není totéž co chybějící hra", () => {
    // Xbox na skrytou historii odpoví bez pole titles. Kdyby se to sloučilo
    // s „nema“, ukázal by web vykřičník člověku, který hru má.
    expect(parseHerniHistorii({})).toBe("soukromy");
  });
});
```

- [ ] **Krok 2: Spustit, ať padnou**

```bash
npm test -- xboxLive
```

Očekávaný výsledek: FAIL, „Cannot find module './xboxLive.js'“.

- [ ] **Krok 3: Implementace**

```ts
// src/external/xboxLive.ts
import type { Vlastnictvi } from "../shared/types.js";

const XBL = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS = "https://xsts.auth.xboxlive.com/xsts/authorize";
const PROFIL = "https://profile.xboxlive.com";
const TITULY = "https://titlehub.xboxlive.com";

/**
 * AoE2 DE v herní historii. Naměřeno sondou 16. 9. 2026. Porovnává se id,
 * ne jméno: v téže historii sedí i Age of Empires Online (1297289123), takže
 * hledání podle „Age of Empires“ by sedlo na špatnou hru.
 */
const AOE2_TITLE_ID = "2064168993";

export interface XboxIdentita {
  xuid: string;
  gamertag: string;
  /** User hash; patří do hlavičky Authorization vedle tokenu. */
  uhs: string;
  token: string;
}

function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null;
}

/**
 * Xbox nevrací HTTP chybu, ale 401 s číslem v `XErr`. Dvě čísla znamenají něco,
 * s čím hráč sám něco udělat může — a jen ta dvě má smysl překládat.
 */
export function parseXstsChybu(json: unknown): string | null {
  if (!jeObjekt(json)) return null;
  const kod = json["XErr"];
  if (typeof kod !== "number") return null;
  if (kod === 2148916233) {
    return "Tenhle Microsoft účet nemá Xbox profil. Založ si ho na xbox.com a zkus to znovu.";
  }
  if (kod === 2148916238) {
    return "Dětský účet se musí nejdřív přidat do rodiny na Xboxu.";
  }
  return `Xbox přihlášení odmítl (kód ${kod}).`;
}

export function parseXstsIdentitu(json: unknown): Omit<XboxIdentita, "token"> | null {
  if (!jeObjekt(json)) return null;
  const claims = json["DisplayClaims"];
  if (!jeObjekt(claims)) return null;
  const xui = claims["xui"];
  if (!Array.isArray(xui) || !jeObjekt(xui[0])) return null;
  const { uhs, xid, gtg } = xui[0];
  if (typeof uhs !== "string" || typeof xid !== "string" || typeof gtg !== "string") return null;
  return { uhs, xuid: xid, gamertag: gtg };
}

export function parseGamerpic(json: unknown): string | null {
  if (!jeObjekt(json)) return null;
  const users = json["profileUsers"];
  if (!Array.isArray(users) || !jeObjekt(users[0])) return null;
  const settings = users[0]["settings"];
  if (!Array.isArray(settings)) return null;
  const pic = settings.find((s) => jeObjekt(s) && s["id"] === "GameDisplayPicRaw");
  const value = jeObjekt(pic) ? pic["value"] : null;
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Skryté soukromí a chybějící hra jsou dvě různé věci: Xbox na skrytou historii
 * odpoví bez pole `titles`. Sloučit je by znamenalo ukázat vykřičník člověku,
 * který hru má — přesně to, kvůli čemu má `soukromy` vlastní stav už u Steamu.
 */
export function parseHerniHistorii(json: unknown): Vlastnictvi {
  if (!jeObjekt(json)) return "soukromy";
  const titles = json["titles"];
  if (!Array.isArray(titles)) return "soukromy";
  const ma = titles.some((t) => jeObjekt(t) && String(t["titleId"]) === AOE2_TITLE_ID);
  return ma ? "ma" : "nema";
}

async function postJson(
  url: string,
  telo: unknown,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; json: unknown }> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(telo),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

/**
 * Microsoft token → XSTS. Prefix `d=` u `RpsTicket` je povinný pro vlastní
 * registraci aplikace; bez něj Xbox ticket odmítne a hláška to neprozradí.
 */
export async function ziskejXboxIdentitu(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XboxIdentita> {
  const xbl = await postJson(
    XBL,
    {
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${accessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    },
    fetchImpl,
  );
  const uzivatelskyToken = jeObjekt(xbl.json) ? xbl.json["Token"] : null;
  if (!xbl.ok || typeof uzivatelskyToken !== "string") {
    throw new Error(parseXstsChybu(xbl.json) ?? "Xbox Live nepřijal přihlášení.");
  }

  const xsts = await postJson(
    XSTS,
    {
      Properties: { SandboxId: "RETAIL", UserTokens: [uzivatelskyToken] },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    },
    fetchImpl,
  );
  if (!xsts.ok) throw new Error(parseXstsChybu(xsts.json) ?? "Xbox přihlášení odmítl.");

  const identita = parseXstsIdentitu(xsts.json);
  const token = jeObjekt(xsts.json) ? xsts.json["Token"] : null;
  if (!identita || typeof token !== "string") {
    throw new Error("Xbox nevrátil identifikátor účtu.");
  }
  return { ...identita, token };
}

function hlavicka(id: XboxIdentita, verze: string): Record<string, string> {
  return {
    Authorization: `XBL3.0 x=${id.uhs};${id.token}`,
    accept: "application/json",
    "x-xbl-contract-version": verze,
  };
}

export async function nactiGamerpic(
  id: XboxIdentita,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = `${PROFIL}/users/xuid(${id.xuid})/profile/settings?settings=GameDisplayPicRaw`;
  const res = await fetchImpl(url, { headers: hlavicka(id, "3"), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Xbox profil odpověděl ${res.status}`);
  return parseGamerpic(await res.json());
}

/**
 * `undefined` = nepovedlo se zeptat, hodnotu v databázi nesaháme. Stejná úmluva
 * jako u `nactiHru` ve `steam.ts`.
 */
export async function nactiVlastnictvi(
  id: XboxIdentita,
  fetchImpl: typeof fetch = fetch,
): Promise<Vlastnictvi | undefined> {
  const url = `${TITULY}/users/xuid(${id.xuid})/titles/titlehistory/decoration/detail`;
  const res = await fetchImpl(url, {
    headers: { ...hlavicka(id, "2"), "accept-language": "en-US" },
    signal: AbortSignal.timeout(10_000),
  });
  // 403 je odpověď na skryté soukromí, ne porucha.
  if (res.status === 403) return "soukromy";
  if (!res.ok) return undefined;
  return parseHerniHistorii(await res.json());
}
```

- [ ] **Krok 4: Testy zeleně a commit**

```bash
npm test -- xboxLive
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'EOF'
Exchange a Microsoft token for an Xbox identity

The XSTS answer is where the gamertag and the XUID come from, and the d=
prefix on the RpsTicket is what makes a self-registered application work at
all — it fails silently without it.

A hidden game history answers without a titles array, which is the Xbox
counterpart of a private Steam library and keeps its own state rather than
being folded into "does not own it".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 7: Přihlašovací routy

**Soubory:**
- Vytvořit: `src/auth/microsoftRoutes.ts`, `src/auth/microsoftRoutes.db.test.ts`
- Upravit: `src/db/players.ts` (`upsertHracXbox`), `src/auth/routes.ts`
  (`komuDatAdmina` beze změny, jen se zavolá), `src/http/server.ts`

**Rozhraní:**
- Konzumuje: `buildAuthUrlMicrosoft`, `buildTokenBody`, `navratovaUrlMicrosoft`
  (úkol 5); `ziskejXboxIdentitu`, `XboxIdentita` (úkol 6); `nastaveniCookie`,
  `komuDatAdmina` (stávající `src/auth/routes.ts`)
- Produkuje:
  - `upsertHracXbox(xuid: string, gamertag: string, jeAdmin: boolean | null): Promise<PlayerRow>`
  - `registerMicrosoftRoutes(app: FastifyInstance, deps: MicrosoftDeps): void`
  - `interface MicrosoftDeps { vymenKod(kod, verifier): Promise<string>; ziskejIdentitu(token): Promise<XboxIdentita>; poPrihlaseni(hracId, identita): Promise<void> }`

- [ ] **Krok 1: Zápis Microsoft hráče do databáze**

Do `src/db/players.ts`:

```ts
/**
 * Klíč je `xbox:<xuid>`, protože XUID je to jediné, co máme jistě hned při
 * přihlášení — gamertag si hráč může změnit. Prefix drží klíče obou platforem
 * rozlišitelné na první pohled, stejně jako `test:` u zkušebních hráčů.
 */
export function xboxHracId(xuid: string): string {
  return `xbox:${xuid}`;
}

export async function upsertHracXbox(
  xuid: string,
  gamertag: string,
  jeAdmin: boolean | null,
): Promise<PlayerRow> {
  const { rows } = await getPool().query<DbRow>(
    `INSERT INTO player (hrac_id, platforma, xbox_xuid, xbox_gamertag, platforma_jmeno, je_admin)
     VALUES ($1, 'xbox', $2, $3, $3, COALESCE($4::boolean, false))
     ON CONFLICT (hrac_id) DO UPDATE SET
       xbox_gamertag   = EXCLUDED.xbox_gamertag,
       platforma_jmeno = EXCLUDED.platforma_jmeno,
       je_admin        = COALESCE($4::boolean, player.je_admin)
     RETURNING ${SLOUPCE}`,
    [xboxHracId(xuid), xuid, gamertag, jeAdmin],
  );
  return mapuj(rows[0]!);
}
```

Gamertag jde i do `platforma_jmeno` schválně: hráč má mít jméno hned, ne až
odpoví žebříček.

- [ ] **Krok 2: Padající databázový test**

```ts
// src/auth/microsoftRoutes.db.test.ts
import { describe, expect, it } from "vitest";
import { buildServer } from "../http/server.js";
import { getPlayer } from "../db/players.js";

const IDENTITA = {
  xuid: "2535412345678901",
  gamertag: "Jouki in Rage",
  uhs: "123",
  token: "xsts",
};

function server() {
  return buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: async () => {},
  });
}

describe("GET /api/auth/microsoft", () => {
  it("přesměruje na Microsoft a uloží state do cookie", async () => {
    const res = await server().inject({ method: "GET", url: "/api/auth/microsoft" });
    expect(res.statusCode).toBe(302);
    expect(res.headers["location"]).toContain("login.microsoftonline.com");
    expect(String(res.headers["set-cookie"])).toContain("ms_stav");
  });
});

describe("GET /api/auth/microsoft/return", () => {
  it("bez shody state nepřihlásí a nikam se neptá", async () => {
    // Bez téhle kontroly stačí útočníkovi podstrčit vlastní kód a přihlásí
    // oběť do svého účtu.
    const res = await server().inject({
      method: "GET",
      url: "/api/auth/microsoft/return?code=k&state=cizi",
      cookies: { ms_stav: "nase|overovatel" },
    });
    expect(res.statusCode).toBe(401);
  });

  it("založí hráče s klíčem xbox:<xuid> a vrátí sezení", async () => {
    const app = server();
    const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
    const stav = String(start.headers["set-cookie"]).match(/ms_stav=([^;]+)/)![1]!;
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/microsoft/return?code=k&state=${decodeURIComponent(stav).split("|")[0]}`,
      cookies: { ms_stav: decodeURIComponent(stav) },
    });
    expect(res.statusCode).toBe(302);
    const hrac = await getPlayer("xbox:2535412345678901");
    expect(hrac).toMatchObject({
      platforma: "xbox",
      xboxXuid: "2535412345678901",
      xboxGamertag: "Jouki in Rage",
      platformaJmeno: "Jouki in Rage",
      steamId: null,
    });
  });

  it("chyba z Xboxu se ukáže česky, ne jako kód", async () => {
    const app = buildServer({
      vymenKod: async () => "ms-token",
      ziskejIdentitu: async () => {
        throw new Error("Tenhle Microsoft účet nemá Xbox profil.");
      },
      poPrihlaseni: async () => {},
    });
    const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
    const stav = String(start.headers["set-cookie"]).match(/ms_stav=([^;]+)/)![1]!;
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/microsoft/return?code=k&state=${decodeURIComponent(stav).split("|")[0]}`,
      cookies: { ms_stav: decodeURIComponent(stav) },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().chyba).toContain("Xbox profil");
  });
});
```

- [ ] **Krok 3: Spustit, ať padne**

```bash
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
```

Očekávaný výsledek: FAIL na `/api/auth/microsoft` → 404.

- [ ] **Krok 4: Implementace rout**

```ts
// src/auth/microsoftRoutes.ts
import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { upsertHracXbox, xboxHracId } from "../db/players.js";
import { createSession } from "../db/sessions.js";
import type { XboxIdentita } from "../external/xboxLive.js";
import { buildAuthUrlMicrosoft, vytvorPkce } from "./microsoftOAuth.js";
import { komuDatAdmina, nastaveniCookie } from "./routes.js";

/** Cookie se `state|verifier` žije jen mezi odchodem a návratem. */
const STAV_COOKIE = "ms_stav";
const STAV_PLATNOST_S = 10 * 60;

export interface MicrosoftDeps {
  vymenKod: (kod: string, verifier: string) => Promise<string>;
  ziskejIdentitu: (accessToken: string) => Promise<XboxIdentita>;
  /** Gamerpic, vlastnictví hry a herní profil. Nesmí zdržet ani shodit přihlášení. */
  poPrihlaseni: (hracId: string, identita: XboxIdentita) => Promise<void>;
}

export function registerMicrosoftRoutes(app: FastifyInstance, deps: MicrosoftDeps): void {
  app.get("/api/auth/microsoft", async (_request, reply) => {
    const { verifier, challenge } = vytvorPkce();
    const stav = randomBytes(16).toString("hex");
    return reply
      .setCookie(STAV_COOKIE, `${stav}|${verifier}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.jeProdukce,
        path: config.domovskaCesta,
        maxAge: STAV_PLATNOST_S,
      })
      .redirect(
        buildAuthUrlMicrosoft(config.baseUrl, config.msClientId, stav, challenge),
        302,
      );
  });

  app.get("/api/auth/microsoft/return", async (request, reply) => {
    const ulozeny = request.cookies[STAV_COOKIE];
    const [stav, verifier] = (ulozeny ?? "").split("|");
    const dotaz = request.query as { code?: string; state?: string; error?: string };

    // Cizí `state` se odmítá dřív, než se pošle jediný dotaz ven. Bez toho
    // stačí podstrčit vlastní kód a oběť se přihlásí do útočníkova účtu.
    if (!stav || !verifier || !dotaz.state || dotaz.state !== stav) {
      return reply.code(401).send({ chyba: "Neplatný návrat z Microsoftu." });
    }
    if (!dotaz.code) {
      return reply.code(401).send({ chyba: "Microsoft nevrátil přihlašovací kód." });
    }

    let identita: XboxIdentita;
    try {
      identita = await deps.ziskejIdentitu(await deps.vymenKod(dotaz.code, verifier));
    } catch (err: unknown) {
      // Hlášky z xboxLive.ts jsou už česky a určené hráči.
      return reply
        .code(401)
        .clearCookie(STAV_COOKIE, { path: config.domovskaCesta })
        .send({ chyba: err instanceof Error ? err.message : "Přihlášení se nepodařilo." });
    }

    const hracId = xboxHracId(identita.xuid);
    await upsertHracXbox(identita.xuid, identita.gamertag, await komuDatAdmina(hracId));

    // Stejně jako u Steamu: doplňky běží mimo přihlašovací cestu, aby jejich
    // selhání nemohlo přihlášení zablokovat ani shodit.
    void Promise.resolve()
      .then(() => deps.poPrihlaseni(hracId, identita))
      .catch(() => {});

    const sid = await createSession(hracId);
    return reply
      .clearCookie(STAV_COOKIE, { path: config.domovskaCesta })
      .setCookie(config.cookieNazev, sid, nastaveniCookie())
      .redirect(config.domovskaCesta, 302);
  });
}
```

- [ ] **Krok 5: Napojit v `server.ts`**

```ts
export type ServerDeps = AuthDeps & MatchDeps & MicrosoftDeps;
```

Do `vychoziDeps()`:

```ts
    vymenKod: async (kod, verifier) => {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: buildTokenBody(
          config.baseUrl,
          config.msClientId,
          config.msClientSecret,
          kod,
          verifier,
        ).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const json: unknown = await res.json().catch(() => null);
      const token =
        typeof json === "object" && json !== null
          ? (json as Record<string, unknown>)["access_token"]
          : null;
      if (!res.ok || typeof token !== "string") {
        throw new Error("Microsoft nevydal přihlašovací token.");
      }
      return token;
    },
    ziskejIdentitu: (accessToken) => ziskejXboxIdentitu(accessToken),
    poPrihlaseni: async () => {},   // naplní úkoly 8 a 9
```

A registrace, podmíněná konfigurací:

```ts
  // Bez registrace v Entra by routy jen vracely chyby; ať radši nejsou.
  if (config.maMicrosoft) registerMicrosoftRoutes(app, deps);
```

- [ ] **Krok 6: Testy zeleně a commit**

```bash
npm test
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze -- minor
git add -A
git commit -F - <<'EOF'
Let players sign in with a Microsoft account

The state cookie is checked before a single request leaves the server, the
same way the Steam return refuses a foreign assertion before asking Steam
anything: without it, a planted code signs the visitor into the attacker's
account.

The gamertag is written to platforma_jmeno right away so the player has a
name before the leaderboard answers.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 8: Statistiky podle platformy

Microsoft hráč nemá Steam profil ani hodiny, zato se jeho žebříček hledá jinak.
`refreshPlayerStats` zůstane beze změny — mění se jen zdroje, které mu volající
podá.

**Soubory:**
- Upravit: `src/http/server.ts`, `src/players/refresh.ts` (jen komentář)
- Vytvořit: `src/players/zdroje.ts`, `src/players/zdroje.test.ts`

**Rozhraní:**
- Konzumuje: `fetchPersonalStatPodleAliasu`, `fetchPersonalStatPodleProfilu`
  (úkol 4); `PlayerRow`, `Platforma` (úkol 2)
- Produkuje: `zdrojeProHrace(hrac: PlayerRow, steamApiKey: string): RefreshDeps`

- [ ] **Krok 1: Padající testy**

```ts
// src/players/zdroje.test.ts
import { describe, expect, it, vi } from "vitest";
import { zdrojeProHrace } from "./zdroje.js";

const ZAKLAD = {
  alias: null, platformaJmeno: null, avatarUrl: null, country: null,
  elo1v1: null, eloNejvyssi: null, odehranoHer: null, posledniZapas: null,
  steamHodiny: null, hraVlastnictvi: null, statyStazenyV: null,
  statyChyba: null, zebricky: null, jeAdmin: false, steamId: null,
  xboxXuid: null, xboxGamertag: null, weProfil: null, weProfilId: null,
};

describe("zdrojeProHrace", () => {
  it("Microsoft hráč bez profilu se hledá podle gamertagu", async () => {
    const podleAliasu = vi.fn().mockResolvedValue(null);
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "xbox:1", platforma: "xbox", xboxGamertag: "Jouki in Rage" },
      "",
      { podleAliasu, podleProfilu: vi.fn(), podleSteamu: vi.fn() },
    );
    await zdroje.nactiZebricek("xbox:1");
    expect(podleAliasu).toHaveBeenCalledWith("Jouki in Rage");
  });

  it("Microsoft hráč s profilem se hledá podle čísla profilu, ne aliasu", async () => {
    // Alias si hráč může ve hře změnit, profil je stálý.
    const podleProfilu = vi.fn().mockResolvedValue(null);
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "xbox:1", platforma: "xbox", xboxGamertag: "X", weProfilId: 6458213 },
      "",
      { podleAliasu: vi.fn(), podleProfilu, podleSteamu: vi.fn() },
    );
    await zdroje.nactiZebricek("xbox:1");
    expect(podleProfilu).toHaveBeenCalledWith(6458213);
  });

  it("Microsoft hráč se Steamu neptá vůbec", async () => {
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "xbox:1", platforma: "xbox", xboxGamertag: "X" },
      "klic",
      { podleAliasu: vi.fn(), podleProfilu: vi.fn(), podleSteamu: vi.fn() },
    );
    expect(await zdroje.nactiProfil("xbox:1")).toBeNull();
    // undefined, ne null: hodnoty v databázi se nesmí přepsat.
    expect(await zdroje.nactiHru("xbox:1")).toBeUndefined();
  });

  it("Steam hráč se dál ptá podle Steam ID", async () => {
    const podleSteamu = vi.fn().mockResolvedValue(null);
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "76561198014056480", platforma: "steam", steamId: "76561198014056480" },
      "",
      { podleAliasu: vi.fn(), podleProfilu: vi.fn(), podleSteamu },
    );
    await zdroje.nactiZebricek("76561198014056480");
    expect(podleSteamu).toHaveBeenCalledWith("76561198014056480");
  });
});
```

- [ ] **Krok 2: Spustit, ať padnou**

```bash
npm test -- zdroje
```

Očekávaný výsledek: FAIL, „Cannot find module './zdroje.js'“.

- [ ] **Krok 3: Implementace**

```ts
// src/players/zdroje.ts
import { savePlayerStats, type PlayerRow } from "../db/players.js";
import { steamZdroje } from "../external/steam.js";
import {
  fetchPersonalStatPodleAliasu,
  fetchPersonalStatPodleProfilu,
  fetchPersonalStat,
  type LeaderboardStats,
} from "../external/worldsEdge.js";
import type { RefreshDeps } from "./refresh.js";

export interface ZebricekZdroje {
  podleAliasu: (alias: string) => Promise<LeaderboardStats | null>;
  podleProfilu: (profilId: number) => Promise<LeaderboardStats | null>;
  podleSteamu: (steamId: string) => Promise<LeaderboardStats | null>;
}

const VYCHOZI: ZebricekZdroje = {
  podleAliasu: (alias) => fetchPersonalStatPodleAliasu(alias),
  podleProfilu: (profilId) => fetchPersonalStatPodleProfilu(profilId),
  podleSteamu: (steamId) => fetchPersonalStat(steamId),
};

/**
 * Odkud se berou statistiky konkrétního hráče. Microsoft hráč nemá Steam
 * profil ani hodiny, a jeho žebříček se poprvé hledá podle gamertagu —
 * podruhé už podle čísla profilu, protože alias si jde ve hře změnit.
 */
export function zdrojeProHrace(
  hrac: PlayerRow,
  steamApiKey: string,
  zdroje: ZebricekZdroje = VYCHOZI,
): RefreshDeps {
  if (hrac.platforma === "xbox") {
    return {
      nactiZebricek: () =>
        hrac.weProfilId !== null
          ? zdroje.podleProfilu(hrac.weProfilId)
          : hrac.xboxGamertag
            ? zdroje.podleAliasu(hrac.xboxGamertag)
            : Promise.resolve(null),
      nactiProfil: async () => null,
      // undefined = "nevíme", hodnoty v databázi se nesahají. Hodiny Microsoft
      // nezveřejňuje a vlastnictví se plní při přihlášení z herní historie.
      nactiHru: async () => undefined,
      uloz: savePlayerStats,
    };
  }
  return {
    nactiZebricek: (id) => zdroje.podleSteamu(id),
    ...steamZdroje(steamApiKey),
    uloz: savePlayerStats,
  };
}
```

- [ ] **Krok 4: Použít v `server.ts`**

```ts
    obnovStaty: async (hracId) => {
      const hrac = await getPlayer(hracId);
      if (maCerstveStaty(hrac)) return;
      if (!hrac) return;
      await refreshPlayerStats(hracId, zdrojeProHrace(hrac, config.steamApiKey));
      await broadcastAkce();
    },
```

- [ ] **Krok 5: Testy zeleně a commit**

```bash
npm test
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'EOF'
Pick the statistics sources by platform

A Microsoft player has no Steam profile and no hours, and the leaderboard
finds them by gamertag the first time. Every time after that it goes by
profile id, because an alias can be changed in the game and the profile
cannot.

refreshPlayerStats itself does not change — only what the caller hands it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 9: Avatar, vlastnictví hry a první dohledání profilu

Naplní `poPrihlaseni`, které úkol 7 nechal prázdné.

**Soubory:**
- Upravit: `src/http/server.ts`
- Test: `src/auth/microsoftRoutes.db.test.ts` (rozšíření)

**Rozhraní:**
- Konzumuje: `nactiGamerpic`, `nactiVlastnictvi` (úkol 6);
  `fetchPersonalStatPodleAliasu` (úkol 4); `savePlayerStats` (úkol 4)
- Produkuje: naplněné `poPrihlaseni`

- [ ] **Krok 1: Padající test**

Do `src/auth/microsoftRoutes.db.test.ts`:

Nejdřív do souboru vytáhnout pomocnou funkci, aby se průchod přihlášením
nepsal potřetí — použijí ji i testy z úkolu 7:

```ts
/** Projde celou přihlašovací cestou a vrátí odpověď z návratové routy. */
async function prihlas(app: FastifyInstance) {
  const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
  const cookie = decodeURIComponent(
    String(start.headers["set-cookie"]).match(/ms_stav=([^;]+)/)![1]!,
  );
  const stav = cookie.split("|")[0]!;
  return app.inject({
    method: "GET",
    url: `/api/auth/microsoft/return?code=k&state=${stav}`,
    cookies: { ms_stav: cookie },
  });
}

const ZEBRICEK_XBOX = {
  alias: "Jouki in Rage",
  country: "cz",
  elo1v1: 1200,
  eloNejvyssi: 1250,
  odehranoHer: 40,
  posledniZapas: new Date(0),
  zebricky: [],
  profil: "/xboxlive/D3B6B94FC53483297CEEA5A85933D3129D8A5B36",
  profilId: 6458213,
};

it("po přihlášení doplní avatar, vlastnictví hry a herní profil", async () => {
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: async () => "https://images-eds.xboxlive.com/x",
      vlastnictvi: async () => "ma" as const,
      zebricek: async () => ZEBRICEK_XBOX,
    }),
  });
  await prihlas(app);
  // poPrihlaseni visí mimo přihlašovací cestu, takže se musí počkat na jeho
  // doběhnutí — jinak by test měřil stav, který ještě nenastal.
  await vi.waitFor(async () => {
    expect((await getPlayer("xbox:2535412345678901"))?.weProfilId).toBe(6458213);
  });
  expect(await getPlayer("xbox:2535412345678901")).toMatchObject({
    avatarUrl: "https://images-eds.xboxlive.com/x",
    hraVlastnictvi: "ma",
    weProfil: "/xboxlive/D3B6B94FC53483297CEEA5A85933D3129D8A5B36",
    elo1v1: 1200,
  });
});

it("selhání kteréhokoliv doplňku nechá hráče přihlášeného", async () => {
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: async () => {
        throw new Error("Xbox profil odpověděl 500");
      },
      vlastnictvi: async () => {
        throw new Error("titlehub 500");
      },
      zebricek: async () => {
        throw new Error("Worlds Edge 500");
      },
    }),
  });
  const res = await prihlas(app);
  expect(res.statusCode).toBe(302);
  await vi.waitFor(async () => {
    expect((await getPlayer("xbox:2535412345678901"))?.statyChyba).toContain("Worlds Edge");
  });
});
```

- [ ] **Krok 2: Spustit, ať padne**

```bash
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
```

Očekávaný výsledek: FAIL, „vychoziPoPrihlaseni is not defined“.

- [ ] **Krok 3: Implementace**

Do `src/http/server.ts` (a export kvůli testu):

```ts
export interface DoplnkyPoPrihlaseni {
  gamerpic: (identita: XboxIdentita) => Promise<string | null>;
  vlastnictvi: (identita: XboxIdentita) => Promise<Vlastnictvi | undefined>;
  zebricek: (gamertag: string) => Promise<LeaderboardStats | null>;
}

/**
 * Co se k Microsoft hráči dotáhne hned po přihlášení. Tři nezávislé dotazy:
 * `allSettled`, aby jeden výpadek nesebral zbylé dva, a celé to visí mimo
 * přihlašovací cestu, takže přihlášení nezdrží ani nemůže shodit.
 */
export function vychoziPoPrihlaseni(
  doplnky: DoplnkyPoPrihlaseni,
): (hracId: string, identita: XboxIdentita) => Promise<void> {
  return async (hracId, identita) => {
    const [pic, hra, zebricek] = await Promise.allSettled([
      doplnky.gamerpic(identita),
      doplnky.vlastnictvi(identita),
      doplnky.zebricek(identita.gamertag),
    ]);

    const chyby: string[] = [];
    if (zebricek.status === "rejected") chyby.push(`Žebříček: ${popisChyby(zebricek.reason)}`);
    if (pic.status === "rejected") chyby.push(`Xbox profil: ${popisChyby(pic.reason)}`);
    if (hra.status === "rejected") chyby.push(`Herní historie: ${popisChyby(hra.reason)}`);

    const staty: PlayerStatsUpdate = {
      alias: zebricek.status === "fulfilled" ? (zebricek.value?.alias ?? null) : null,
      country: zebricek.status === "fulfilled" ? (zebricek.value?.country ?? null) : null,
      elo1v1: zebricek.status === "fulfilled" ? (zebricek.value?.elo1v1 ?? null) : null,
      eloNejvyssi: zebricek.status === "fulfilled" ? (zebricek.value?.eloNejvyssi ?? null) : null,
      odehranoHer: zebricek.status === "fulfilled" ? (zebricek.value?.odehranoHer ?? null) : null,
      posledniZapas: zebricek.status === "fulfilled" ? (zebricek.value?.posledniZapas ?? null) : null,
      zebricky: zebricek.status === "fulfilled" ? (zebricek.value?.zebricky ?? null) : null,
      weProfil: zebricek.status === "fulfilled" ? (zebricek.value?.profil ?? null) : null,
      weProfilId: zebricek.status === "fulfilled" ? (zebricek.value?.profilId ?? null) : null,
      avatarUrl: pic.status === "fulfilled" ? pic.value : null,
      chyba: chyby.length > 0 ? chyby.join("; ") : null,
    };
    // undefined = nepovedlo se zjistit; hodnotu v databázi nesaháme.
    if (hra.status === "fulfilled" && hra.value !== undefined) {
      staty.hraVlastnictvi = hra.value;
    }
    await savePlayerStats(hracId, staty);
    await broadcastAkce();
  };
}

function popisChyby(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

A ve `vychoziDeps()` nahradit prázdnou náhražku z úkolu 7:

```ts
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: (identita) => nactiGamerpic(identita),
      vlastnictvi: (identita) => nactiVlastnictvi(identita),
      zebricek: (gamertag) => fetchPersonalStatPodleAliasu(gamertag),
    }),
```

- [ ] **Krok 4: Testy zeleně a commit**

```bash
npm test
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'EOF'
Fill in the gamerpic, game history and game profile after signing in

Three independent requests behind allSettled, off the sign-in path: one
outage must not take the other two with it, and none of them may delay or
break the sign-in itself. A player whose profile is never found stays fully
usable, only without a rating.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Úkol 10: Rozpoznání v lobby přes profile_id

Dnes `mapaHracu` (po úkolu 2 přejmenovaná z `mapaSteamId`) zahodí všechno, co
nezačíná `/steam/`, takže Microsoft host vyjde jako `null` a v lobby je
neviditelný, i když se na web přihlásil.

**Klíčové rozhodnutí:** parser zůstane hermetický (na databázi sahat nesmí),
takže bude vracet **čísla profilů**, a překlad na `hracId` udělá až jedno
místo, které databázi má — `seznamLobby.ts`. `PoznatekLobby`, `SlotLobby`,
`lobbyKontrola.ts` ani `hledaniLobby.ts` se tím vůbec nemění.

**Soubory:**
- Upravit: `src/external/worldsEdgeLobby.ts`, `src/matches/seznamLobby.ts`, `src/db/players.ts`
- Test: `src/external/worldsEdgeLobby.test.ts`

**Rozhraní:**
- Konzumuje: `player.we_profil_id` (úkoly 2 a 4)
- Produkuje:
  - `interface SlotSProfilem extends Omit<SlotLobby, "hracId"> { profilId: number }`
  - `interface InzeratSProfily` — viz krok 3
  - `parseAdvertisements(json: unknown): InzeratSProfily[]` (změněný návratový typ)
  - `profilyVInzeratech(inzeraty: InzeratSProfily[]): number[]`
  - `prelozHrace(inzeraty: InzeratSProfily[], mapa: Map<number, string>): LobbyInzerat[]`
  - `hraciPodleProfilu(profily: number[]): Promise<Map<number, string>>` v `src/db/players.ts`

- [ ] **Krok 1: Obrátit dosavadní test a přidat překlad**

V `src/external/worldsEdgeLobby.test.ts` je dnes test „host mimo Steam (Xbox)
dostane null, id jako text projde“. Nahradit ho trojicí:

```ts
it("host z Xboxu už se nezahazuje — parser vrací číslo profilu", () => {
  // Dřív dostal null: filtr bral jen /steam/. Microsoft hráč tím byl v lobby
  // neviditelný, i když se na web přihlásil.
  const xbox = parseAdvertisements(inzeraty).find((l) => l.nazev === "xbox host");
  expect(xbox).toMatchObject({ lobbyId: "504951802" });
  expect(xbox?.hostProfilId).toBeTypeOf("number");
  expect(xbox?.clenoveProfily.length).toBeGreaterThan(0);
});

it("překlad na hráče webu platí pro obě platformy stejně", () => {
  const surove = parseAdvertisements(inzeraty);
  const xbox = surove.find((l) => l.nazev === "xbox host")!;
  const mapa = new Map([[xbox.hostProfilId!, "xbox:2535412345678901"]]);
  const prelozene = prelozHrace(surove, mapa);
  expect(prelozene.find((l) => l.nazev === "xbox host")).toMatchObject({
    hostHracId: "xbox:2535412345678901",
    clenoveHraci: ["xbox:2535412345678901"],
  });
});

it("profil, který na webu není, zůstane nerozpoznaný, ne vymyšlený", () => {
  const prelozene = prelozHrace(parseAdvertisements(inzeraty), new Map());
  expect(prelozene.every((l) => l.hostHracId === null)).toBe(true);
  expect(prelozene.every((l) => l.clenoveHraci.length === 0)).toBe(true);
});
```

- [ ] **Krok 2: Spustit, ať padnou**

```bash
npm test -- worldsEdgeLobby
```

Očekávaný výsledek: FAIL — `hostProfilId` a `prelozHrace` neexistují.

- [ ] **Krok 3: Parser vrací čísla profilů**

V `src/external/worldsEdgeLobby.ts`. Funkce `mapaHracu` se ruší celá —
filtrovat podle platformy už není potřeba.

```ts
/** Slot, jak vyjde z parseru: hráč je zatím jen číslo profilu. */
export interface SlotSProfilem extends Omit<SlotLobby, "hracId"> {
  profilId: number;
}

/**
 * Inzerát, jak vyjde z parseru. Hráči jsou čísla profilů, protože parser je
 * hermetický a na databázi sahat nesmí. Každý záznam v `avatars` má
 * `profile_id` bez ohledu na platformu — a totéž číslo drží web ve
 * `player.we_profil_id`, takže jedna cesta stačí na Steam i Xbox.
 */
export interface InzeratSProfily {
  lobbyId: string;
  hostProfilId: number | null;
  nazev: string;
  maHeslo: boolean;
  povolujeDivaky: boolean;
  clenoveProfily: number[];
  slotyProfily: SlotSProfilem[];
  aiSloty: AiSlot[];
  pocetSlotu: number | null;
  preLobby: PreLobbyZeHry;
  nastaveni: NastaveniZeHry | null;
}
```

`parseSloty` přestane dostávat mapu a vrací `profilId`. Mění se jen hlavička
a vnitřek smyčky, zbytek těla (rozbalení, hledání závorky, `pocetSlotu`)
zůstává, jak je:

```ts
export function parseSloty(zabalene: unknown): {
  lide: SlotSProfilem[];
  ai: AiSlot[];
  pocetSlotu: number | null;
} {
  // … rozbalení a JSON.parse beze změny …
  for (const s of pole) {
    if (!jeObjekt(s)) continue;
    if (s["status"] !== STAV_ZAVRENY) pocetSlotu++;
    const pid = s["profileInfo.id"];
    // Prázdný slot i AI mají id −1. Dosud je odfiltrovalo to, že takové
    // číslo nebylo v mapě Steam ID; bez mapy to musí udělat tahle podmínka,
    // jinak by se z počítačového protivníka stal „hráč“.
    if (typeof pid === "number" && pid > 0) {
      lide.push({ profilId: pid, ...slotZMetadat(s) });
      continue;
    }
    if (s["status"] === STAV_AI) ai.push(slotZMetadat(s));
  }
  return { lide, ai, pocetSlotu };
}
```

V `parseAdvertisements` odpadne mapa a čísla se berou tak, jak jsou:

```ts
    const host = m["host_profile_id"];
    const clenove: number[] = [];
    const members = m["matchmembers"];
    if (Array.isArray(members)) {
      for (const c of members) {
        if (!jeObjekt(c)) continue;
        const pid = c["profile_id"];
        if (typeof pid === "number" && pid > 0) clenove.push(pid);
      }
    }
    // Jedno rozbalení slotinfo na inzerát: dosud se parseSloty volalo dvakrát
    // na tentýž zip, jednou kvůli slotům a podruhé kvůli maxHracu. Při až
    // tisícovce lobby na dotaz je to zbytečná práce navíc.
    const { lide, ai, pocetSlotu } = parseSloty(m["slotinfo"]);
    const options = parseOptions(m["options"]);
    vysledek.push({
      lobbyId,
      hostProfilId: typeof host === "number" && host > 0 ? host : null,
      nazev: typeof m["description"] === "string" ? m["description"] : "",
      maHeslo: m["passwordprotected"] === 1 || m["passwordprotected"] === true,
      povolujeDivaky: m["isobservable"] === 1 || m["isobservable"] === true,
      clenoveProfily: clenove,
      slotyProfily: lide,
      aiSloty: ai,
      pocetSlotu,
      preLobby: {
        lobbyTyp: typeof m["matchtype_id"] === "number" ? m["matchtype_id"] : null,
        viditelnost: typeof m["visible"] === "number" ? m["visible"] : null,
        maxHracu: pocetSlotu,
        zpozdeniDivakuSekund: typeof m["observerdelay"] === "number" ? m["observerdelay"] : null,
        server: typeof m["relayserver_region"] === "string" ? m["relayserver_region"] : null,
      },
      nastaveni: options ? nastaveniZOptions(options) : null,
    });
```

- [ ] **Krok 4: Překlad na hráče webu**

Ve stejném souboru, pořád hermeticky:

```ts
/** Všechna čísla profilů, na která se pak databáze zeptá jedním dotazem. */
export function profilyVInzeratech(inzeraty: InzeratSProfily[]): number[] {
  const vsechny = new Set<number>();
  for (const i of inzeraty) {
    if (i.hostProfilId !== null) vsechny.add(i.hostProfilId);
    for (const p of i.clenoveProfily) vsechny.add(p);
    for (const s of i.slotyProfily) vsechny.add(s.profilId);
  }
  return [...vsechny];
}

/**
 * Z čísel profilů udělá hráče webu. Kdo na webu není, vypadne — nerozpoznaný
 * hráč je správná odpověď, vymyšlené id by bylo horší než žádné.
 */
export function prelozHrace(
  inzeraty: InzeratSProfily[],
  mapa: Map<number, string>,
): LobbyInzerat[] {
  return inzeraty.map((i) => ({
    lobbyId: i.lobbyId,
    hostHracId: i.hostProfilId !== null ? (mapa.get(i.hostProfilId) ?? null) : null,
    nazev: i.nazev,
    maHeslo: i.maHeslo,
    povolujeDivaky: i.povolujeDivaky,
    clenoveHraci: i.clenoveProfily.flatMap((p) => {
      const hracId = mapa.get(p);
      return hracId ? [hracId] : [];
    }),
    sloty: i.slotyProfily.flatMap((s) => {
      const hracId = mapa.get(s.profilId);
      return hracId
        ? [{ hracId, barva: s.barva, tym: s.tym, civ: s.civ, pripraven: s.pripraven }]
        : [];
    }),
    aiSloty: i.aiSloty,
    preLobby: i.preLobby,
    nastaveni: i.nastaveni,
  }));
}
```

`fetchAdvertisements` změní návratový typ na `InzeratSProfily[]`; jinak se
nemění.

- [ ] **Krok 5: Dotaz do databáze**

Do `src/db/players.ts`:

```ts
/** Profil z lobby na hráče webu; jeden dotaz na celý seznam. */
export async function hraciPodleProfilu(profily: number[]): Promise<Map<number, string>> {
  if (profily.length === 0) return new Map();
  const { rows } = await getPool().query<{ we_profil_id: number; hrac_id: string }>(
    `SELECT we_profil_id, hrac_id FROM player WHERE we_profil_id = ANY($1::integer[])`,
    [profily],
  );
  return new Map(rows.map((r) => [r.we_profil_id, r.hrac_id]));
}
```

- [ ] **Krok 6: Spojit v `seznamLobby.ts`**

Jediné místo, kde se parser a databáze potkávají. Cache zůstává táž, takže
dotaz do databáze proběhne nejvýš tak často jako dotaz na hru.

```ts
import { hraciPodleProfilu } from "../db/players.js";
import {
  fetchAdvertisements,
  prelozHrace,
  profilyVInzeratech,
} from "../external/worldsEdgeLobby.js";
import { SeznamLobby } from "./hledaniLobby.js";

/**
 * Jedna cache seznamu lobby pro celý proces: sdílí ji routa „Vyhledat hru“
 * i sledování fáze lobby na pozadí. Čísla profilů z inzerátů se hned překládají
 * na hráče webu, aby zbytek kódu o platformách vůbec nevěděl.
 */
export const seznamLobby = new SeznamLobby(async () => {
  const surove = await fetchAdvertisements();
  return prelozHrace(surove, await hraciPodleProfilu(profilyVInzeratech(surove)));
});
```

- [ ] **Krok 7: Ověřit, že se `hledaniLobby` a `lobbyKontrola` nemusely měnit**

```bash
git diff --stat src/shared/lobbyKontrola.ts src/matches/hledaniLobby.ts
```

Očekávaný výsledek: **žádný výstup**. Kdyby se některý změnil, překlad je na
špatné vrstvě — vrátit se ke kroku 4.

- [ ] **Krok 8: Testy zeleně a commit**

```bash
npm test
ssh root@178.104.160.182 "bash /root/aoe-deploy/test-db.sh dev"
npx tsc --noEmit && npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'KONEC'
Recognise lobby players by profile id instead of Steam id

Every entry in an advertisement's avatars array carries a profile_id whatever
the platform, and the site now stores the same number, so one path covers
Steam and Xbox alike. A Microsoft host used to come back as null and was
invisible in a lobby even after signing in.

The parser keeps its hands off the database and returns profile numbers; the
one place that has a database translates them. Nothing downstream changes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
KONEC
git push origin dev
```

---

## Úkol 11: Rozhraní — tlačítko a platforma

**Soubory:**
- Upravit: `web/src/App.tsx`, `web/src/views/KartaHrace.tsx`, `web/src/styl.css`
- Test: `web/src/App.test.tsx`

**Rozhraní:**
- Konzumuje: `/api/auth/microsoft` (úkol 7), `PlayerView.platforma` (úkol 2)
- Produkuje: nic pro další úkoly

- [ ] **Krok 1: Padající test**

```tsx
// web/src/App.test.tsx
it("nepřihlášenému nabídne obě cesty", async () => {
  render(<App />);
  expect(await screen.findByRole("link", { name: /Steam/ })).toHaveAttribute(
    "href",
    expect.stringContaining("/api/auth/steam"),
  );
  expect(screen.getByRole("link", { name: /Microsoft/ })).toHaveAttribute(
    "href",
    expect.stringContaining("/api/auth/microsoft"),
  );
});
```

- [ ] **Krok 2: Spustit, ať padne**

```bash
npm --prefix web test -- --run App
```

Očekávaný výsledek: FAIL, odkaz s „Microsoft“ neexistuje.

- [ ] **Krok 3: Implementace**

V `web/src/App.tsx` nahradit samostatné tlačítko dvojicí:

```tsx
            <span className="prihlaseni">
              <a className="tlacitko" href={cesta("/api/auth/steam")}>
                Přihlásit se přes Steam
              </a>
              <a className="tlacitko" href={cesta("/api/auth/microsoft")}>
                Přihlásit se přes Microsoft
              </a>
              <small>Microsoft účet je pro hru z Microsoft Store nebo Game Passu.</small>
            </span>
```

Styl do `web/src/styl.css`, barvy **jen z `:root`**, nikdy napevno:

```css
/* Dvě přihlašovací cesty vedle sebe; na úzké obrazovce pod sebe. */
.prihlaseni {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  align-items: center;
}
.prihlaseni small {
  flex-basis: 100%;
  color: var(--barva-text-tlumeny);
}
```

Na kartě hráče platforma u jména (`web/src/views/KartaHrace.tsx`):

```tsx
        {hrac.platforma === "xbox" ? (
          <span className="platforma" title="Hra z Microsoft Store nebo Game Passu">
            Microsoft
          </span>
        ) : null}
```

- [ ] **Krok 4: Testy zeleně, build, verze, commit**

```bash
npm --prefix web test -- --run
npm --prefix web exec tsc -- -b --force
npm run build; echo "EXIT=$?"
npm run verze
git add -A
git commit -F - <<'EOF'
Offer signing in with a Microsoft account

Two buttons side by side, with one line saying who the second one is for.
The player card names the platform, because it explains why someone has no
hours next to their name.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

- [ ] **Krok 5: Vizuální kontrola uživatelem**

Zelené testy nejsou důkaz, že UI funguje. Požádat uživatele, ať se podívá na
<https://jouki.cz/aoe/dev> — obě tlačítka vedle sebe, čitelná i na mobilu.

---

## Úkol 12: Dokumentace a nasazení

**Soubory:**
- Upravit: `.env.example`, `README.md`, `CONTRIBUTING.md`,
  `docs/prehled-praci-a-zameru.md` (sekce 1, 4, 5, 6)

**Rozhraní:**
- Konzumuje: všechno předchozí
- Produkuje: nic

- [ ] **Krok 1: `.env.example`**

```
# Přihlášení Microsoft účtem (hráči z Microsoft Store a Game Passu).
# Registrace: entra.microsoft.com → App registrations, typ účtů
# "Personal Microsoft accounts only". Bez obou hodnot se tlačítko neukáže.
MS_CLIENT_ID=
MS_CLIENT_SECRET=
```

- [ ] **Krok 2: README a CONTRIBUTING**

Do README k popisu přihlášení: web má dvě cesty, Steam a Microsoft, a klíč
hráče je `hrac_id` — `76561198…` u Steamu, `xbox:<xuid>` u Microsoftu,
`test:<jmeno>` u zkušebních. `ADMIN_STEAM_ID` bere obojí, jméno proměnné
zůstalo kvůli nasazení.

V CONTRIBUTING doplnit do mapy kódu `src/auth/microsoftRoutes.ts`,
`src/auth/microsoftOAuth.ts`, `src/external/xboxLive.ts`,
`src/players/zdroje.ts`.

- [ ] **Krok 3: Přehled prací**

Sekce 1 (stav), sekce 4 (nová tabulka ověřeného: `getPersonalStat` podle
aliasu a profile_id, `/xboxlive/` tvar, co vrátil `titlehub`), sekce 5
(vyškrtnout, co se rozhodlo), sekce 6 (verze).

- [ ] **Krok 4: Coolify**

Uživatel vloží `MS_CLIENT_ID` a `MS_CLIENT_SECRET` do všech tří aplikací.
Změna proměnné je `PATCH /applications/{uuid}/envs` **a pak** `/deploy?uuid=` —
samotný `/restart` nové proměnné nenačte.

Ověřit, že se tlačítko ukázalo:

```bash
curl -s https://jouki.cz/aoe/dev/api/health
curl -si https://jouki.cz/aoe/dev/api/auth/microsoft | head -3
```

Očekávaný výsledek druhého příkazu: `HTTP/2 302` a `location:` na
`login.microsoftonline.com`.

- [ ] **Krok 5: Commit**

```bash
git add -A
git commit -F - <<'EOF'
Docs: two ways in, and what the player key means now

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
git push origin dev
```

---

## Co plán vědomě nedělá

- **Neslučuje účty.** Model to umožňuje (`steam_id` i `xbox_xuid` na jednom
  řádku), obrazovka pro to není a nikdo ji nežádal.
- **Nedělá tabulku identit** (varianta 3 z rozvahy). Až bude na stole
  PlayStation — v seznamu lobby jich bylo 18 — přidá se tabulka a dva sloupce
  se do ní přesunou. Cizí klíče už míří na `hrac_id`, takže se na ně nesáhne.
- **Neověřuje vlastnictví hry.** Nejde to; spec §6.1 říká proč.
- **Nemění záložní cestu** (název lobby, heslo, číslo k ručnímu vyhledání).
  Zůstává pro obě platformy stejná.
