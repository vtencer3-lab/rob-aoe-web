# Diplomacie: základ a rozdání rolí — plán implementace

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mód Diplomacie na `/aoe/diplo`: přepínač u akce, scénář nahrávaný přes web s automatickým rozborem, kontrola scénáře v lobby, los rolí GM, tajné karty hráčů a pult GM.

**Architecture:** Modul módu (`src/diplomacie/`, `src/shared/diplomacie/`, `web/src/diplomacie/`) napojený na jádro dvanácti háčky (H1–H12 ve specu §4.1). Jádro zná jen rozhraní `RezimAkce` a sloupec `akce.rezim`; klasický mód je prázdná implementace, takže dnešní web se nemění. Tajná data žijí jen ve větvi stavu `rezim.data` a rediguje je čistá funkce módu pro každého diváka zvlášť.

**Tech Stack:** TypeScript (NodeNext, strict), Fastify 5, PostgreSQL (`pg`), React 19 + Vite, Vitest (hermetické / DB / jsdom), Python 3 + AoE2ScenarioParser 0.9.2 + Pillow (rozbor scénáře), genieutils-py (jednorázový nástroj barev).

**Spec:** `docs/superpowers/specs/2026-10-01-diplomacie-zaklad-a-role-design.md` — číst spolu s plánem; plán odkazuje na jeho paragrafy (§).

## Global Constraints

- Pracuje se ve větvi `diplo`; do `dev` ani `main` se v tomhle plánu necommituje.
- Verze ve větvi `diplo` má tvar `X.Y.Z-A.B`; začíná `1.13.10-13.10`; každý commit měnící chování zvedne verzi (`npm run verze`), nová funkce nebo migrace `npm run verze -- minor`.
- Identifikátory, texty v UI a komentáře česky (komentáře: proč, ne co); commity anglicky v rozkazovacím způsobu a končí řádkem `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`.
- TypeScript ESM: přípona `.js` v importech, `verbatimModuleSyntax` (typy přes `import type`), `noUncheckedIndexedAccess`.
- Barvy nikdy napevno v pravidlech CSS — jen proměnné z `:root` (`docs/grafika.md`).
- Žádná nová npm závislost (multipart ani jiná). Python závislosti jen v `src/diplomacie/requirements.txt` se zamčenými verzemi.
- Admin, který není GM zápasu, tajná data Diplomacie **nikdy** nedostane (spec §1.1 bod 3, §7).
- SSE posílá vždy celý stav; nic tajného mimo `rezim.data`.
- Před každým commitem s kódem: `npm test`, `npm --prefix web test`, `npx tsc --noEmit` a `npm run build; echo EXIT=$?` (EXIT musí být 0 — ne roura do grep). DB testy: push do `diplo`, pak `ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo` (lokálně Postgres není).
- Grafika jen nástroji (lokální ComfyUI, úpravy hotových obrázků přes Codex `codex exec -i`), nikdy ruční kreslení ani ruční úprava pixelů.
- Scénář je veřejný se souhlasem autora (Jin, 1. 10. 2026) — jeho kopie smí do repa jako testovací fixtura.

## Review Focus

1. **Admin-ne-GM a stream:** admin, který je v zápase obyčejný hráč nebo vůbec nehraje, otevře stránku → nesmí dostat cizí role ani cíle (ani v `GET /api/akce`, ani v SSE). Test: úkol 6 (viditelnost) a úkol 8 (DB test `GET /api/akce` jako admin-ne-GM).
2. **Změna sestavy po losu:** admin v režii upraví sestavu zápasu, kde už jsou role → 409, role nezůstanou viset na lidech mimo zápas. Test: úkol 9.
3. **Nahrání vadného nebo cizího souboru:** autor nahraje `.aoe2scenario` z jiné verze hry, rozbitý soubor nebo obrázek přejmenovaný na `.aoe2scenario` → 400 u špatné hlavičky, u nečitelného scénáře uložená verze s chybou rozboru, kterou nejde aktivovat; server nespadne a nevisí. Test: úkol 5 (rozbor) a úkol 10 (routy).
4. **Žádná verze scénáře:** akce Diplomacie bez jediné nahrané verze → web funguje, karta jen bez čísel cílů, host vidí „scénář zatím nikdo nenahrál“. Test: úkol 8 (stav bez nahrané verze má `aktivni: null`) a úkol 13 (karta bez rozboru).
5. **Obnovení stránky během hry:** hráč s odkrytou kartou dá F5 → karta je zakrytá; GM obnoví stránku uprostřed úprav → vidí stav ze serveru, nic se neztratí. Test: úkol 11 (Zakryti nový mount) a úkol 14 (pult je po mountu zakrytý a všechno čte ze stavu serveru).

## Mapa souborů

| soubor | odpovědnost | úkol |
|---|---|---|
| `scripts/verze.ts` (+test) | pokusné verzování i pro `diplo` | 1 |
| `.github/workflows/deploy.yml`, server `watch.sh`, Coolify | nasazení `/aoe/diplo` | 1 |
| `src/shared/lobbyKontrola.ts`, `src/external/worldsEdgeLobby.ts`, `src/http/routes/kontrolaLobby.ts` (+testy, fixtura) | scénář v kontrole lobby (jádro) | 2 |
| `database/030_rezim_akce.sql`, `src/db/events.ts`, `src/http/routes/events.ts`, `src/shared/types.ts`, `web/src/api.ts`, `web/src/views/SpravaAkce.tsx`, `web/src/App.tsx` | sloupec `akce.rezim`, přepínač | 3 |
| `src/shared/diplomacie/typy.ts`, `role.ts`, `los.ts`, `scenar.ts`, `sestava.ts` | čistá pravidla módu | 4 |
| `src/diplomacie/rozbor.py`, `rozbor.ts`, `requirements.txt`, `barvy_terenu.json`, `fixtures/`, `nastroje/diplomacie/barvy_terenu.py`, `Dockerfile`, `src/config.ts`, `scripts/copy-migrations.ts` | rozbor scénáře | 5 |
| `src/shared/diplomacie/viditelnost.ts` | redakce tajných dat | 6 |
| `database/031_diplomacie.sql`, `src/diplomacie/db.ts` | tabulky a dotazy | 7 |
| `src/shared/rezimy.ts`, `src/rezimy/index.ts`, `src/diplomacie/rezim.ts`, háčky v `events.ts`, `matches.ts` (db i routes), `akceStav.ts`, `redakce.ts`, `Skladani.tsx` | rozhraní módů a háčky | 8 |
| `src/diplomacie/routes.ts` (role), `src/http/server.ts` | API rolí GM | 9 |
| `src/diplomacie/routes.ts` (scénář), `src/auth/routes.ts`, `src/config.ts` | API verzí scénáře | 10 |
| `web/src/rezimy/index.tsx`, `web/src/diplomacie/Zakryti.tsx`, `api.ts`, místa H9 v `KartaHrace`, `ObrazovkaHosta`, `VerejnyZapas`, `Skladani`, `App.tsx` | klient módů | 11 |
| `web/src/diplomacie/MapaScenare.tsx` | minimapa s překryvy | 12 |
| `web/src/diplomacie/KartaRole.tsx`, `PravidlaHry.tsx`, `VerejnyRadek.tsx` | karta hráče | 13 |
| `web/src/diplomacie/PultGm.tsx` | pult GM | 14 |
| `web/src/diplomacie/SpravaScenare.tsx`, `StazeniScenare.tsx` | nahrávání a stažení | 15 |
| `web/src/assets/diplomacie/*`, `docs/grafika.md` | znaky rolí, rub karty, rám | 16 |
| `docs/*`, `CLAUDE.md` | dokumentace, živé ověření | 17 |

---

## Úkol 1: Větev `diplo`, verzování a nasazení na `/aoe/diplo`

**Files:**
- Modify: `scripts/verze.ts:133`, `scripts/verze.ts:175-200`
- Test: `scripts/verze.test.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify (server): `/root/aoe-deploy/watch.sh`
- Modify: `docs/nasazeni-jouki-cz.md` (§1, §2.1, §3.5, §3.6), `CLAUDE.md` (odstavec o větvích)

**Interfaces:**
- Produces: `POKUSNE_VETVE: readonly string[]` exportované ze `scripts/verze.ts`; nasazená aplikace na `https://jouki.cz/aoe/diplo` s `/api/health` → `1.13.10-13.10`.

- [ ] **Step 1: Napsat padající test pro pokusnou větev `diplo`**

Do `scripts/verze.test.ts` přidat:

```ts
import { duvodOdmitnuti, POKUSNE_VETVE } from "./verze.js";

it("diplo je pokusná větev stejně jako experimental", () => {
  expect(POKUSNE_VETVE).toEqual(["experimental", "diplo"]);
  expect(duvodOdmitnuti("1.13.10-13.10", "patch", "diplo")).toBeNull();
  expect(duvodOdmitnuti("1.13.10-13.10", "patch", "dev")).toMatch(/pokusná verze/);
});
```

(Pokud `duvodOdmitnuti` už je v importu souboru, jen rozšířit import o `POKUSNE_VETVE`.)

- [ ] **Step 2: Spustit test a ověřit, že padá**

Run: `npx vitest run scripts/verze.test.ts`
Expected: FAIL — `POKUSNE_VETVE` není exportované.

- [ ] **Step 3: Zobecnit skript**

V `scripts/verze.ts` pod `TVAR_POKUSNY` přidat:

```ts
/**
 * Větve s pokusným verzováním `X.Y.Z-A.B`. `diplo` (mód Diplomacie, od
 * 1. 10. 2026) se verzuje stejně jako `experimental`: je to odbočka z devu,
 * která se do něj jednou vrátí.
 */
export const POKUSNE_VETVE: readonly string[] = ["experimental", "diplo"];
```

V `duvodOdmitnuti` nahradit `vetev === "experimental"` za `POKUSNE_VETVE.includes(vetev)`.
V hlavní části (řádek s `throw new Error(\`Pokusné verzování patří do větve experimental, ne do ${vetev}.\`)`) nahradit podmínku `vetev !== "experimental"` za `!POKUSNE_VETVE.includes(vetev)` a text za `` `Pokusné verzování patří do větví ${POKUSNE_VETVE.join(", ")}, ne do ${vetev}.` ``.
Doc komentář nahoře doplnit větou: „Pokusné větve jsou v `POKUSNE_VETVE` (dnes `experimental` a `diplo`).“ `z-experimentu` bez argumentu dál čte `experimental`; pro diplo se verze předává ručně (spec §3).

- [ ] **Step 4: Testy projdou**

Run: `npx vitest run scripts/verze.test.ts`
Expected: PASS (všechny dosavadní testy i nový).

- [ ] **Step 5: Založit verzi a commitnout**

```bash
npm run verze -- experiment      # 1.13.10 → 1.13.10-13.10
grep '"version"' package.json    # "version": "1.13.10-13.10"
git add scripts/verze.ts scripts/verze.test.ts package.json src/shared/verze.ts
git commit -m "Version the diplo branch like experimental

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 6: Databáze `rob_aoe_diplo` na serveru**

```bash
ssh root@178.104.160.182 'docker exec aj70ceyvdhxuvhe07suo3q9y sh -c "psql -U \$POSTGRES_USER -d postgres -c \"CREATE DATABASE rob_aoe_diplo OWNER rob_aoe\""'
```

Expected: `CREATE DATABASE`.

- [ ] **Step 7: Coolify aplikace `aoe-web-diplo`**

Vzor je `aoe-web-experimental` (uuid `on5tol2pydo75d64r6zqhml3`). Token a heslo DB jsou v `/root/aoe-deploy/.env` — nikdy je nevypisovat. Na serveru:

```bash
ssh root@178.104.160.182 'set -a; . /root/aoe-deploy/.env; set +a; API=https://coolify.jouki.cz/api/v1;
  curl -s -H "Authorization: Bearer $COOLIFY_TOKEN" $API/applications/on5tol2pydo75d64r6zqhml3 | python3 -c "import json,sys; a=json.load(sys.stdin); print({k:a.get(k) for k in [\"project_uuid\",\"environment_name\",\"server_uuid\",\"destination_uuid\",\"git_repository\",\"build_pack\",\"ports_exposes\",\"fqdn\"]})"'
```

Z výpisu vzít `project_uuid`, `environment_name`, `server_uuid`, `destination_uuid` a založit novou aplikaci se stejnými hodnotami a odlišnostmi `name=aoe-web-diplo`, `git_branch=diplo`, `domains=https://jouki.cz/aoe/diplo` (POST `$API/applications/public`, tělo jako u experimental; přesný tvar podle `docs/nasazeni-jouki-cz.md` §3). Uložit vrácené `uuid` jako `DIPLO_UUID` do poznámek úkolu.

- [ ] **Step 8: Proměnné prostředí**

Pro `DIPLO_UUID` přes `PATCH $API/applications/$DIPLO_UUID/envs` (po jedné) nastavit:

| klíč | hodnota | build time |
|---|---|---|
| `DATABASE_URL` | stejný tvar jako u experimental, databáze `rob_aoe_diplo` | ne |
| `BASE_URL` | `https://jouki.cz/aoe/diplo` | ne |
| `BASE_PATH` | `/aoe/diplo/` | **ano** |
| `HOST` | `0.0.0.0` | ne |
| `PORT` | `3000` | ne |
| `ADMIN_STEAM_ID` | hodnota z `aoe-web-dev` (uuid `wxju55zz9imrhn9lco0drrvc`) | ne |
| `STEAM_API_KEY` | hodnota z `aoe-web-dev` | ne |
| `MS_CLIENT_ID`, `MS_CLIENT_SECRET` | hodnoty z `aoe-web-dev` | ne |
| `ZKUSEBNI_HRACI` | `true` | ne |
| `LOG_LEVEL` | `info` | ne |

Hodnoty z devu kopírovat skriptem na serveru (GET envs devu → PATCH envs dipla), aby tajemství neprošla výstupem.

- [ ] **Step 9: Hlídač a GitHub Action**

Na serveru do `/root/aoe-deploy/watch.sh` přidat dvojici do seznamu ve smyčce `for pair in …`: `"diplo:$DIPLO_UUID"` (záloha `watch.sh.pred-diplo`).
V `.github/workflows/deploy.yml` přidat `diplo` do `branches` a do `case` větev `diplo) UUID=<DIPLO_UUID> ;;` stejně jako ostatní.

- [ ] **Step 10: Dokumentace nasazení**

- `docs/nasazeni-jouki-cz.md` §1: řádek „`diplo` → https://jouki.cz/aoe/diplo, Coolify `aoe-web-diplo` (`<DIPLO_UUID>`), DB `rob_aoe_diplo` — mód Diplomacie, do `dev` přes merge jako experimental“.
- §2.1: věta „Stejně se verzuje větev `diplo` (`POKUSNE_VETVE` ve `scripts/verze.ts`); `z-experimentu` pro ni dostává verzi ručně.“
- §3.5: databáze `rob_aoe_diplo`. §3.6: sloupec „diplo“ v tabulce proměnných (hodnoty z kroku 8, `MS_*` nastaveno, `AUTORI_SCENARE` doplní úkol 10).
- `CLAUDE.md` odstavec o větvích: „`diplo` → <https://jouki.cz/aoe/diplo> — mód Diplomacie, pravidla jako `experimental`.“

```bash
git add .github/workflows/deploy.yml docs/nasazeni-jouki-cz.md CLAUDE.md
git commit -m "Deploy the diplo branch at /aoe/diplo

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

- [ ] **Step 11: Ověřit nasazení**

```bash
until curl -s https://jouki.cz/aoe/diplo/api/health | grep -q '1.13.10-13.10'; do sleep 15; done; curl -s https://jouki.cz/aoe/diplo/api/health
curl -s https://jouki.cz/aoe/diplo/api/me      # {"hrac":null,"maMicrosoft":true}
```

Expected: `{"ok":true,"verze":"1.13.10-13.10"}` a `maMicrosoft:true`. Pak ověřit přihlášení Microsoftem zvenku jako v §3.6.1 (velikost odpovědi `Location` z `/api/auth/microsoft`).

---

## Úkol 2: Scénář v kontrole lobby (jádro)

**Files:**
- Modify: `src/shared/lobbyKontrola.ts` (typy `NastaveniLobby`, `NastaveniZeHry`, `VYCHOZI_NASTAVENI`, `zkontrolujLobby`)
- Modify: `src/external/worldsEdgeLobby.ts:125-158` (`nastaveniZOptions`)
- Modify: `src/http/routes/kontrolaLobby.ts:40-102` (`prectiNastaveniLobby`)
- Create: `src/external/fixtures/worldsedge-scenar.json`
- Test: `src/shared/lobbyKontrola.test.ts`, `src/external/worldsEdgeLobby.test.ts`, `src/http/routes/kontrolaLobby.test.ts`

**Interfaces:**
- Produces: `NastaveniLobby.scenar: string | null`, `NastaveniLobby.scenarStarsi: string[] | null` (jména starších verzí; null = neznámé), `NastaveniZeHry.scenar?: string | null`, konstanta `REZIM_SCENARIO = 3`, `jePlatneJmenoScenare(jmeno: string): boolean` (ze `lobbyKontrola.ts`).

- [ ] **Step 1: Nahrát skutečnou scénářovou lobby jako fixturu**

Spustit jednorázový skript (scratchpad, ne do repa), který stáhne `findAdvertisements?title=age2&start=0..`, najde první inzerát s `parseOptions(options).get("5") === "3"` a uloží **celý surový inzerát** (jak ho vrací API) do `src/external/fixtures/worldsedge-scenar.json` ve tvaru stejném jako existující `worldsedge-*.json` fixtury (podívat se na jednu z nich a dodržet obal). Jméno scénáře v klíči `38` zapsat do komentáře testu.

- [ ] **Step 2: Padající testy**

`src/external/worldsEdgeLobby.test.ts`:

```ts
it("u scénářové lobby přečte jméno souboru scénáře z options[38]", async () => {
  const surove = JSON.parse(await readFile(new URL("./fixtures/worldsedge-scenar.json", import.meta.url), "utf8"));
  const [inzerat] = parseAdvertisements(surove);
  expect(inzerat?.nastaveni?.rezim).toBe(3);
  expect(inzerat?.nastaveni?.scenar).toMatch(/\.aoe2scenario$/);
});
```

(`readFile` z `node:fs/promises`; pokud test soubor fixtury načítá jinak, použít jeho způsob.)

`src/shared/lobbyKontrola.test.ts` (použít existující pomocníky souboru pro sestavení `PoznatekLobby` a účastníků; níž `lobbySNastavenim(n)` značí ten pomocník s nastavením přepsaným o `n`):

```ts
describe("scénář", () => {
  const ocekavane = { ...VYCHOZI_NASTAVENI, rezim: 3, mapaId: 10875, scenar: "Diplomacie LLC v2.aoe2scenario", scenarStarsi: ["Diplomacie LLC v1.aoe2scenario"] };
  const radek = (scenar: string | null | undefined) =>
    zkontrolujLobby(ucastnici, ocekavane, lobbySNastavenim({ rezim: 3, mapaId: 10901, scenar })).find((k) => k.klic === "scenar");

  it("shoda je zelená", () => {
    expect(radek("Diplomacie LLC v2.aoe2scenario")).toMatchObject({ stav: "ok", sekce: "hlavni", text: "Scénář: Diplomacie LLC v2.aoe2scenario" });
  });
  it("starší verze je červená a řekne to", () => {
    expect(radek("Diplomacie LLC v1.aoe2scenario")).toMatchObject({ stav: "spatne", text: "Scénář: v lobby je starší verze Diplomacie LLC v1.aoe2scenario, má být Diplomacie LLC v2.aoe2scenario" });
  });
  it("jiný soubor je červený", () => {
    expect(radek("Jiny.aoe2scenario")).toMatchObject({ stav: "spatne", text: "Scénář: v lobby je Jiny.aoe2scenario, má být Diplomacie LLC v2.aoe2scenario" });
  });
  it("chybějící jméno je červené", () => {
    expect(radek(null)).toMatchObject({ stav: "spatne", text: "Scénář: hra neposlala jméno scénáře, má být Diplomacie LLC v2.aoe2scenario" });
  });
  it("u scénáře se mapa nekontroluje", () => {
    const k = zkontrolujLobby(ucastnici, ocekavane, lobbySNastavenim({ rezim: 3, mapaId: 10901, scenar: "Diplomacie LLC v2.aoe2scenario" }));
    expect(k.find((r) => r.klic === "mapa")).toBeUndefined();
  });
  it("bez očekávaného scénáře řádek není", () => {
    const k = zkontrolujLobby(ucastnici, { ...VYCHOZI_NASTAVENI }, lobbySNastavenim({ scenar: "X.aoe2scenario" }));
    expect(k.find((r) => r.klic === "scenar")).toBeUndefined();
  });
});
```

`src/http/routes/kontrolaLobby.test.ts`:

```ts
it("prectiNastaveniLobby propustí platné jméno scénáře a seznam starších", () => {
  expect(prectiNastaveniLobby({ scenar: "A b.aoe2scenario", scenarStarsi: ["x.aoe2scenario"] })).toEqual({ scenar: "A b.aoe2scenario", scenarStarsi: ["x.aoe2scenario"] });
  expect(prectiNastaveniLobby({ scenar: null, rychlost: 2 })).toEqual({ scenar: null, rychlost: 2 });
});
it("prectiNastaveniLobby zahodí jméno s cestou nebo bez přípony", () => {
  expect(() => prectiNastaveniLobby({ scenar: "../x.aoe2scenario" })).toThrow();
  expect(() => prectiNastaveniLobby({ scenar: "x.txt" })).toThrow();
});
```

- [ ] **Step 3: Testy padají**

Run: `npx vitest run src/shared/lobbyKontrola.test.ts src/external/worldsEdgeLobby.test.ts src/http/routes/kontrolaLobby.test.ts`
Expected: FAIL (neznámé pole `scenar`).

- [ ] **Step 4: Implementace**

`src/shared/lobbyKontrola.ts` — do `NastaveniLobby` za `rezim`:

```ts
  /**
   * Soubor scénáře (options[38]) — kontroluje se jen při Game Mode Scenario.
   * Null = je to jedno. Hra posílá jen jméno, ne obsah (spec Diplomacie §2.2).
   */
  scenar: string | null;
  /** Jména starších verzí téhož scénáře; lobby s nimi dostane větu „starší verze“. */
  scenarStarsi: string[] | null;
```

Do `VYCHOZI_NASTAVENI`: `scenar: null, scenarStarsi: null,`. Do `NastaveniZeHry`: `scenar?: string | null;`. Pod `REZIMY` přidat:

```ts
/** Game Mode Scenario (options[5]); u něj mapa (options[10]) jen zbyla z předchozí volby. */
export const REZIM_SCENARIO = 3;

/** Jméno souboru scénáře, jak ho hra ukazuje: bez cesty, s příponou, rozumně dlouhé. */
export function jePlatneJmenoScenare(jmeno: string): boolean {
  return jmeno.length <= 100 && /\.aoe2scenario$/i.test(jmeno) && !/[\\/]/.test(jmeno) && jmeno.trim() === jmeno && jmeno.length > ".aoe2scenario".length;
}
```

V `zkontrolujLobby` nahradit blok mapy:

```ts
  const scenarovy = ocekavane.rezim === REZIM_SCENARIO;
  if (ocekavane.mapaId !== null && !scenarovy) {
    const ok = n.mapaId === ocekavane.mapaId;
    hlavni("mapa", ok, ok ? `Mapa: ${nazevMapy(n.mapaId)}` : `Mapa: ${nazevMapy(n.mapaId)}, má být ${nazevMapy(ocekavane.mapaId)}`);
  }
  if (scenarovy && ocekavane.scenar !== null) {
    const ma = ocekavane.scenar;
    const ve = n.scenar ?? null;
    let text: string;
    if (ve === ma) text = `Scénář: ${ma}`;
    else if (ve === null) text = `Scénář: hra neposlala jméno scénáře, má být ${ma}`;
    else if (ocekavane.scenarStarsi?.includes(ve)) text = `Scénář: v lobby je starší verze ${ve}, má být ${ma}`;
    else text = `Scénář: v lobby je ${ve}, má být ${ma}`;
    hlavni("scenar", ve === ma, text);
  }
```

`src/external/worldsEdgeLobby.ts` v `nastaveniZOptions` za `rezim`:

```ts
    // Jméno souboru scénáře; ověřeno naživo 1. 10. 2026 na 10 scénářových
    // lobby (spec Diplomacie §2.2). U ostatních režimů klíč chybí.
    scenar: o.get("38") ?? null,
```

`src/http/routes/kontrolaLobby.ts` v `prectiNastaveniLobby` před závěrečnou kontrolou prázdnoty (importovat `jePlatneJmenoScenare`):

```ts
  if (t["scenar"] === null) v.scenar = null;
  else if (typeof t["scenar"] === "string") {
    if (!jePlatneJmenoScenare(t["scenar"])) throw new HttpError(400, "Jméno scénáře musí být soubor .aoe2scenario bez cesty.");
    v.scenar = t["scenar"];
  }
  if (t["scenarStarsi"] === null) v.scenarStarsi = null;
  else if (Array.isArray(t["scenarStarsi"]) && t["scenarStarsi"].every((j) => typeof j === "string" && jePlatneJmenoScenare(j))) {
    v.scenarStarsi = t["scenarStarsi"] as string[];
  }
```

- [ ] **Step 5: Testy projdou, celá sada beze změny**

Run: `npm test && npm --prefix web test && npx tsc --noEmit`
Expected: PASS. (Frontendové testy NastaveniLobby mohou potřebovat doplnit `scenar: null, scenarStarsi: null` do ručně psaných objektů `NastaveniLobby` — doplnit, nic jiného neměnit.)

- [ ] **Step 6: Commit**

```bash
npm run verze -- minor     # 1.13.10-14.0
git add src/shared/lobbyKontrola.ts src/shared/lobbyKontrola.test.ts src/external/worldsEdgeLobby.ts src/external/worldsEdgeLobby.test.ts src/external/fixtures/worldsedge-scenar.json src/http/routes/kontrolaLobby.ts src/http/routes/kontrolaLobby.test.ts package.json src/shared/verze.ts
git commit -m "Check the scenario file in the lobby

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 3: Sloupec `akce.rezim` a přepínač Diplomacie

**Files:**
- Create: `database/030_rezim_akce.sql`
- Modify: `src/db/events.ts` (`AkceRow`, `AkceDbRow`, `SLOUPCE_AKCE`, `mapujAkci`, `createAkce`)
- Modify: `src/http/routes/events.ts:57-79` (`POST /api/akce`)
- Modify: `src/shared/types.ts` (`AkceView`), `src/realtime/akceStav.ts` (`buildAkceStav` → `rezim`)
- Modify: `web/src/api.ts` (`vytvoritAkce`), `web/src/views/SpravaAkce.tsx` (`ZalozeniAkce`, štítek), `web/src/App.tsx:650`
- Test: `src/http/routes/events.db.test.ts`, `web/src/views/SpravaAkce.test.tsx`

**Interfaces:**
- Produces: `type RezimId = "klasicky" | "diplomacie"` a `REZIMY_AKCE: readonly RezimId[]` v `src/shared/types.ts`; `AkceRow.rezim: RezimId`; `AkceView.rezim?: RezimId`; `createAkce(nazev: string, rezim?: RezimId): Promise<AkceRow>`; `api.vytvoritAkce(nazev: string, rezim?: RezimId)`; `SpravaAkce` prop `onZalozit: (nazev: string, rezim: RezimId) => void`.

- [ ] **Step 1: Migrace**

`database/030_rezim_akce.sql`:

```sql
-- Mód akce (spec Diplomacie §4.1 H1). Klasický večer je výchozí, takže
-- stávající akce se nemění. Nový mód = nová hodnota v CHECK.
ALTER TABLE akce ADD COLUMN rezim TEXT NOT NULL DEFAULT 'klasicky'
  CHECK (rezim IN ('klasicky', 'diplomacie'));
```

- [ ] **Step 2: Padající testy**

`src/http/routes/events.db.test.ts`:

```ts
it("admin založí akci Diplomacie a mód se objeví ve stavu", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();
  const res = await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "Diplo", rezim: "diplomacie" } });
  expect(res.statusCode).toBe(200);
  expect((await getAktivniAkce())?.rezim).toBe("diplomacie");
  const stav = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } });
  expect(stav.json().akce.rezim).toBe("diplomacie");
  await app.close();
});

it("bez módu je akce klasická a neznámý mód je 400", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();
  expect((await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "X", rezim: "turnaj" } })).statusCode).toBe(400);
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "Čtvrtek" } });
  expect((await getAktivniAkce())?.rezim).toBe("klasicky");
  await app.close();
});
```

`web/src/views/SpravaAkce.test.tsx`:

```ts
it("přepínač Diplomacie pošle mód s názvem", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce {...zaklad} akce={null} onZalozit={onZalozit} />);
  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "Diplo večer" } });
  fireEvent.click(screen.getByRole("switch", { name: "Diplomacie" }));
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));
  expect(onZalozit).toHaveBeenCalledWith("Diplo večer", "diplomacie");
});

it("bez přepínače je akce klasická", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce {...zaklad} akce={null} onZalozit={onZalozit} />);
  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "Čtvrtek" } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));
  expect(onZalozit).toHaveBeenCalledWith("Čtvrtek", "klasicky");
});

it("běžící akce Diplomacie má v záhlaví štítek", () => {
  render(<SpravaAkce {...zaklad} akce={{ id: 1, nazev: "D", stav: "bezi", rezim: "diplomacie" }} />);
  expect(screen.getByText("Diplomacie", { selector: ".stitek-rezimu" })).toBeTruthy();
});
```

Upravit první dva existující testy: `toHaveBeenCalledWith("Čtvrtek")` → `toHaveBeenCalledWith("Čtvrtek", "klasicky")`.

- [ ] **Step 3: Testy padají**

Run: `npm --prefix web test -- SpravaAkce` → FAIL. DB testy se ověří v kroku 6.

- [ ] **Step 4: Implementace backendu**

`src/shared/types.ts` (nahoře u typů):

```ts
/** Mód akce (migrace 030). Klasický večer, nebo scénář Diplomacie. */
export type RezimId = "klasicky" | "diplomacie";
export const REZIMY_AKCE: readonly RezimId[] = ["klasicky", "diplomacie"];
```

Do `AkceView`: `/** Mód akce; chybí ve starších snímcích = klasický. */ rezim?: RezimId;`

`src/db/events.ts`: do `AkceRow` `rezim: RezimId;`, do `AkceDbRow` `rezim: RezimId;`, `SLOUPCE_AKCE` doplnit `, rezim`, `mapujAkci` `rezim: r.rezim,`, a:

```ts
export async function createAkce(nazev: string, rezim: RezimId = "klasicky"): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `INSERT INTO akce (nazev, pristi_heslo, rezim) VALUES ($1, $2, $3) RETURNING ${SLOUPCE_AKCE}`,
    [nazev, generatePassword(), rezim],
  );
  return mapujAkci(rows[0]!);
}
```

(Ponechat původní komentář o hesle.) `src/http/routes/events.ts` v `POST /api/akce`:

```ts
    const { nazev, rezim } = request.body as { nazev?: unknown; rezim?: unknown };
    if (typeof nazev !== "string" || nazev.trim() === "") {
      throw new HttpError(400, "Akce musí mít název.");
    }
    if (rezim !== undefined && !REZIMY_AKCE.includes(rezim as RezimId)) {
      throw new HttpError(400, "Neznámý mód akce.");
    }
    try {
      const akce = await createAkce(nazev.trim(), (rezim as RezimId | undefined) ?? "klasicky");
```

`src/realtime/akceStav.ts` v objektu `akce` přidat `rezim: akce.rezim,`.

- [ ] **Step 5: Implementace frontendu**

`web/src/api.ts`:

```ts
  vytvoritAkce: (nazev: string, rezim: RezimId = "klasicky") =>
    fetch(cesta("/api/akce"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ nazev, rezim }),
    }).then((r) => json<{ akce: { id: number } }>(r)),
```

`web/src/views/SpravaAkce.tsx`: `onZalozit: (nazev: string, rezim: RezimId) => void;` a `ZalozeniAkce`:

```tsx
function ZalozeniAkce({ onZalozit }: Pick<Props, "onZalozit">) {
  const [nazev, setNazev] = useState("");
  // Mód se volí jen při založení: Diplomacie mění výchozí nastavení lobby
  // a pravidla sestavy, přepínat ji uprostřed večera nedává smysl.
  const [diplomacie, setDiplomacie] = useState(false);

  return (
    <form
      className="zalozeni-akce"
      onSubmit={(e) => {
        e.preventDefault();
        if (nazev.trim() === "") return;
        onZalozit(nazev.trim(), diplomacie ? "diplomacie" : "klasicky");
        setNazev("");
      }}
    >
      <Prepinac popisek="Diplomacie" vlevo="" vpravo="Diplomacie" zapnuto={diplomacie} onZmena={setDiplomacie} testId="prepinac-diplomacie" />
      <label>
        Název akce{" "}
        <input value={nazev} onChange={(e) => setNazev(e.target.value)} placeholder="Komunitní čtvrtek" />
      </label>
      <button type="submit" disabled={nazev.trim() === ""}>
        Založit akci
      </button>
    </form>
  );
}
```

V záhlaví běžící akce za `<h2>Nastavení Lobby</h2>`:

```tsx
        {akce.rezim === "diplomacie" ? <span className="stitek-rezimu">Diplomacie</span> : null}
```

CSS (soubor se styly panelu akce, vedle `.hlavicka-akce`): `.stitek-rezimu` jako malý štítek s rámečkem v barvě `var(--zlata)` (název proměnné vzít z palety `:root`, žádná barva napevno). Přepínač vlevo od „Název akce“ (podle šipky uživatele v obrázku #1): `.zalozeni-akce { display: flex; gap: …; align-items: center; }` s mezerou ze stávajících proměnných.

`web/src/App.tsx:650`: `onZalozit={(nazev, rezim) => void hlidej(() => api.vytvoritAkce(nazev, rezim))}`.

- [ ] **Step 6: Testy a build**

Run: `npm test && npm --prefix web test && npx tsc --noEmit && npm run build; echo EXIT=$?`
Expected: PASS, `EXIT=0`. Pak push a `ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo` → všechny DB testy PASS.

- [ ] **Step 7: Commit**

```bash
npm run verze -- minor    # 1.13.10-15.0
git add database/030_rezim_akce.sql src/db/events.ts src/http/routes/events.ts src/http/routes/events.db.test.ts src/shared/types.ts src/realtime/akceStav.ts web/src/api.ts web/src/views/SpravaAkce.tsx web/src/views/SpravaAkce.test.tsx web/src/App.tsx web/src/*.css package.json src/shared/verze.ts
git commit -m "Let an event be created in Diplomacy mode

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

(Přesný CSS soubor zjistit `grep -rl "hlavicka-akce" web/src` a přidat jen ten.)

---

## Úkol 4: Čistá pravidla Diplomacie (role, los, rozbor, sestava)

**Files:**
- Create: `src/shared/diplomacie/typy.ts`, `role.ts`, `los.ts`, `scenar.ts`, `sestava.ts`
- Test: `src/shared/diplomacie/los.test.ts`, `scenar.test.ts`, `sestava.test.ts`, `role.test.ts`

**Interfaces:**
- Produces (všechno exportované):
  - `typy.ts`: `Role`, `ROLE_LOSOVANE`, `StavDiplo`, `RoleHrace`, `DiploZapas`, `ScenarVerze`, `DiploData`
  - `role.ts`: `NAZEV_ROLE: Record<Role, string>`, `POPIS_ROLE: Record<Role, PopisRole>`, `interface PopisRole { cil: string; vyhody: string[]; nevyhody: string[] }`
  - `los.ts`: `losujRole(hraci: string[], nastupce: string, nahoda?: (n: number) => number): RoleHrace[]`, `povoleneCile(hraci: string[], kdo: string, nastupce: string): string[]`, `zmenRoli(role: RoleHrace[], hracId: string, nova: Role, nastupce: string, nahoda?: (n: number) => number): RoleHrace[]`, `zmenCil(role: RoleHrace[], hracId: string, cil: string, nastupce: string): RoleHrace[]`, `odchylkySlozeni(role: RoleHrace[]): string[]`, `textPrehledu(role: RoleHrace[], jmeno: (hracId: string) => string): string`
  - `scenar.ts`: `interface RozborScenare`, `prectiRozbor(json: unknown): RozborScenare` (vyhazuje `Error` s větou)
  - `sestava.ts`: `zkontrolujSestavuDiplomacie(sestava: SestavaVstup[]): string | null`, `GM_BARVA: Barva` (= 7)

- [ ] **Step 1: Typy**

`src/shared/diplomacie/typy.ts`:

```ts
import type { RozborScenare } from "./scenar.js";

/** Role hráče (spec §6.1). Nástupce se nelosuje — určí ho hra a odklikne GM. */
export type Role = "nastupce" | "garda" | "najezdnik" | "sasek" | "zoldak" | "kat";

/** Šest rolí, které web rozdá mezi hráče kromě Nástupce: 1+1+2+1+1. */
export const ROLE_LOSOVANE: readonly Role[] = ["sasek", "garda", "najezdnik", "najezdnik", "zoldak", "kat"];

export type StavDiplo = "priprava" | "losovano" | "rozeslano";

export interface RoleHrace {
  hracId: string;
  role: Role;
  /** Oběť Kata nebo pakt Žoldáka; jinak null. */
  cilHracId: string | null;
  upravenoPoRozeslani: boolean;
}

/** Diplomacie jednoho zápasu, jak ji vidí GM (nic nezaslepeno). */
export interface DiploZapas {
  zapasId: number;
  gmHracId: string;
  stav: StavDiplo;
  nastupceHracId: string | null;
  scenarId: number | null;
  role: RoleHrace[];
}

/** Verze scénáře bez souboru a minimapy (ty jdou zvlášť adresou). */
export interface ScenarVerze {
  id: number;
  jmenoSouboru: string;
  nahrano: string;
  nahralJmeno: string;
  poznamka: string | null;
  aktivni: boolean;
  rozbor: RozborScenare | null;
  chybaRozboru: string | null;
}

/**
 * Větev `rezim.data` stavu pro prohlížeče u akce Diplomacie. Redakce
 * (viditelnost.ts) z ní pro každého diváka vyrobí jeho pohled.
 */
export interface DiploData {
  /** Aktivní verze scénáře; null = zatím nic nenahráno. */
  aktivni: ScenarVerze | null;
  /** Verze, které hrají zápasy akce (podle id); kvůli pravidlům otisknuté verze. */
  verze: Record<number, ScenarVerze>;
  zapasy: DiploZapas[];
}
```

- [ ] **Step 2: Texty rolí**

`src/shared/diplomacie/role.ts` — texty přepsané z `Diplo scénář.docx` (spec §1, podklady). Čísla cílů tu nejsou (berou se z rozboru):

```ts
import type { Role } from "./typy.js";

export const NAZEV_ROLE: Record<Role, string> = {
  nastupce: "Nástupce císaře",
  garda: "Královská Garda",
  najezdnik: "Nájezdník",
  sasek: "Šašek",
  zoldak: "Žoldák",
  kat: "Kat",
};

export interface PopisRole {
  cil: string;
  vyhody: string[];
  nevyhody: string[];
}

/** Z pravidel hry (Jin, „Diplomacie – Ať žije císař“). Měnit jen spolu s pravidly. */
export const POPIS_ROLE: Record<Role, PopisRole> = {
  nastupce: {
    cil: "Získat 7 relikvií a ubránit je po dobu 15 minut.",
    vyhody: ["Je veřejně znám od začátku hry.", "Začíná s +2 relikviemi.", "Nelze na něj uvalit sankci z Rady králů."],
    nevyhody: [
      "Nemůže svolávat rady.",
      "Může vyhrát pouze skrze relikvie.",
      "Pokud zemře Šašek, musí prodat 1 relikvii (neplatí, pokud už běží 15minutový win timer se 7 relikviemi).",
    ],
  },
  garda: {
    cil: "Vyhrává jen, když Nástupce císaře nezemře. Může vyhrát i splněním primárního či sekundárního cíle, pokud Nástupce stále žije. Když Nástupce vyhraje, vyhrává Garda také.",
    vyhody: ["Jakmile jakýkoli hráč zemře nebo rezignuje, dozví se od GM jeho přesnou roli."],
    nevyhody: ["Pokud Nástupce zemře, Garda automaticky prohrává a rezignuje."],
  },
  najezdnik: {
    cil: "Vyhrát lze jen tehdy, je-li Nástupce císaře poražen. Plní primární i sekundární cíle. Když vyhraje jeden Nájezdník, druhý vyhrává také (i když už byl vyřazen).",
    vyhody: ["Nájezdníci se znají od začátku hry.", "Mohou uvalit ekonomickou sankci na kteréhokoli hráče (1× za hru na každého, stojí 2000 zlata zaplacené GM)."],
    nevyhody: [],
  },
  sasek: {
    cil: "Splnit primární nebo sekundární cíl. Vyhrává sám za sebe bez ohledu na aliance.",
    vyhody: ["Začíná s 1 relikvií přidělenou GM.", "Až 3× za hru může od GM vyžádat pravdivou tajnou informaci (např. roli konkrétního hráče nebo počet relikvií)."],
    nevyhody: [
      "Pokud zemře Nástupce, musí prodat všechny své relikvie (neplatí při běžícím win timeru).",
      "Pokud zemře Královská Garda, tajně se stává novou Gardou (ztrácí výhody Šaška).",
    ],
  },
  zoldak: {
    cil: "Splnit primární či sekundární cíl, nebo vyhrát skrze pokrevní pouto: když zvolený hráč vyhraje nebo prohraje, Žoldák vyhrává nebo prohrává s ním. Když sám splní cíl, vyhrává samostatně.",
    vyhody: ["Při prodeji relikvie získá dvojnásobek zlata (8000; doplňuje GM)."],
    nevyhody: [],
  },
  kat: {
    cil: "Splnit primární či sekundární cíl a vykonat popravu: dokud určený hráč nezemře (kýmkoli), Kat nemůže vyhrát.",
    vyhody: ["Dostává 2000 zlata za každého hráče, který rezignuje nebo prohraje."],
    nevyhody: [],
  },
};
```

`role.test.ts`:

```ts
import { expect, it } from "vitest";
import { NAZEV_ROLE, POPIS_ROLE } from "./role.js";

it("každá role má název a cíl", () => {
  for (const role of Object.keys(NAZEV_ROLE) as (keyof typeof NAZEV_ROLE)[]) {
    expect(NAZEV_ROLE[role].length).toBeGreaterThan(0);
    expect(POPIS_ROLE[role].cil.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 3: Padající testy losu**

`src/shared/diplomacie/los.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { losujRole, odchylkySlozeni, povoleneCile, textPrehledu, zmenCil, zmenRoli } from "./los.js";

const HRACI = ["a", "b", "c", "d", "e", "f", "g"];

function slozeni(role: ReturnType<typeof losujRole>) {
  return role.map((r) => r.role).sort();
}

describe("losujRole", () => {
  it("Nástupce zůstává a zbytek dostane 1+1+2+1+1", () => {
    const role = losujRole(HRACI, "c");
    expect(role).toHaveLength(7);
    expect(role.find((r) => r.hracId === "c")?.role).toBe("nastupce");
    expect(slozeni(role)).toEqual(["garda", "kat", "najezdnik", "najezdnik", "nastupce", "sasek", "zoldak"]);
  });

  it("Kat ani Žoldák nemají za cíl sebe ani Nástupce", () => {
    for (let i = 0; i < 500; i++) {
      for (const r of losujRole(HRACI, "a")) {
        if (r.role === "kat" || r.role === "zoldak") {
          expect(r.cilHracId).not.toBeNull();
          expect(r.cilHracId).not.toBe(r.hracId);
          expect(r.cilHracId).not.toBe("a");
        } else {
          expect(r.cilHracId).toBeNull();
        }
      }
    }
  });

  it("každá role se časem dostane ke každému hráči", () => {
    const videno = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const r of losujRole(HRACI, "a")) videno.add(`${r.hracId}:${r.role}`);
    for (const h of HRACI.filter((h) => h !== "a")) {
      for (const role of ["garda", "kat", "najezdnik", "sasek", "zoldak"]) expect(videno.has(`${h}:${role}`)).toBe(true);
    }
  });

  it("deterministická náhoda dá deterministický výsledek", () => {
    const nula = () => 0;
    expect(losujRole(HRACI, "a", nula)).toEqual(losujRole(HRACI, "a", nula));
  });

  it("Nástupce musí být mezi hráči a hráčů musí být 7", () => {
    expect(() => losujRole(HRACI, "x")).toThrow("Nástupce není mezi hráči.");
    expect(() => losujRole(HRACI.slice(0, 6), "a")).toThrow("Diplomacie potřebuje 7 hráčů (bez GM).");
  });
});

describe("úpravy GM (chování Jinova nástroje)", () => {
  const nula = () => 0;
  const zaklad = losujRole(HRACI, "a", nula);
  const kdo = (role: string) => zaklad.find((r) => r.role === role)!.hracId;

  it("povolené cíle jsou všichni kromě sebe a Nástupce", () => {
    expect(povoleneCile(HRACI, "b", "a")).toEqual(["c", "d", "e", "f", "g"]);
  });

  it("změna na Kata přidělí platný cíl, změna jinam cíl smaže", () => {
    const sasek = kdo("sasek");
    const naKata = zmenRoli(zaklad, sasek, "kat", "a", nula);
    const r = naKata.find((x) => x.hracId === sasek)!;
    expect(r.role).toBe("kat");
    expect(r.cilHracId).not.toBeNull();
    expect([sasek, "a"]).not.toContain(r.cilHracId);
    const zpet = zmenRoli(naKata, sasek, "sasek", "a", nula);
    expect(zpet.find((x) => x.hracId === sasek)!.cilHracId).toBeNull();
  });

  it("platný starý cíl se při změně Kat → Žoldák zachová", () => {
    const kat = kdo("kat");
    const cil = zaklad.find((r) => r.hracId === kat)!.cilHracId;
    expect(zmenRoli(zaklad, kat, "zoldak", "a", nula).find((x) => x.hracId === kat)!.cilHracId).toBe(cil);
  });

  it("Nástupci roli změnit nejde a nepovolený cíl se odmítne", () => {
    expect(() => zmenRoli(zaklad, "a", "kat", "a")).toThrow("Nástupce se mění výběrem Nástupce, ne rolí.");
    expect(() => zmenCil(zaklad, kdo("kat"), "a", "a")).toThrow("Tenhle cíl není povolený.");
    expect(() => zmenCil(zaklad, kdo("sasek"), "c", "a")).toThrow("Cíl má jen Kat a Žoldák.");
  });

  it("odchylky složení", () => {
    expect(odchylkySlozeni(zaklad)).toEqual([]);
    const triNajezdnici = zmenRoli(zaklad, kdo("kat"), "najezdnik", "a", nula);
    expect(odchylkySlozeni(triNajezdnici)).toEqual(["3× Nájezdník (má být 2×)", "chybí Kat"]);
  });

  it("textový přehled jako Jinův nástroj", () => {
    const text = textPrehledu(zaklad, (id) => id.toUpperCase());
    expect(text).toMatch(/^Rozdělení rolí:\n----------------\nA: Nástupce císaře\n/);
    expect(text).toMatch(/Skryté cíle pro GM:\n----------------\n/);
    expect(text).toMatch(/Kat \(.\) -> Popravit: .\n/);
    expect(text).toMatch(/Žoldák \(.\) -> Pakt s: .\n/);
  });
});
```

- [ ] **Step 4: Testy padají**

Run: `npx vitest run src/shared/diplomacie`
Expected: FAIL (moduly neexistují).

- [ ] **Step 5: Implementace losu**

`src/shared/diplomacie/los.ts`:

```ts
import { NAZEV_ROLE } from "./role.js";
import { ROLE_LOSOVANE, type Role, type RoleHrace } from "./typy.js";

/**
 * Náhoda 0 ≤ x < n. Ve sdíleném kódu bez `node:crypto` (běží i v prohlížeči);
 * server předává `randomInt` z `node:crypto`, testy deterministickou funkci.
 */
export type Nahoda = (n: number) => number;
const vychoziNahoda: Nahoda = (n) => Math.floor(Math.random() * n);

const POCET_HRACU = 7;
const S_CILEM: ReadonlySet<Role> = new Set(["kat", "zoldak"]);

export function povoleneCile(hraci: string[], kdo: string, nastupce: string): string[] {
  return hraci.filter((h) => h !== kdo && h !== nastupce);
}

function nahodnyCil(hraci: string[], kdo: string, nastupce: string, nahoda: Nahoda): string {
  const moznosti = povoleneCile(hraci, kdo, nastupce);
  return moznosti[nahoda(moznosti.length)]!;
}

/** Fisher–Yates; jako v Jinově nástroji, jen s volitelnou náhodou. */
function zamichej<T>(pole: readonly T[], nahoda: Nahoda): T[] {
  const p = [...pole];
  for (let i = p.length - 1; i > 0; i--) {
    const j = nahoda(i + 1);
    [p[i], p[j]] = [p[j]!, p[i]!];
  }
  return p;
}

export function losujRole(hraci: string[], nastupce: string, nahoda: Nahoda = vychoziNahoda): RoleHrace[] {
  if (hraci.length !== POCET_HRACU) throw new Error("Diplomacie potřebuje 7 hráčů (bez GM).");
  if (!hraci.includes(nastupce)) throw new Error("Nástupce není mezi hráči.");
  const role = zamichej(ROLE_LOSOVANE, nahoda);
  let i = 0;
  return hraci.map((hracId) => {
    const r: Role = hracId === nastupce ? "nastupce" : role[i++]!;
    return { hracId, role: r, cilHracId: S_CILEM.has(r) ? nahodnyCil(hraci, hracId, nastupce, nahoda) : null, upravenoPoRozeslani: false };
  });
}

/** GM změní roli: Kat/Žoldák dostane platný cíl (starý platný zůstává), ostatní cíl ztratí. */
export function zmenRoli(role: RoleHrace[], hracId: string, nova: Role, nastupce: string, nahoda: Nahoda = vychoziNahoda): RoleHrace[] {
  if (hracId === nastupce || nova === "nastupce") throw new Error("Nástupce se mění výběrem Nástupce, ne rolí.");
  const hraci = role.map((r) => r.hracId);
  return role.map((r) => {
    if (r.hracId !== hracId) return r;
    if (!S_CILEM.has(nova)) return { ...r, role: nova, cilHracId: null };
    const platny = r.cilHracId !== null && povoleneCile(hraci, hracId, nastupce).includes(r.cilHracId);
    return { ...r, role: nova, cilHracId: platny ? r.cilHracId : nahodnyCil(hraci, hracId, nastupce, nahoda) };
  });
}

export function zmenCil(role: RoleHrace[], hracId: string, cil: string, nastupce: string): RoleHrace[] {
  const hraci = role.map((r) => r.hracId);
  return role.map((r) => {
    if (r.hracId !== hracId) return r;
    if (!S_CILEM.has(r.role)) throw new Error("Cíl má jen Kat a Žoldák.");
    if (!povoleneCile(hraci, hracId, nastupce).includes(cil)) throw new Error("Tenhle cíl není povolený.");
    return { ...r, cilHracId: cil };
  });
}

/** Odchylky od 1+1+2+1+1+1 jako věty pro GM; prázdné = v pořádku. Neblokuje (spec §6.2). */
export function odchylkySlozeni(role: RoleHrace[]): string[] {
  const ocekavane: Record<Role, number> = { nastupce: 1, garda: 1, najezdnik: 2, sasek: 1, zoldak: 1, kat: 1 };
  const pocty = new Map<Role, number>();
  for (const r of role) pocty.set(r.role, (pocty.get(r.role) ?? 0) + 1);
  const vety: string[] = [];
  for (const [r, ma] of Object.entries(ocekavane) as [Role, number][]) {
    const je = pocty.get(r) ?? 0;
    if (je === 0) vety.push(`chybí ${NAZEV_ROLE[r]}`);
    else if (je !== ma) vety.push(`${je}× ${NAZEV_ROLE[r]} (má být ${ma}×)`);
  }
  // Nadbytečné se hlásí před chybějícími — GM hledá, koho přeřadit.
  return vety.sort((a, b) => Number(a.startsWith("chybí")) - Number(b.startsWith("chybí")));
}

/** Text pro schránku ve formátu Jinova nástroje (`getFullText`). */
export function textPrehledu(role: RoleHrace[], jmeno: (hracId: string) => string): string {
  let text = "Rozdělení rolí:\n----------------\n";
  for (const r of role) text += `${jmeno(r.hracId)}: ${NAZEV_ROLE[r.role]}\n`;
  const sCilem = role.filter((r) => r.cilHracId !== null);
  if (sCilem.length > 0) {
    text += "\nSkryté cíle pro GM:\n----------------\n";
    for (const r of sCilem) {
      if (r.role === "kat") text += `Kat (${jmeno(r.hracId)}) -> Popravit: ${jmeno(r.cilHracId!)}\n`;
      if (r.role === "zoldak") text += `Žoldák (${jmeno(r.hracId)}) -> Pakt s: ${jmeno(r.cilHracId!)}\n`;
    }
  }
  return text;
}
```

(Pořadí v `odchylkySlozeni`: test čeká `["3× Nájezdník (má být 2×)", "chybí Kat"]` — sort to splní.)

- [ ] **Step 6: Rozbor — typ a čtení**

`src/shared/diplomacie/scenar.ts`:

```ts
import { BARVY, type Barva } from "../types.js";

/** Co rozbor scénáře (src/diplomacie/rozbor.py) vrací; spec §5.2. */
export interface RozborScenare {
  velikostMapy: number;
  sloty: { cislo: number; barva: Barva; jmeno: string; jeGm: boolean }[];
  /** Sekundární cíle: text z hlášky „TVUJ SEKUNDARNI CIL JE“ a číslo z podmínky triggeru. */
  cile: { text: string; pocet: number }[];
  suroviny: { jidlo: number; drevo: number; zlato: number; kamen: number; populace: number };
  limity: { vesnicane: number | null; rybarskeLode: number | null; obchodniVozy: number | null };
  /** Startovní pozice v souřadnicích obrázku minimapy (0–1 zleva a shora). */
  starty: { barva: Barva; x: number; y: number }[];
  minimapa: { sirka: number; vyska: number };
  varovani: string[];
}

const cislo = (v: unknown, kde: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Rozbor: ${kde} není číslo.`);
  return v;
};
const cisloNeboNull = (v: unknown, kde: string): number | null => (v === null ? null : cislo(v, kde));
const text = (v: unknown, kde: string): string => {
  if (typeof v !== "string") throw new Error(`Rozbor: ${kde} není text.`);
  return v;
};
const barva = (v: unknown, kde: string): Barva => {
  if (!BARVY.includes(v as Barva)) throw new Error(`Rozbor: ${kde} není barva 1–8.`);
  return v as Barva;
};
const pole = (v: unknown, kde: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`Rozbor: ${kde} není seznam.`);
  return v;
};
const objekt = (v: unknown, kde: string): Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`Rozbor: ${kde} chybí.`);
  return v as Record<string, unknown>;
};

/** Ověří tvar výstupu rozboru. Do databáze ani ke klientovi nesmí nic jiného. */
export function prectiRozbor(json: unknown): RozborScenare {
  const o = objekt(json, "výsledek");
  const s = objekt(o["suroviny"], "suroviny");
  const l = objekt(o["limity"], "limity");
  const m = objekt(o["minimapa"], "minimapa");
  const rozbor: RozborScenare = {
    velikostMapy: cislo(o["velikostMapy"], "velikostMapy"),
    sloty: pole(o["sloty"], "sloty").map((x, i) => {
      const r = objekt(x, `slot ${i}`);
      return { cislo: cislo(r["cislo"], "slot.cislo"), barva: barva(r["barva"], "slot.barva"), jmeno: text(r["jmeno"], "slot.jmeno"), jeGm: r["jeGm"] === true };
    }),
    cile: pole(o["cile"], "cile").map((x, i) => {
      const r = objekt(x, `cíl ${i}`);
      return { text: text(r["text"], "cíl.text"), pocet: cislo(r["pocet"], "cíl.pocet") };
    }),
    suroviny: {
      jidlo: cislo(s["jidlo"], "suroviny.jidlo"),
      drevo: cislo(s["drevo"], "suroviny.drevo"),
      zlato: cislo(s["zlato"], "suroviny.zlato"),
      kamen: cislo(s["kamen"], "suroviny.kamen"),
      populace: cislo(s["populace"], "suroviny.populace"),
    },
    limity: {
      vesnicane: cisloNeboNull(l["vesnicane"], "limity.vesnicane"),
      rybarskeLode: cisloNeboNull(l["rybarskeLode"], "limity.rybarskeLode"),
      obchodniVozy: cisloNeboNull(l["obchodniVozy"], "limity.obchodniVozy"),
    },
    starty: pole(o["starty"], "starty").map((x, i) => {
      const r = objekt(x, `start ${i}`);
      return { barva: barva(r["barva"], "start.barva"), x: cislo(r["x"], "start.x"), y: cislo(r["y"], "start.y") };
    }),
    minimapa: { sirka: cislo(m["sirka"], "minimapa.sirka"), vyska: cislo(m["vyska"], "minimapa.vyska") },
    varovani: pole(o["varovani"], "varovani").map((x) => text(x, "varování")),
  };
  if (rozbor.sloty.filter((x) => x.jeGm).length !== 1) throw new Error("Rozbor: scénář nemá právě jednoho GM.");
  return rozbor;
}
```

`scenar.test.ts` (fixtura `ROZBOR` = platný objekt podle typu: 8 slotů barev 1–8, slot 7 `jeGm: true`, 6 cílů, suroviny 2000/2000/2000/1000/200, limity 30/5/5, 7 startů, minimapa 440×440, varování `[]`):

```ts
import { expect, it } from "vitest";
import { prectiRozbor } from "./scenar.js";

const ROZBOR = {
  velikostMapy: 220,
  sloty: [1, 2, 3, 4, 5, 6, 7, 8].map((c) => ({ cislo: c, barva: c, jmeno: c === 7 ? "GM" : "", jeGm: c === 7 })),
  cile: [
    { text: "zabij 650 nepratelskych jednotek", pocet: 650 },
    { text: "zbourej 150 nepratelskych budov", pocet: 150 },
    { text: "v bitve musis ztratit 900 jednotek", pocet: 900 },
    { text: "postav celkem 15 hradu", pocet: 15 },
    { text: "prodej 5 relikvie", pocet: 5 },
    { text: "zkonvertuj 99 nepratelskych jednotek", pocet: 99 },
  ],
  suroviny: { jidlo: 2000, drevo: 2000, zlato: 2000, kamen: 1000, populace: 200 },
  limity: { vesnicane: 30, rybarskeLode: 5, obchodniVozy: 5 },
  starty: [1, 2, 3, 4, 5, 6, 8].map((b) => ({ barva: b, x: 0.5, y: 0.5 })),
  minimapa: { sirka: 440, vyska: 440 },
  varovani: [],
};

it("platný rozbor projde beze změny", () => {
  expect(prectiRozbor(ROZBOR)).toEqual(ROZBOR);
});
it("chybějící nebo špatně typované pole se odmítne", () => {
  expect(() => prectiRozbor({ ...ROZBOR, cile: "x" })).toThrow("Rozbor: cile není seznam.");
  expect(() => prectiRozbor({ ...ROZBOR, suroviny: { ...ROZBOR.suroviny, zlato: "2000" } })).toThrow("suroviny.zlato");
  expect(() => prectiRozbor({ ...ROZBOR, starty: [{ barva: 9, x: 0, y: 0 }] })).toThrow("barva 1–8");
  expect(() => prectiRozbor(null)).toThrow("výsledek chybí");
});
it("scénář musí mít právě jednoho GM", () => {
  expect(() => prectiRozbor({ ...ROZBOR, sloty: ROZBOR.sloty.map((s) => ({ ...s, jeGm: false })) })).toThrow("právě jednoho GM");
});
```

Fixturu `ROZBOR` exportovat z `src/shared/diplomacie/fixtures.ts` (nový soubor, jen data), ať ji sdílejí testy úkolů 6, 8, 12 a 13 — test výš ji pak importuje místo lokální konstanty.

- [ ] **Step 7: Pravidla sestavy**

`src/shared/diplomacie/sestava.ts`:

```ts
import { jeAi } from "../aiHraci.js";
import type { Barva, SestavaVstup } from "../types.js";

/** Šedá — ve scénáři hráč 7 jménem „GM“ (spec §2.1). */
export const GM_BARVA: Barva = 7;

/** Pravidla sestavy Diplomacie navíc k jádru (spec §6.1 krok 2). Věta, nebo null. */
export function zkontrolujSestavuDiplomacie(sestava: SestavaVstup[]): string | null {
  if (sestava.some((s) => jeAi(s.hracId))) return "Diplomacie se hraje bez počítačů.";
  if (sestava.length !== 8) return "Diplomacie potřebuje 7 hráčů a GM — v sestavě musí být přesně 8 lidí.";
  if (new Set(sestava.map((s) => s.barva)).size !== 8) return "Každý musí mít jinou barvu.";
  if (!sestava.some((s) => s.barva === GM_BARVA)) return "Na šedé musí být GM.";
  if (sestava.some((s) => s.tym !== 0)) return "V Diplomacii hraje každý sám za sebe — všichni bez týmu (–).";
  if (sestava.some((s) => s.civ !== undefined && s.civ !== null)) return "Civilizace určuje scénář — nepředepisuj je.";
  return null;
}
```

`sestava.test.ts`:

```ts
import { expect, it } from "vitest";
import { zkontrolujSestavuDiplomacie } from "./sestava.js";
import type { Barva, SestavaVstup } from "../types.js";

const osm = (): SestavaVstup[] => ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva, tym: 0, civ: null }));

it("8 lidí, různé barvy, bez týmů a civilizací projde", () => {
  expect(zkontrolujSestavuDiplomacie(osm())).toBeNull();
});
it("sedm lidí neprojde", () => {
  expect(zkontrolujSestavuDiplomacie(osm().slice(0, 7))).toMatch(/přesně 8/);
});
it("dvě stejné barvy neprojdou", () => {
  const s = osm();
  s[0] = { ...s[0]!, barva: 2 };
  expect(zkontrolujSestavuDiplomacie(s)).toBe("Každý musí mít jinou barvu.");
});
it("tým nebo civilizace neprojdou", () => {
  expect(zkontrolujSestavuDiplomacie(osm().map((s, i) => (i === 0 ? { ...s, tym: 1 } : s)))).toMatch(/bez týmu/);
  expect(zkontrolujSestavuDiplomacie(osm().map((s, i) => (i === 0 ? { ...s, civ: 1 } : s)))).toMatch(/nepředepisuj/);
});
```

(Šedá je mezi osmi různými barvami vždy — větu „Na šedé musí být GM“ hlídá pořadí podmínek pro budoucí změnu počtu; test na ni proto není potřeba.)

- [ ] **Step 8: Testy projdou**

Run: `npx vitest run src/shared/diplomacie && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
npm run verze      # 1.13.10-15.1
git add src/shared/diplomacie package.json src/shared/verze.ts
git commit -m "Add the Diplomacy rules: roles, draw, lineup and parse result shape

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 5: Rozbor scénáře (Python v kontejneru)

**Files:**
- Create: `nastroje/diplomacie/barvy_terenu.py`, `src/diplomacie/barvy_terenu.json`
- Create: `src/diplomacie/rozbor.py`, `src/diplomacie/requirements.txt`, `src/diplomacie/rozbor.ts`
- Create: `src/diplomacie/fixtures/LLC.aoe2scenario` (kopie `C:\Users\mjouk\Downloads\LLC.aoe2scenario_output.aoe2scenario`)
- Modify: `src/config.ts` (`python`), `scripts/copy-migrations.ts` (kopie souborů rozboru), `Dockerfile` (stupeň runner)
- Test: `src/diplomacie/rozbor.test.ts`

**Interfaces:**
- Consumes: `prectiRozbor`, `RozborScenare` (úkol 4).
- Produces: `rozeberScenar(soubor: Buffer, volby?: { python?: string; limitMs?: number }): Promise<{ ok: true; rozbor: RozborScenare; minimapa: Buffer } | { ok: false; chyba: string }>`; `jeHlavickaScenare(soubor: Buffer): boolean`; `config.python: string`.

- [ ] **Step 1: Barvy terénů z dat hry (jednorázově, na stroji s hrou)**

`nastroje/diplomacie/barvy_terenu.py`:

```python
# -*- coding: utf-8 -*-
"""Barvy minimapy podle terénu z dat hry → src/diplomacie/barvy_terenu.json.

Spouští vývojář na stroji s nainstalovanou hrou (kontejner hru nemá).
Každý terén v empires2_x2_p1.dat má `colors` = tři indexy do palety
original.pal; první dává barvu minimapy (ověřeno 1. 10. 2026, spec §2.4).

  pip install genieutils-py==0.1.2
  python nastroje/diplomacie/barvy_terenu.py
"""
import json
from pathlib import Path

from genieutils.datfile import DatFile

HRA = Path(r"C:/Program Files (x86)/Steam/steamapps/common/AoE2DE/resources/_common")
VYSTUP = Path(__file__).resolve().parents[2] / "src/diplomacie/barvy_terenu.json"


def paleta(cesta: Path) -> list[tuple[int, int, int]]:
    radky = cesta.read_text(encoding="ascii").split("\n")
    assert radky[0].strip() == "JASC-PAL", "original.pal není JASC paleta"
    return [tuple(int(c) for c in r.split()) for r in radky[3:] if len(r.split()) == 3]


def main() -> None:
    pal = paleta(HRA / "palettes/original.pal")
    dat = DatFile.parse(str(HRA / "dat/empires2_x2_p1.dat"))
    barvy = {}
    for i, t in enumerate(dat.terrain_block.terrains):
        if not t.name:
            continue
        r, g, b = pal[t.colors[0]]
        barvy[str(i)] = [r, g, b]
    VYSTUP.write_text(json.dumps(barvy, indent=0, sort_keys=True), encoding="utf-8")
    print(f"zapsáno {len(barvy)} terénů do {VYSTUP}")


if __name__ == "__main__":
    main()
```

Run: `pip install genieutils-py==0.1.2 && python nastroje/diplomacie/barvy_terenu.py`
Expected: `zapsáno … terénů`; v JSON `"0": [0, 169, 0]`, `"58": [0, 84, 176]`.

- [ ] **Step 2: Závislosti a fixtura**

`src/diplomacie/requirements.txt`:

```
AoE2ScenarioParser==0.9.2
```

(Pillow přichází z apk `py3-pillow`; lokálně je už nainstalovaný.)

```bash
mkdir -p src/diplomacie/fixtures
cp "/c/Users/mjouk/Downloads/LLC.aoe2scenario_output.aoe2scenario" src/diplomacie/fixtures/LLC.aoe2scenario
```

- [ ] **Step 3: Padající test rozboru**

`src/diplomacie/rozbor.test.ts`:

```ts
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { jeHlavickaScenare, rozeberScenar } from "./rozbor.js";

const LLC = await readFile(new URL("./fixtures/LLC.aoe2scenario", import.meta.url));

/** Rozbor potřebuje Python s AoE2ScenarioParser; bez něj se sada přeskočí s jasnou hláškou. */
function maPython(): boolean {
  try {
    execFileSync(config.python, ["-c", "import AoE2ScenarioParser, PIL"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

it("hlavička: scénář projde, cokoliv jiného ne", () => {
  expect(jeHlavickaScenare(LLC)).toBe(true);
  expect(jeHlavickaScenare(Buffer.from("\x89PNG\r\n\x1a\n"))).toBe(false);
  expect(jeHlavickaScenare(Buffer.alloc(2))).toBe(false);
});

describe.skipIf(!maPython())("rozbor LLC (vyžaduje Python s AoE2ScenarioParser)", () => {
  it("přečte sloty, cíle, limity, suroviny, starty a minimapu", async () => {
    const v = await rozeberScenar(LLC);
    if (!v.ok) throw new Error(v.chyba);
    const r = v.rozbor;
    expect(r.velikostMapy).toBe(220);
    expect(r.sloty.find((s) => s.jeGm)?.barva).toBe(7);
    expect(r.cile.map((c) => c.pocet).sort((a, b) => a - b)).toEqual([5, 15, 99, 150, 650, 900]);
    expect(r.cile.find((c) => c.pocet === 650)?.text).toMatch(/zabij 650/);
    expect(r.limity).toEqual({ vesnicane: 30, rybarskeLode: 5, obchodniVozy: 5 });
    expect(r.suroviny).toEqual({ jidlo: 2000, drevo: 2000, zlato: 2000, kamen: 1000, populace: 200 });
    expect(r.starty.map((s) => s.barva).sort()).toEqual([1, 2, 3, 4, 5, 6, 8]);
    for (const s of r.starty) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1);
    }
    expect(v.minimapa.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(v.minimapa.subarray(8, 12).toString("ascii")).toBe("WEBP");
  }, 120_000);

  it("rozbitý soubor vrátí chybu, ne výjimku", async () => {
    const v = await rozeberScenar(Buffer.concat([LLC.subarray(0, 4), Buffer.alloc(100)]));
    expect(v.ok).toBe(false);
  }, 120_000);

  it("limit času proces zabije", async () => {
    const v = await rozeberScenar(LLC, { limitMs: 1 });
    expect(v).toEqual({ ok: false, chyba: "Rozbor trval déle než 0 s a byl ukončen." });
  });
});
```

- [ ] **Step 4: Test padá**

Run: `npx vitest run src/diplomacie/rozbor.test.ts`
Expected: FAIL (modul `rozbor.js` neexistuje).

- [ ] **Step 5: `rozbor.py`**

`src/diplomacie/rozbor.py`:

```python
# -*- coding: utf-8 -*-
"""Rozbor scénáře Diplomacie: soubor na stdin, JSON na stdout (spec §5.2).

Výstup: {"ok": true, "rozbor": RozborScenare, "minimapa": "<base64 webp>"}
nebo {"ok": false, "chyba": "…"}. Tvar RozborScenare hlídá
src/shared/diplomacie/scenar.ts (prectiRozbor) — měnit oboje naráz.
"""
import base64
import contextlib
import io
import json
import math
import os
import re
import statistics
import sys
import tempfile
from pathlib import Path

from PIL import Image

BARVY_TERENU = json.loads((Path(__file__).with_name("barvy_terenu.json")).read_text(encoding="utf-8"))
NEZNAMY_TEREN = (128, 128, 128)
CIL_HLASKA = re.compile(r"^TVUJ SEKUNDARNI CIL JE\s*:\s*(.+)$")
# Podmínky a efekty triggerů (čísla z AoE2 DE, ověřeno na LLC 1. 10. 2026).
PODMINKA_OWN_OBJECTS = 3
PODMINKA_CHANCE = 20
PODMINKA_VARIABLE = 22
EFEKT_CHAT = 3
EFEKT_AKTIVUJ = 8
# Skupiny jednotek v podmínce Own Objects u limitů ve scénáři LLC.
SKUPINY_LIMITU = {4: "vesnicane", 21: "rybarskeLode", 19: "obchodniVozy"}
ZVETSENI = 2


def nacti(data: bytes):
    from AoE2ScenarioParser.scenarios.aoe2_de_scenario import AoE2DEScenario

    with tempfile.NamedTemporaryFile(suffix=".aoe2scenario", delete=False) as f:
        f.write(data)
        cesta = f.name
    try:
        # Knihovna píše průběh na stdout — ten patří jen výsledku.
        with contextlib.redirect_stdout(io.StringIO()):
            return AoE2DEScenario.from_file(cesta)
    finally:
        os.unlink(cesta)


def sloty(sc):
    vysledek = []
    for cislo in range(1, 9):
        p = sc.player_manager.players[cislo]
        jmeno = (p.tribe_name or "").strip()
        vysledek.append({"cislo": cislo, "barva": cislo, "jmeno": jmeno, "jeGm": jmeno.upper() == "GM"})
    return vysledek


def cile(sc, hrac: int):
    triggery = sc.trigger_manager.triggers
    vysledek, videne = [], set()
    for t in triggery:
        if not any(c.condition_type == PODMINKA_CHANCE for c in t.conditions):
            continue
        text = None
        for e in t.effects:
            if e.effect_type == EFEKT_CHAT and e.source_player == hrac and e.message:
                m = CIL_HLASKA.match(e.message.strip())
                if m:
                    text = m.group(1).strip()
        aktivovany = next((e.trigger_id for e in t.effects if e.effect_type == EFEKT_AKTIVUJ), None)
        if text is None or aktivovany is None or text in videne:
            continue
        cilovy = triggery[aktivovany]
        pocet = next((c.quantity for c in cilovy.conditions if c.condition_type == PODMINKA_VARIABLE), None)
        if pocet is None:
            raise ValueError(f"u cíle „{text}“ chybí podmínka s počtem")
        videne.add(text)
        vysledek.append({"text": text, "pocet": pocet})
    return vysledek


def limity(sc, hrac: int):
    vysledek = {v: None for v in SKUPINY_LIMITU.values()}
    for t in sc.trigger_manager.triggers:
        for c in t.conditions:
            if c.condition_type == PODMINKA_OWN_OBJECTS and c.source_player == hrac and c.object_group in SKUPINY_LIMITU:
                klic = SKUPINY_LIMITU[c.object_group]
                if vysledek[klic] is None:
                    vysledek[klic] = c.quantity
    return vysledek


def otoc(x: float, y: float, n: int):
    """Dílec (x, y) → pozice v obrázku minimapy 0–1 po otočení o 45° (kosočtverec jako ve hře)."""
    s = n * ZVETSENI
    dx, dy = x * ZVETSENI - s / 2, y * ZVETSENI - s / 2
    uhel = math.radians(45)
    # PIL rotate(45) točí proti směru hodinových ručiček v souřadnicích s osou y dolů.
    nx = dx * math.cos(uhel) + dy * math.sin(uhel)
    ny = -dx * math.sin(uhel) + dy * math.cos(uhel)
    strana = s * math.sqrt(2)
    return (nx + strana / 2) / strana, (ny + strana / 2) / strana


def minimapa(sc, varovani):
    n = sc.map_manager.map_size
    obr = Image.new("RGB", (n, n))
    px = obr.load()
    nezname = set()
    for i, dilec in enumerate(sc.map_manager.terrain):
        barva = BARVY_TERENU.get(str(dilec.terrain_id))
        if barva is None:
            nezname.add(dilec.terrain_id)
            barva = NEZNAMY_TEREN
        px[i % n, i // n] = tuple(barva)
    if nezname:
        varovani.append(f"neznámé terény {sorted(nezname)} jsou šedé")
    obr = obr.resize((n * ZVETSENI, n * ZVETSENI), Image.NEAREST).convert("RGBA")
    obr = obr.rotate(45, expand=True, resample=Image.NEAREST, fillcolor=(0, 0, 0, 0))
    buf = io.BytesIO()
    obr.save(buf, "WEBP", lossless=True)
    return buf.getvalue(), obr.size


def starty(sc, gm: int):
    n = sc.map_manager.map_size
    vysledek = []
    for cislo in range(1, 9):
        jednotky = sc.unit_manager.units[cislo]
        if cislo == gm or not jednotky:
            continue
        x = statistics.median(u.x for u in jednotky)
        y = statistics.median(u.y for u in jednotky)
        ox, oy = otoc(x, y, n)
        vysledek.append({"barva": cislo, "x": round(ox, 4), "y": round(oy, 4)})
    return vysledek


def rozeber(data: bytes):
    sc = nacti(data)
    varovani = []
    sl = sloty(sc)
    gm = next((s["cislo"] for s in sl if s["jeGm"]), None)
    if gm is None:
        raise ValueError("scénář nemá hráče pojmenovaného GM")
    hrac = next(s["cislo"] for s in sl if not s["jeGm"])
    p = sc.player_manager.players[hrac]
    webp, (sirka, vyska) = minimapa(sc, varovani)
    rozbor = {
        "velikostMapy": sc.map_manager.map_size,
        "sloty": sl,
        "cile": cile(sc, hrac),
        "suroviny": {"jidlo": p.food, "drevo": p.wood, "zlato": p.gold, "kamen": p.stone, "populace": p.population_cap},
        "limity": limity(sc, hrac),
        "starty": starty(sc, gm),
        "minimapa": {"sirka": sirka, "vyska": vyska},
        "varovani": varovani,
    }
    if len(rozbor["cile"]) == 0:
        raise ValueError("ve scénáři nejsou sekundární cíle (hláška „TVUJ SEKUNDARNI CIL JE“)")
    return rozbor, webp


def main() -> None:
    data = sys.stdin.buffer.read()
    try:
        rozbor, webp = rozeber(data)
        vystup = {"ok": True, "rozbor": rozbor, "minimapa": base64.b64encode(webp).decode("ascii")}
    except Exception as chyba:  # noqa: BLE001 — každé selhání je odpověď, ne pád
        vystup = {"ok": False, "chyba": f"{type(chyba).__name__}: {chyba}"}
    sys.stdout.write(json.dumps(vystup, ensure_ascii=False))


if __name__ == "__main__":
    main()
```

- [ ] **Step 6: `rozbor.ts` a `config.python`**

`src/config.ts` do objektu `config` (vedle `zkusebniHraci`):

```ts
  /**
   * Interpret pro rozbor scénáře Diplomacie (src/diplomacie/rozbor.py).
   * V kontejneru virtuální prostředí z Dockerfile; ve vývoji na Windows
   * `PYTHON=python` v .env.
   */
  get python(): string {
    return process.env["PYTHON"] ?? "/opt/rozbor/bin/python";
  },
```

`src/diplomacie/rozbor.ts`:

```ts
import { spawn } from "node:child_process";
import { join } from "node:path";
import { config } from "../config.js";
import { prectiRozbor, type RozborScenare } from "../shared/diplomacie/scenar.js";

export type VysledekRozboru = { ok: true; rozbor: RozborScenare; minimapa: Buffer } | { ok: false; chyba: string };

/** Scénář AoE2 DE začíná textovou verzí formátu, např. „1.59“ (spec §5.2 bod 1). */
export function jeHlavickaScenare(soubor: Buffer): boolean {
  return soubor.length > 8 && /^\d\.\d\d$/.test(soubor.subarray(0, 4).toString("latin1"));
}

/**
 * Spustí rozbor.py, pošle mu soubor na stdin a přečte JSON. Každé selhání
 * (pád, limit, nesmyslný výstup) je výsledek `ok: false`, ne výjimka —
 * nahrání se pak uloží s chybou rozboru (spec §5.2 bod 4).
 */
export function rozeberScenar(soubor: Buffer, volby: { python?: string; limitMs?: number } = {}): Promise<VysledekRozboru> {
  const limitMs = volby.limitMs ?? 60_000;
  return new Promise((hotovo) => {
    const proces = spawn(volby.python ?? config.python, [join(import.meta.dirname, "rozbor.py")], { stdio: ["pipe", "pipe", "pipe"] });
    const vystup: Buffer[] = [];
    const chyby: Buffer[] = [];
    let konec = false;
    const skonci = (v: VysledekRozboru) => {
      if (konec) return;
      konec = true;
      clearTimeout(casovac);
      hotovo(v);
    };
    const casovac = setTimeout(() => {
      proces.kill("SIGKILL");
      skonci({ ok: false, chyba: `Rozbor trval déle než ${Math.floor(limitMs / 1000)} s a byl ukončen.` });
    }, limitMs);
    proces.stdout.on("data", (d: Buffer) => vystup.push(d));
    proces.stderr.on("data", (d: Buffer) => chyby.push(d));
    proces.on("error", (e) => skonci({ ok: false, chyba: `Rozbor se nespustil: ${e.message}` }));
    proces.on("close", () => {
      try {
        const json = JSON.parse(Buffer.concat(vystup).toString("utf8")) as { ok?: unknown; rozbor?: unknown; minimapa?: unknown; chyba?: unknown };
        if (json.ok !== true) return skonci({ ok: false, chyba: typeof json.chyba === "string" ? json.chyba : "Rozbor selhal." });
        if (typeof json.minimapa !== "string") return skonci({ ok: false, chyba: "Rozbor nevrátil minimapu." });
        skonci({ ok: true, rozbor: prectiRozbor(json.rozbor), minimapa: Buffer.from(json.minimapa, "base64") });
      } catch (e) {
        const stderr = Buffer.concat(chyby).toString("utf8").trim().split("\n").at(-1) ?? "";
        skonci({ ok: false, chyba: e instanceof Error ? `${e.message}${stderr ? ` (${stderr})` : ""}` : "Rozbor vrátil nesmysl." });
      }
    });
    proces.stdin.on("error", () => {});
    proces.stdin.end(soubor);
  });
}
```

Do `.env` (lokálně, gitignorované) přidat `PYTHON=python`, a protože testy `.env` nečtou, spouštět rozborové testy lokálně jako `PYTHON=python npx vitest run src/diplomacie/rozbor.test.ts` (Git Bash).

- [ ] **Step 7: Testy projdou lokálně**

Run: `PYTHON=python npx vitest run src/diplomacie/rozbor.test.ts`
Expected: PASS všech 4 testů (rozbor LLC do ~20 s).

- [ ] **Step 8: Vizuální kontrola natočení minimapy**

Skriptem ve scratchpadu uložit `v.minimapa` do PNG a nakreslit na ni starty (kolečka v barvách hráčů). Ukázat uživateli spolu s minimapou scénáře ve hře (uživatel pošle snímek lobby se scénářem LLC). Když je obraz zrcadlený nebo pootočený, upravit **jen** `otoc()` a `minimapa()` v `rozbor.py` (jiný úhel nebo `obr.transpose(Image.FLIP_LEFT_RIGHT)` v obou funkcích stejně), znovu spustit test a ukázat. Hotovo až po souhlasu uživatele.

- [ ] **Step 9: Build a Dockerfile**

`scripts/copy-migrations.ts` na konec přidat kopii souborů rozboru (jediný skript, který po `tsc` kopíruje nekompilované soubory):

```ts
// Rozbor scénáře Diplomacie běží v Pythonu vedle zkompilovaného rozbor.js
// (src/diplomacie/rozbor.ts ho hledá přes import.meta.dirname).
const diplo = join(import.meta.dirname, "..", "src", "diplomacie");
const diploCil = join(import.meta.dirname, "..", "dist", "src", "diplomacie");
await mkdir(diploCil, { recursive: true });
for (const soubor of ["rozbor.py", "barvy_terenu.json", "requirements.txt"]) {
  await cp(join(diplo, soubor), join(diploCil, soubor));
}
console.log(`Zkopírován rozbor scénáře -> ${diploCil}`);
```

`Dockerfile`, stupeň runner — nahradit `RUN apk add --no-cache curl`:

```dockerfile
# curl kvůli healthchecku, který Coolify do kontejneru vkládá sám. Python
# s AoE2ScenarioParser rozebírá nahrané scénáře Diplomacie (spec §5.2);
# Pillow z apk, ať se nemusí kompilovat.
RUN apk add --no-cache curl python3 py3-pillow \
 && python3 -m venv --system-site-packages /opt/rozbor
COPY src/diplomacie/requirements.txt /opt/rozbor/requirements.txt
RUN /opt/rozbor/bin/pip install --no-cache-dir -r /opt/rozbor/requirements.txt
```

Run: `npm run build; echo EXIT=$?` → `EXIT=0`, `ls dist/src/diplomacie` ukáže `rozbor.js rozbor.py barvy_terenu.json requirements.txt`.

- [ ] **Step 10: Commit a ověření v kontejneru**

```bash
npm run verze
git add nastroje/diplomacie src/diplomacie src/config.ts scripts/copy-migrations.ts Dockerfile package.json src/shared/verze.ts
git commit -m "Parse uploaded Diplomacy scenarios with a Python step

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

Po nasazení dipla ověřit, že interpret v kontejneru jde (jen čtení):

```bash
ssh root@178.104.160.182 'docker exec $(docker ps -q --filter name=<DIPLO_UUID> | head -1) /opt/rozbor/bin/python -c "import AoE2ScenarioParser, PIL; print(\"ok\")"'
```

Expected: `ok`.

---

## Úkol 6: Viditelnost tajných dat

**Files:**
- Create: `src/shared/diplomacie/viditelnost.ts`
- Test: `src/shared/diplomacie/viditelnost.test.ts`

**Interfaces:**
- Consumes: `DiploData`, `DiploZapas`, `RoleHrace` (úkol 4).
- Produces: `redigujDiplo(data: DiploData, divakHracId: string | null): DiploData` — výsledek má tentýž typ; zaslepená pole jsou `nastupceHracId: null` a vyfiltrované `role`.

- [ ] **Step 1: Padající testy (hlavní bezpečnostní sada, spec §7)**

`src/shared/diplomacie/viditelnost.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { DiploData, DiploZapas, RoleHrace, StavDiplo } from "./typy.js";
import { redigujDiplo } from "./viditelnost.js";

const GM = "gm";
const role: RoleHrace[] = [
  { hracId: "n", role: "nastupce", cilHracId: null, upravenoPoRozeslani: false },
  { hracId: "g", role: "garda", cilHracId: null, upravenoPoRozeslani: false },
  { hracId: "j1", role: "najezdnik", cilHracId: null, upravenoPoRozeslani: false },
  { hracId: "j2", role: "najezdnik", cilHracId: null, upravenoPoRozeslani: false },
  { hracId: "s", role: "sasek", cilHracId: null, upravenoPoRozeslani: true },
  { hracId: "z", role: "zoldak", cilHracId: "g", upravenoPoRozeslani: false },
  { hracId: "k", role: "kat", cilHracId: "s", upravenoPoRozeslani: false },
];
const data = (stav: StavDiplo): DiploData => ({
  aktivni: null,
  verze: {},
  zapasy: [{ zapasId: 1, gmHracId: GM, stav, nastupceHracId: "n", scenarId: null, role: stav === "priprava" ? [] : role } satisfies DiploZapas],
});
const pohled = (stav: StavDiplo, kdo: string | null) => redigujDiplo(data(stav), kdo).zapasy[0]!;

describe("GM vidí všechno ve všech stavech", () => {
  for (const stav of ["priprava", "losovano", "rozeslano"] as const) {
    it(stav, () => expect(pohled(stav, GM)).toEqual(data(stav).zapasy[0]));
  }
});

describe("před rozesláním nikdo jiný nic", () => {
  for (const stav of ["priprava", "losovano"] as const) {
    for (const kdo of ["n", "k", "cizi", null]) {
      it(`${stav} / ${kdo}`, () => {
        expect(pohled(stav, kdo)).toEqual({ zapasId: 1, gmHracId: GM, stav, nastupceHracId: null, scenarId: null, role: [] });
      });
    }
  }
});

describe("po rozeslání", () => {
  const zaklad = { zapasId: 1, gmHracId: GM, stav: "rozeslano", nastupceHracId: "n", scenarId: null };
  const r = (id: string) => role.find((x) => x.hracId === id)!;

  it("Kat vidí svou roli s obětí a nic dalšího", () => expect(pohled("rozeslano", "k")).toEqual({ ...zaklad, role: [r("k")] }));
  it("Žoldák vidí svůj pakt", () => expect(pohled("rozeslano", "z")).toEqual({ ...zaklad, role: [r("z")] }));
  it("Nájezdník vidí sebe a druhého Nájezdníka", () => expect(pohled("rozeslano", "j1")).toEqual({ ...zaklad, role: [r("j1"), r("j2")] }));
  it("Šašek vidí sebe i s příznakem úpravy", () => expect(pohled("rozeslano", "s")).toEqual({ ...zaklad, role: [r("s")] }));
  it("Garda vidí jen sebe", () => expect(pohled("rozeslano", "g")).toEqual({ ...zaklad, role: [r("g")] }));
  it("Nástupce vidí jen sebe", () => expect(pohled("rozeslano", "n")).toEqual({ ...zaklad, role: [r("n")] }));
  it("cizí, admin-ne-GM i nepřihlášený vidí jen Nástupce", () => {
    for (const kdo of ["cizi", "admin", null]) expect(pohled("rozeslano", kdo)).toEqual({ ...zaklad, role: [] });
  });
  it("cizí oběť ani pakt nikde v datech", () => {
    const text = JSON.stringify(redigujDiplo(data("rozeslano"), "j1"));
    expect(text).not.toContain('"kat"');
    expect(text).not.toContain('"zoldak"');
  });
});

it("verze scénáře se nezaslepují", () => {
  const d: DiploData = { ...data("rozeslano"), verze: { 3: { id: 3 } as never }, aktivni: { id: 3 } as never };
  const v = redigujDiplo(d, null);
  expect(v.verze).toBe(d.verze);
  expect(v.aktivni).toBe(d.aktivni);
});
```

- [ ] **Step 2: Test padá**

Run: `npx vitest run src/shared/diplomacie/viditelnost.test.ts` → FAIL.

- [ ] **Step 3: Implementace**

`src/shared/diplomacie/viditelnost.ts`:

```ts
import type { DiploData, DiploZapas } from "./typy.js";

/**
 * Bezpečnostní hranice Diplomacie (spec §7). Jediné místo, kde se rozhoduje,
 * kdo uvidí cizí roli. Admin tu **nemá výjimku**: kdo není GM zápasu, je
 * obyčejný divák — Rob streamuje a role by se objevily ve vysílání.
 */
export function redigujDiplo(data: DiploData, divakHracId: string | null): DiploData {
  return { ...data, zapasy: data.zapasy.map((z) => redigujZapas(z, divakHracId)) };
}

function redigujZapas(z: DiploZapas, divak: string | null): DiploZapas {
  if (divak !== null && divak === z.gmHracId) return z;
  if (z.stav !== "rozeslano") return { ...z, nastupceHracId: null, role: [] };
  const moje = divak === null ? undefined : z.role.find((r) => r.hracId === divak);
  if (!moje) return { ...z, role: [] };
  // Nájezdníci se znají od začátku hry; nikdo jiný o nikom nic neví.
  const vidi = moje.role === "najezdnik" ? z.role.filter((r) => r.role === "najezdnik") : [moje];
  return { ...z, role: vidi };
}
```

- [ ] **Step 4: Testy projdou**

Run: `npx vitest run src/shared/diplomacie/viditelnost.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
npm run verze
git add src/shared/diplomacie/viditelnost.ts src/shared/diplomacie/viditelnost.test.ts package.json src/shared/verze.ts
git commit -m "Redact Diplomacy secrets per viewer, with no exception for admins

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 7: Tabulky Diplomacie a přístup k nim

**Files:**
- Create: `database/031_diplomacie.sql`
- Create: `src/diplomacie/db.ts`
- Test: `src/diplomacie/db.db.test.ts`

**Interfaces:**
- Consumes: typy z úkolu 4 (`DiploZapas`, `RoleHrace`, `ScenarVerze`, `StavDiplo`, `RozborScenare`).
- Produces (`src/diplomacie/db.ts`):
  - `zalozDiploZapas(client: PoolClient, zapasId: number): Promise<void>` — otiskne aktivní verzi scénáře; GM se neukládá, je to vždy účastník na šedé (`ucastnik.barva = 7`), takže výměna GM změnou sestavy v přípravě se projeví sama
  - `listDiploZapasy(akceId: number): Promise<DiploZapas[]>`
  - `getDiploZapas(zapasId: number): Promise<DiploZapas | null>`
  - `setNastupce(zapasId: number, hracId: string): Promise<void>` (jen v `priprava`)
  - `ulozRole(zapasId: number, role: RoleHrace[], stav: StavDiplo): Promise<void>` (přepíše všechny role a stav)
  - `upravRoli(zapasId: number, r: RoleHrace): Promise<void>`
  - `setStavDiplo(zapasId: number, stav: StavDiplo): Promise<void>` (`rozeslano` nastaví `rozeslano_v`)
  - `vratNaPripravu(zapasId: number): Promise<void>` (smaže role, Nástupce, stav `priprava`)
  - `ulozVerziScenare(v: { jmenoSouboru: string; sha256: string; data: Buffer; rozbor: RozborScenare | null; chybaRozboru: string | null; minimapa: Buffer | null; nahralHracId: string; poznamka: string | null }): Promise<{ id: number; aktivovana: boolean }>` — první verze s rozborem se aktivuje sama
  - `najdiVerziPodleSha(sha256: string): Promise<number | null>`
  - `listVerzi(): Promise<ScenarVerze[]>` (nejnovější první)
  - `getVerze(id: number): Promise<ScenarVerze | null>`, `getAktivniVerze(): Promise<ScenarVerze | null>`
  - `aktivujVerzi(id: number): Promise<void>` (v transakci; verze bez rozboru → `Error("Verze bez rozboru se nedá aktivovat.")`)
  - `getSouborVerze(id: number): Promise<{ jmenoSouboru: string; data: Buffer } | null>`, `getMinimapuVerze(id: number): Promise<Buffer | null>`

- [ ] **Step 1: Migrace**

`database/031_diplomacie.sql`:

```sql
-- Mód Diplomacie (spec §4.4, §5). Verze scénáře se nemažou: jsou zálohou
-- a zápas si otiskne tu, kterou hrál.
CREATE TABLE diplo_scenar (
  id             SERIAL PRIMARY KEY,
  jmeno_souboru  TEXT NOT NULL,
  sha256         TEXT NOT NULL UNIQUE,
  data           BYTEA NOT NULL,
  rozbor         JSONB,
  chyba_rozboru  TEXT,
  minimapa       BYTEA,
  nahral_hrac_id TEXT NOT NULL REFERENCES player(hrac_id),
  nahrano_v      TIMESTAMPTZ NOT NULL DEFAULT now(),
  poznamka       TEXT,
  aktivni        BOOLEAN NOT NULL DEFAULT false,
  CHECK (NOT aktivni OR rozbor IS NOT NULL)
);
CREATE UNIQUE INDEX diplo_scenar_jeden_aktivni ON diplo_scenar ((true)) WHERE aktivni;

-- GM se neukládá: je to vždy účastník zápasu na šedé (barva 7, hráč „GM“
-- ve scénáři). Admin ho v přípravě vymění změnou sestavy a nic se nerozejde.
CREATE TABLE diplo_zapas (
  zapas_id         INTEGER PRIMARY KEY REFERENCES zapas(id) ON DELETE CASCADE,
  stav             TEXT NOT NULL DEFAULT 'priprava' CHECK (stav IN ('priprava', 'losovano', 'rozeslano')),
  nastupce_hrac_id TEXT REFERENCES player(hrac_id),
  scenar_id        INTEGER REFERENCES diplo_scenar(id),
  rozeslano_v      TIMESTAMPTZ,
  upraveno_v       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE diplo_role (
  zapas_id              INTEGER NOT NULL REFERENCES diplo_zapas(zapas_id) ON DELETE CASCADE,
  hrac_id               TEXT NOT NULL REFERENCES player(hrac_id),
  role                  TEXT NOT NULL CHECK (role IN ('nastupce', 'garda', 'najezdnik', 'sasek', 'zoldak', 'kat')),
  cil_hrac_id           TEXT REFERENCES player(hrac_id),
  puvodni_role          TEXT,
  upraveno_po_rozeslani BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (zapas_id, hrac_id)
);
```

**Pozor na `TRUNCATE player, akce CASCADE` v DB testech:** `diplo_scenar` odkazuje na `player`, takže se kaskádou vyprázdní i ona — testy, které ji potřebují, si verzi založí samy.

- [ ] **Step 2: Společní pomocníci DB testů a padající testy**

`src/diplomacie/testPomocnici.ts` — sdílí ho DB testy úkolů 7–10, ať se pomocníci neopisují:

```ts
import { createAkce, signUp } from "../db/events.js";
import { createZapas } from "../db/matches.js";
import { upsertPlayer } from "../db/players.js";
import { createSession } from "../db/sessions.js";
import type { Barva, RezimId, SestavaVstup } from "../shared/types.js";

export const ROB = "76561198000000041";

/** Přihlášený klient: vrací sid do cookies. */
export async function klient(hracId: string, jeAdmin: boolean): Promise<string> {
  await upsertPlayer(hracId, jeAdmin);
  return createSession(hracId);
}

/** Akce a 8 přihlášených h1…h8 na barvách 1–8 bez týmů; h7 je na šedé (GM). */
export async function akceOsmi(rezim: RezimId = "diplomacie") {
  const akce = await createAkce("Diplo", rezim);
  const sestava: SestavaVstup[] = ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva, tym: 0, civ: null }));
  for (const s of sestava) {
    await upsertPlayer(s.hracId, false);
    await signUp(akce.id, s.hracId);
  }
  return { akce, sestava };
}

/** Totéž a rovnou zápas přes db vrstvu (bez háčků API — ty testují úkoly 8–9 přes inject). */
export async function zapasOsmi(rezim: RezimId = "diplomacie") {
  const { akce, sestava } = await akceOsmi(rezim);
  const zapas = await createZapas(akce.id, sestava);
  return { akce, sestava, zapas };
}
```

Po úkolu 8 už `createZapas` volá háček módu sám, takže `zapasOsmi("diplomacie")` založí i diplo zápas. V tomto úkolu háček ještě neexistuje a test si diplo zápas zakládá ručně přes `zalozDiploZapas`.

`src/diplomacie/db.db.test.ts` (vzor `src/http/routes/events.db.test.ts`: `beforeEach` s `TRUNCATE player, akce CASCADE`, `afterAll(closePool)`):

```ts
it("první verze s rozborem se aktivuje sama, další ne; bez rozboru aktivovat nejde", async () => {
  await upsertPlayer("autor", false);
  const prvni = await ulozVerziScenare({ jmenoSouboru: "a.aoe2scenario", sha256: "1", data: Buffer.from("x"), rozbor: ROZBOR, chybaRozboru: null, minimapa: Buffer.from("m"), nahralHracId: "autor", poznamka: null });
  const druha = await ulozVerziScenare({ jmenoSouboru: "b.aoe2scenario", sha256: "2", data: Buffer.from("y"), rozbor: ROZBOR, chybaRozboru: null, minimapa: Buffer.from("m"), nahralHracId: "autor", poznamka: "v2" });
  const vadna = await ulozVerziScenare({ jmenoSouboru: "c.aoe2scenario", sha256: "3", data: Buffer.from("z"), rozbor: null, chybaRozboru: "ValueError: x", minimapa: null, nahralHracId: "autor", poznamka: null });
  expect(prvni.aktivovana).toBe(true);
  expect(druha.aktivovana).toBe(false);
  expect((await getAktivniVerze())?.id).toBe(prvni.id);
  await aktivujVerzi(druha.id);
  expect((await getAktivniVerze())?.id).toBe(druha.id);
  await expect(aktivujVerzi(vadna.id)).rejects.toThrow("Verze bez rozboru se nedá aktivovat.");
  expect((await listVerzi()).map((v) => v.id)).toEqual([vadna.id, druha.id, prvni.id]);
  expect(await najdiVerziPodleSha("2")).toBe(druha.id);
  expect((await getSouborVerze(druha.id))?.data.toString()).toBe("y");
});

it("zápas si otiskne aktivní verzi a role se ukládají i mažou", async () => {
  await upsertPlayer("autor", false);
  const { id: scenarId } = await ulozVerziScenare({ jmenoSouboru: "a.aoe2scenario", sha256: "1", data: Buffer.from("x"), rozbor: ROZBOR, chybaRozboru: null, minimapa: null, nahralHracId: "autor", poznamka: null });
  const { zapas } = await zapasOsmi();
  await withTransaction((c) => zalozDiploZapas(c, zapas.id));
  expect(await getDiploZapas(zapas.id)).toMatchObject({ gmHracId: "h7", stav: "priprava", scenarId, nastupceHracId: null, role: [] });

  await setNastupce(zapas.id, "h1");
  const role = losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h1", () => 0);
  await ulozRole(zapas.id, role, "losovano");
  expect((await getDiploZapas(zapas.id))?.role).toEqual(role);
  await setStavDiplo(zapas.id, "rozeslano");
  await upravRoli(zapas.id, { ...role[1]!, upravenoPoRozeslani: true });
  expect((await getDiploZapas(zapas.id))?.role[1]?.upravenoPoRozeslani).toBe(true);

  await vratNaPripravu(zapas.id);
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "priprava", nastupceHracId: null, role: [] });
});

it("GM je vždy ten, kdo sedí na šedé — i po výměně v sestavě", async () => {
  const { zapas, sestava } = await zapasOsmi();
  await withTransaction((c) => zalozDiploZapas(c, zapas.id));
  await upsertPlayer("novyGm", false);
  await signUp(zapas.akceId, "novyGm");
  await nahradSestavu(zapas.id, sestava.map((s) => (s.barva === 7 ? { ...s, hracId: "novyGm" } : s)));
  expect((await getDiploZapas(zapas.id))?.gmHracId).toBe("novyGm");
});

it("smazání zápasu smaže i Diplomacii", async () => {
  const { zapas } = await zapasOsmi();
  await withTransaction((c) => zalozDiploZapas(c, zapas.id));
  await getPool().query("DELETE FROM zapas WHERE id = $1", [zapas.id]);
  expect(await getDiploZapas(zapas.id)).toBeNull();
});
```

(`ROZBOR` z `src/shared/diplomacie/fixtures.ts`, `losujRole` z úkolu 4.)

- [ ] **Step 3: Implementace `db.ts`**

`src/diplomacie/db.ts`:

```ts
import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../db/pool.js";
import { prectiRozbor, type RozborScenare } from "../shared/diplomacie/scenar.js";
import { GM_BARVA } from "../shared/diplomacie/sestava.js";
import type { DiploZapas, Role, RoleHrace, ScenarVerze, StavDiplo } from "../shared/diplomacie/typy.js";

interface VerzeDb {
  id: number;
  jmeno_souboru: string;
  nahrano_v: Date;
  nahral_jmeno: string;
  poznamka: string | null;
  aktivni: boolean;
  rozbor: unknown;
  chyba_rozboru: string | null;
}

const SLOUPCE_VERZE = `s.id, s.jmeno_souboru, s.nahrano_v, COALESCE(p.alias, p.platforma_jmeno, p.hrac_id) AS nahral_jmeno,
  s.poznamka, s.aktivni, s.rozbor, s.chyba_rozboru`;

function mapujVerzi(r: VerzeDb): ScenarVerze {
  return {
    id: r.id,
    jmenoSouboru: r.jmeno_souboru,
    nahrano: r.nahrano_v.toISOString(),
    nahralJmeno: r.nahral_jmeno,
    poznamka: r.poznamka,
    aktivni: r.aktivni,
    // Rozbor prošel kontrolou při nahrání; tady se čte znovu, ať starý tvar
    // v databázi po změně typu spadne hned a srozumitelně.
    rozbor: r.rozbor === null ? null : prectiRozbor(r.rozbor),
    chybaRozboru: r.chyba_rozboru,
  };
}

export async function ulozVerziScenare(v: {
  jmenoSouboru: string;
  sha256: string;
  data: Buffer;
  rozbor: RozborScenare | null;
  chybaRozboru: string | null;
  minimapa: Buffer | null;
  nahralHracId: string;
  poznamka: string | null;
}): Promise<{ id: number; aktivovana: boolean }> {
  return withTransaction(async (c) => {
    const { rows: aktivni } = await c.query("SELECT 1 FROM diplo_scenar WHERE aktivni FOR UPDATE");
    // První čitelná verze se aktivuje sama — jinak by nebylo co hrát (spec §5.2 bod 5).
    const aktivovat = aktivni.length === 0 && v.rozbor !== null;
    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO diplo_scenar (jmeno_souboru, sha256, data, rozbor, chyba_rozboru, minimapa, nahral_hrac_id, poznamka, aktivni)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9) RETURNING id`,
      [v.jmenoSouboru, v.sha256, v.data, v.rozbor === null ? null : JSON.stringify(v.rozbor), v.chybaRozboru, v.minimapa, v.nahralHracId, v.poznamka, aktivovat],
    );
    return { id: rows[0]!.id, aktivovana: aktivovat };
  });
}

export async function najdiVerziPodleSha(sha256: string): Promise<number | null> {
  const { rows } = await getPool().query<{ id: number }>("SELECT id FROM diplo_scenar WHERE sha256 = $1", [sha256]);
  return rows[0]?.id ?? null;
}

export async function listVerzi(): Promise<ScenarVerze[]> {
  const { rows } = await getPool().query<VerzeDb>(
    `SELECT ${SLOUPCE_VERZE} FROM diplo_scenar s JOIN player p ON p.hrac_id = s.nahral_hrac_id ORDER BY s.id DESC`,
  );
  return rows.map(mapujVerzi);
}

export async function getVerze(id: number): Promise<ScenarVerze | null> {
  const { rows } = await getPool().query<VerzeDb>(`SELECT ${SLOUPCE_VERZE} FROM diplo_scenar s JOIN player p ON p.hrac_id = s.nahral_hrac_id WHERE s.id = $1`, [id]);
  return rows[0] ? mapujVerzi(rows[0]) : null;
}

export async function getAktivniVerze(): Promise<ScenarVerze | null> {
  const { rows } = await getPool().query<VerzeDb>(`SELECT ${SLOUPCE_VERZE} FROM diplo_scenar s JOIN player p ON p.hrac_id = s.nahral_hrac_id WHERE s.aktivni`);
  return rows[0] ? mapujVerzi(rows[0]) : null;
}

export async function aktivujVerzi(id: number): Promise<void> {
  await withTransaction(async (c) => {
    const { rows } = await c.query<{ rozbor: unknown }>("SELECT rozbor FROM diplo_scenar WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) throw new Error(`Verze ${id} neexistuje.`);
    if (rows[0].rozbor === null) throw new Error("Verze bez rozboru se nedá aktivovat.");
    await c.query("UPDATE diplo_scenar SET aktivni = false WHERE aktivni");
    await c.query("UPDATE diplo_scenar SET aktivni = true WHERE id = $1", [id]);
  });
}

export async function getSouborVerze(id: number): Promise<{ jmenoSouboru: string; data: Buffer } | null> {
  const { rows } = await getPool().query<{ jmeno_souboru: string; data: Buffer }>("SELECT jmeno_souboru, data FROM diplo_scenar WHERE id = $1", [id]);
  return rows[0] ? { jmenoSouboru: rows[0].jmeno_souboru, data: rows[0].data } : null;
}

export async function getMinimapuVerze(id: number): Promise<Buffer | null> {
  const { rows } = await getPool().query<{ minimapa: Buffer | null }>("SELECT minimapa FROM diplo_scenar WHERE id = $1", [id]);
  return rows[0]?.minimapa ?? null;
}

// --- zápasy ---

export async function zalozDiploZapas(client: PoolClient, zapasId: number): Promise<void> {
  // Zápas si otiskne aktivní verzi, jako si otiskuje nastavení lobby (spec §4.4).
  await client.query(`INSERT INTO diplo_zapas (zapas_id, scenar_id) VALUES ($1, (SELECT id FROM diplo_scenar WHERE aktivni))`, [zapasId]);
}

interface ZapasDb {
  zapas_id: number;
  gm_hrac_id: string | null;
  stav: StavDiplo;
  nastupce_hrac_id: string | null;
  scenar_id: number | null;
}
interface RoleDb {
  zapas_id: number;
  hrac_id: string;
  role: Role;
  cil_hrac_id: string | null;
  upraveno_po_rozeslani: boolean;
}

async function sestav(zapasy: ZapasDb[]): Promise<DiploZapas[]> {
  if (zapasy.length === 0) return [];
  const { rows: role } = await getPool().query<RoleDb>(
    `SELECT r.zapas_id, r.hrac_id, r.role, r.cil_hrac_id, r.upraveno_po_rozeslani
       FROM diplo_role r JOIN ucastnik u ON u.zapas_id = r.zapas_id AND u.hrac_id = r.hrac_id
      WHERE r.zapas_id = ANY($1::int[]) ORDER BY r.zapas_id, u.poradi`,
    [zapasy.map((z) => z.zapas_id)],
  );
  return zapasy.map((z) => ({
    zapasId: z.zapas_id,
    // Bez hráče na šedé (nemělo by nastat — sestava Diplomacie ho vynucuje)
    // nesmí pult dostat nikdo, proto prázdný řetězec, ne null.
    gmHracId: z.gm_hrac_id ?? "",
    stav: z.stav,
    nastupceHracId: z.nastupce_hrac_id,
    scenarId: z.scenar_id,
    role: role
      .filter((r) => r.zapas_id === z.zapas_id)
      .map((r) => ({ hracId: r.hrac_id, role: r.role, cilHracId: r.cil_hrac_id, upravenoPoRozeslani: r.upraveno_po_rozeslani })),
  }));
}

// GM = účastník na šedé (GM_BARVA); neukládá se, viz migrace 031.
const SLOUPCE_ZAPASU = `d.zapas_id, d.stav, d.nastupce_hrac_id, d.scenar_id,
  (SELECT u.hrac_id FROM ucastnik u WHERE u.zapas_id = d.zapas_id AND u.barva = ${GM_BARVA} LIMIT 1) AS gm_hrac_id`;

export async function listDiploZapasy(akceId: number): Promise<DiploZapas[]> {
  const { rows } = await getPool().query<ZapasDb>(
    `SELECT ${SLOUPCE_ZAPASU} FROM diplo_zapas d JOIN zapas z ON z.id = d.zapas_id WHERE z.akce_id = $1 ORDER BY z.poradi`,
    [akceId],
  );
  return sestav(rows);
}

export async function getDiploZapas(zapasId: number): Promise<DiploZapas | null> {
  const { rows } = await getPool().query<ZapasDb>(`SELECT ${SLOUPCE_ZAPASU} FROM diplo_zapas d WHERE d.zapas_id = $1`, [zapasId]);
  return (await sestav(rows))[0] ?? null;
}

export async function setNastupce(zapasId: number, hracId: string): Promise<void> {
  await getPool().query("UPDATE diplo_zapas SET nastupce_hrac_id = $2, upraveno_v = now() WHERE zapas_id = $1", [zapasId, hracId]);
}

export async function ulozRole(zapasId: number, role: RoleHrace[], stav: StavDiplo): Promise<void> {
  await withTransaction(async (c) => {
    await c.query("DELETE FROM diplo_role WHERE zapas_id = $1", [zapasId]);
    for (const r of role) {
      await c.query(
        `INSERT INTO diplo_role (zapas_id, hrac_id, role, cil_hrac_id, upraveno_po_rozeslani) VALUES ($1, $2, $3, $4, $5)`,
        [zapasId, r.hracId, r.role, r.cilHracId, r.upravenoPoRozeslani],
      );
    }
    await c.query("UPDATE diplo_zapas SET stav = $2, upraveno_v = now() WHERE zapas_id = $1", [zapasId, stav]);
  });
}

export async function upravRoli(zapasId: number, r: RoleHrace): Promise<void> {
  await getPool().query(
    `UPDATE diplo_role SET role = $3, cil_hrac_id = $4, upraveno_po_rozeslani = $5 WHERE zapas_id = $1 AND hrac_id = $2`,
    [zapasId, r.hracId, r.role, r.cilHracId, r.upravenoPoRozeslani],
  );
  await getPool().query("UPDATE diplo_zapas SET upraveno_v = now() WHERE zapas_id = $1", [zapasId]);
}

export async function setStavDiplo(zapasId: number, stav: StavDiplo): Promise<void> {
  await getPool().query(
    `UPDATE diplo_zapas SET stav = $2, upraveno_v = now(), rozeslano_v = CASE WHEN $2 = 'rozeslano' THEN now() ELSE rozeslano_v END WHERE zapas_id = $1`,
    [zapasId, stav],
  );
}

export async function vratNaPripravu(zapasId: number): Promise<void> {
  await withTransaction(async (c) => {
    await c.query("DELETE FROM diplo_role WHERE zapas_id = $1", [zapasId]);
    await c.query("UPDATE diplo_zapas SET stav = 'priprava', nastupce_hrac_id = NULL, rozeslano_v = NULL, upraveno_v = now() WHERE zapas_id = $1", [zapasId]);
  });
}
```

- [ ] **Step 4: Verze, commit a DB testy na serveru**

DB testy běží jen na serveru proti větvi na GitHubu, takže pořadí je: verze, commit, push, test.

```bash
npx tsc --noEmit
npm run verze -- minor
git add database/031_diplomacie.sql src/diplomacie/db.ts src/diplomacie/db.db.test.ts src/shared/diplomacie/fixtures.ts package.json src/shared/verze.ts
git commit -m "Store Diplomacy matches, roles and scenario versions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo
```

Expected: všechny DB testy PASS (nové i dosavadní). Když něco spadne, opravit a poslat opravný commit (nepřepisovat historii).

---

## Úkol 8: Rozhraní módů a háčky v jádru

**Files:**
- Create: `src/shared/rezimy.ts`, `src/rezimy/index.ts`, `src/diplomacie/rezim.ts`
- Modify: `src/shared/types.ts` (`AkceStavPayload.rezim`)
- Modify: `src/http/routes/events.ts` (`POST /api/akce` → výchozí nastavení módu)
- Modify: `src/http/routes/matches.ts` (`prectiSestavu` s módem; `PUT /api/zapas/:id/sestava` → `predZmenouSestavy`)
- Modify: `src/db/matches.ts` (`createZapas` → `poVytvoreniZapasu`)
- Modify: `src/realtime/akceStav.ts` (`buildAkceStav` → `doplnStav`), `src/realtime/redakce.ts` (`redigujProDivaka` → `rediguj`)
- Modify: `web/src/views/Skladani.tsx:79` (sdílená kontrola módu)
- Test: `src/shared/rezimy.test.ts`, `src/realtime/redakce.test.ts`, `src/diplomacie/rezim.db.test.ts`

**Interfaces:**
- Consumes: `RezimId` (úkol 3), `zkontrolujSestavuDiplomacie`, `GM_BARVA` (úkol 4), `redigujDiplo` (úkol 6), db funkce (úkol 7), `NastaveniLobby.scenar`/`scenarStarsi`, `REZIM_SCENARIO` (úkol 2).
- Produces:
  - `src/shared/rezimy.ts`: `zkontrolujSestavuRezimu(rezim: RezimId, sestava: SestavaVstup[]): string | null` (nejdřív jádro `zkontrolujSestavu`, pak mód)
  - `src/shared/types.ts`: `AkceStavPayload.rezim?: { id: "diplomacie"; data: DiploData }`
  - `src/rezimy/index.ts`: `interface RezimAkce`, `rezimAkce(id: RezimId): RezimAkce`, `rezimAkceId(akceId: number): Promise<RezimId>`, `rezimZapasu(zapasId: number): Promise<RezimId>`
  - `src/diplomacie/rezim.ts`: `export const diplomacie: RezimAkce`, `export function nastaveniScenare(aktivni: ScenarVerze | null, vsechny: ScenarVerze[]): Pick<NastaveniLobby, "scenar" | "scenarStarsi">`

- [ ] **Step 1: Sdílená kontrola sestavy (padající test)**

`src/shared/rezimy.test.ts`:

```ts
import { expect, it } from "vitest";
import type { Barva, SestavaVstup } from "./types.js";
import { zkontrolujSestavuRezimu } from "./rezimy.js";

const osm = (): SestavaVstup[] => ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva, tym: 0, civ: null }));

it("klasický mód = jen jádro", () => {
  expect(zkontrolujSestavuRezimu("klasicky", osm().slice(0, 2))).toBeNull();
});
it("Diplomacie přidá svá pravidla po jádru", () => {
  expect(zkontrolujSestavuRezimu("diplomacie", osm().slice(0, 2))).toMatch(/přesně 8/);
  expect(zkontrolujSestavuRezimu("diplomacie", osm())).toBeNull();
  expect(zkontrolujSestavuRezimu("diplomacie", [osm()[0]!])).toMatch(/aspoň 2/);
});
```

`src/shared/rezimy.ts`:

```ts
import { zkontrolujSestavuDiplomacie } from "./diplomacie/sestava.js";
import { zkontrolujSestavu } from "./sestava.js";
import type { RezimId, SestavaVstup } from "./types.js";

/**
 * Pravidla sestavy podle módu akce: nejdřív jádro (to platí vždy), pak mód.
 * Synchronní a sdílené — volá je server při zakládání i úpravě zápasu a
 * frontend (Skladani.tsx), aby „Vytvořit zápas“ svítilo jen pro sestavu,
 * kterou server přijme (spec §4.1 H5).
 */
export function zkontrolujSestavuRezimu(rezim: RezimId, sestava: SestavaVstup[]): string | null {
  const jadro = zkontrolujSestavu(sestava);
  if (jadro) return jadro;
  if (rezim === "diplomacie") return zkontrolujSestavuDiplomacie(sestava);
  return null;
}
```

Run: `npx vitest run src/shared/rezimy.test.ts` → PASS.

- [ ] **Step 2: Rozhraní a klasický mód**

`src/rezimy/index.ts`:

```ts
import type { PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import { diplomacie } from "../diplomacie/rezim.js";
import type { AkceRow } from "../db/events.js";
import type { NastaveniLobby } from "../shared/lobbyKontrola.js";
import type { Divak } from "../realtime/redakce.js";
import type { AkceStavPayload, RezimId, Seat } from "../shared/types.js";

/**
 * Mód akce (spec §4.2). Jádro volá jen tohle rozhraní; klasický večer je
 * prázdná implementace, takže bez Diplomacie se web chová jako dřív.
 * Odebrat mód = smazat jeho modul a řádek v REZIMY.
 */
export interface RezimAkce {
  id: RezimId;
  /** Výchozí nastavení lobby nové akce (dostane výchozí nastavení jádra). */
  vychoziNastaveniLobby(zaklad: NastaveniLobby): Promise<NastaveniLobby>;
  /** Před úpravou sestavy existujícího zápasu: věta (→ 409), nebo null. */
  predZmenouSestavy(zapasId: number): Promise<string | null>;
  /** V transakci založení zápasu, po vložení sedadel. */
  poVytvoreniZapasu(client: PoolClient, zapasId: number, sedadla: Seat[]): Promise<void>;
  /** Větev `rezim` stavu pro prohlížeče — plná, zaslepí ji `rediguj`. */
  doplnStav(akce: AkceRow): Promise<AkceStavPayload["rezim"]>;
  /** Zaslepení větve `rezim` pro jednoho diváka. Volá se i pro admina. */
  rediguj(rezim: NonNullable<AkceStavPayload["rezim"]>, divak: Divak): NonNullable<AkceStavPayload["rezim"]>;
}

const klasicky: RezimAkce = {
  id: "klasicky",
  vychoziNastaveniLobby: async (zaklad) => zaklad,
  predZmenouSestavy: async () => null,
  poVytvoreniZapasu: async () => {},
  doplnStav: async () => undefined,
  rediguj: (rezim) => rezim,
};

const REZIMY: Record<RezimId, RezimAkce> = { klasicky, diplomacie };

export function rezimAkce(id: RezimId): RezimAkce {
  return REZIMY[id];
}

export async function rezimAkceId(akceId: number): Promise<RezimId> {
  const { rows } = await getPool().query<{ rezim: RezimId }>("SELECT rezim FROM akce WHERE id = $1", [akceId]);
  return rows[0]?.rezim ?? "klasicky";
}

export async function rezimZapasu(zapasId: number): Promise<RezimId> {
  const { rows } = await getPool().query<{ rezim: RezimId }>("SELECT a.rezim FROM zapas z JOIN akce a ON a.id = z.akce_id WHERE z.id = $1", [zapasId]);
  return rows[0]?.rezim ?? "klasicky";
}
```

(`Seat` je v `src/shared/types.ts:46`; `signUp(akceId, hracId)` v `src/db/events.ts:198`.)

- [ ] **Step 3: Diplomacie jako mód (padající DB test)**

`src/diplomacie/rezim.db.test.ts` (pomocníci `klient`, `akceOsmi`, `zapasOsmi`, `ROB` z `src/diplomacie/testPomocnici.ts`; `app` = `buildServer()`; `prihlasenyKlient(id, admin)` níž = `klient(id, admin)`):

```ts
it("akce Diplomacie dostane nastavení scénáře z aktivní verze", async () => {
  await upsertPlayer("autor", false);
  const v1 = await ulozVerziScenare({ ...VERZE, jmenoSouboru: "LLC v1.aoe2scenario", sha256: "1" });
  const v2 = await ulozVerziScenare({ ...VERZE, jmenoSouboru: "LLC v2.aoe2scenario", sha256: "2" });
  await aktivujVerzi(v2.id);
  const { sid } = await prihlasenyKlient(ROB, true);
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "D", rezim: "diplomacie" } });
  const n = (await getAktivniAkce())!.nastaveniLobby;
  expect(n).toMatchObject({ rezim: 3, scenar: "LLC v2.aoe2scenario", scenarStarsi: ["LLC v1.aoe2scenario"], mapaId: null, velikost: null, populace: 200, lockTeams: false, sharedExploration: false, cheaty: false, povolitDivaky: true, maxHracu: 8 });
  expect(v1.aktivovana).toBe(true);
});

it("vytvoření zápasu Diplomacie založí diplo zápas s GM na šedé; stav ho nese, klasická akce ne", async () => {
  const { akce, zapas } = await zapasOsmi("diplomacie");
  const { sid } = await prihlasenyKlient("h7", false);
  const res = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } });
  expect(res.json().rezim).toMatchObject({ id: "diplomacie", data: { zapasy: [{ zapasId: zapas.id, gmHracId: "h7", stav: "priprava" }] } });
  // Žádná verze scénáře ještě nahraná není — stav to unese (Review Focus 4).
  expect(res.json().rezim.data.aktivni).toBeNull();
  expect(akce.rezim).toBe("diplomacie");
});

it("sestava bez GM na šedé neprojde přes API, klasická akce ji vezme", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const akce = await createAkce("D", "diplomacie");
  for (const h of ["a", "b"]) { await upsertPlayer(h, false); await signUp(akce.id, h); }
  const sestava = [{ hracId: "a", barva: 1, tym: 0 }, { hracId: "b", barva: 2, tym: 0 }];
  const res = await app.inject({ method: "POST", url: `/api/akce/${akce.id}/zapas`, cookies: { sid }, payload: { sestava } });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/přesně 8/);
});

it("admin, který není GM, nedostane cizí role ani v GET /api/akce", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  await setNastupce(zapas.id, "h1");
  await ulozRole(zapas.id, losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h1", () => 0), "rozeslano");
  const { sid } = await prihlasenyKlient(ROB, true);
  const telo = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } })).json();
  expect(telo.rezim.data.zapasy[0].role).toEqual([]);
  expect(telo.rezim.data.zapasy[0].nastupceHracId).toBe("h1");
});
```

(`VERZE` = objekt pro `ulozVerziScenare` s `rozbor: ROZBOR`, `data: Buffer.from("x")`, `minimapa: null`, `nahralHracId: "autor"`, `poznamka: null`, `chybaRozboru: null`; dejte ho do `testPomocnici.ts`, použijí ho i úkoly 9–10. `cookies: { sid }` kde `sid` je řetězec z `klient`.)

- [ ] **Step 4: `src/diplomacie/rezim.ts`**

```ts
import type { RezimAkce } from "../rezimy/index.js";
import { REZIM_SCENARIO, type NastaveniLobby } from "../shared/lobbyKontrola.js";
import { GM_BARVA } from "../shared/diplomacie/sestava.js";
import type { DiploData, ScenarVerze } from "../shared/diplomacie/typy.js";
import { redigujDiplo } from "../shared/diplomacie/viditelnost.js";
import { getAktivniVerze, getDiploZapas, getVerze, listDiploZapasy, listVerzi, zalozDiploZapas } from "./db.js";

/** Co z verzí scénáře patří do nastavení lobby akce (spec §5.5). */
export function nastaveniScenare(aktivni: ScenarVerze | null, vsechny: ScenarVerze[]): Pick<NastaveniLobby, "scenar" | "scenarStarsi"> {
  if (!aktivni) return { scenar: null, scenarStarsi: null };
  const starsi = vsechny.filter((v) => v.id !== aktivni.id && v.jmenoSouboru !== aktivni.jmenoSouboru).map((v) => v.jmenoSouboru);
  return { scenar: aktivni.jmenoSouboru, scenarStarsi: [...new Set(starsi)] };
}

export const diplomacie: RezimAkce = {
  id: "diplomacie",

  async vychoziNastaveniLobby(zaklad) {
    return {
      ...zaklad,
      // Spec §6.1 krok 1: scénář určuje mapu i velikost; diplomacie se mění
      // během hry (Lock Teams vypnuto); spojenci bez společné vize.
      rezim: REZIM_SCENARIO,
      mapaId: null,
      velikost: null,
      populace: 200,
      lockTeams: false,
      teamTogether: null,
      sharedExploration: false,
      cheaty: false,
      povolitDivaky: true,
      maxHracu: 8,
      ...nastaveniScenare(await getAktivniVerze(), await listVerzi()),
    };
  },

  async predZmenouSestavy(zapasId) {
    const d = await getDiploZapas(zapasId);
    if (d && d.stav !== "priprava") return "Role už jsou rozdané — nejdřív Zpět na výběr Nástupce.";
    return null;
  },

  async poVytvoreniZapasu(client, zapasId, sedadla) {
    // Kontrola sestavy šedou vynutila; kdyby tu chyběla, je to chyba kódu.
    if (!sedadla.some((s) => s.barva === GM_BARVA)) throw new Error("Zápas Diplomacie bez hráče na šedé.");
    await zalozDiploZapas(client, zapasId);
  },

  async doplnStav(akce) {
    const zapasy = await listDiploZapasy(akce.id);
    const verze: DiploData["verze"] = {};
    for (const id of new Set(zapasy.map((z) => z.scenarId).filter((id): id is number => id !== null))) {
      const v = await getVerze(id);
      if (v) verze[id] = v;
    }
    return { id: "diplomacie", data: { aktivni: await getAktivniVerze(), verze, zapasy } };
  },

  rediguj(rezim, divak) {
    return { ...rezim, data: redigujDiplo(rezim.data, divak.hracId) };
  },
};
```

`teamTogether: null` — u FFA na něm nezáleží; `NastaveniLobby.teamTogether` je `boolean | null`.

- [ ] **Step 5: Háčky v jádru**

`src/shared/types.ts` (import `DiploData` z `./diplomacie/typy.js`):

```ts
export interface AkceStavPayload {
  akce: AkceView | null;
  prihlaseni: PlayerView[];
  zapasy: ZapasView[];
  lhutaAktivityMinut?: number;
  /**
   * Data módu akce (spec §4.2). Tajná — `redigujProDivaka` je pro každého
   * diváka zaslepí přes `rezim.rediguj`, i pro admina.
   */
  rezim?: { id: "diplomacie"; data: DiploData };
}
```

`src/http/routes/events.ts` v `POST /api/akce` po `createAkce`:

```ts
      const akce = await createAkce(nazev.trim(), rezimId);
      const vychozi = await rezimAkce(rezimId).vychoziNastaveniLobby(VYCHOZI_NASTAVENI);
      if (rezimId !== "klasicky") await setNastaveniLobby(akce.id, vychozi);
```

(`rezimId = (rezim as RezimId | undefined) ?? "klasicky"`; klasická akce zůstává s prázdným JSON jako dosud, ať se dnešní chování nemění.)

`src/http/routes/matches.ts`: `prectiSestavu(telo: unknown, rezim: RezimId)` — místo `zkontrolujSestavu(vysledek)` volat `zkontrolujSestavuRezimu(rezim, vysledek)`. Volající:

```ts
  // POST /api/akce/:id/zapas
    const sestava = prectiSestavu(request.body, await rezimAkceId(akceId));
  // PUT /api/zapas/:id/sestava
    const rezim = await rezimZapasu(zapasId);
    const sestava = prectiSestavu(request.body, rezim);
    const proc = await rezimAkce(rezim).predZmenouSestavy(zapasId);
    if (proc) throw new HttpError(409, proc);
```

`src/db/matches.ts` v `createZapas` za `await vlozSedadla(client, zapas.id, seats, elo);`:

```ts
    // Háček módu v téže transakci: Diplomacie si založí svůj záznam, a když
    // selže, zápas nevznikne poloviční (spec §4.1 H6).
    const { rows: rezimRows } = await client.query<{ rezim: RezimId }>("SELECT rezim FROM akce WHERE id = $1", [akceId]);
    await rezimAkce(rezimRows[0]?.rezim ?? "klasicky").poVytvoreniZapasu(client, zapas.id, seats);
```

Pozor na cyklický import (`db/matches.ts` → `rezimy/index.ts` → `diplomacie/rezim.ts` → `diplomacie/db.ts` → `db/pool.ts`): žádný z nich `db/matches.ts` neimportuje, cyklus nevzniká. Ověří `npx tsc --noEmit` a běh testů.

`src/realtime/akceStav.ts` v `buildAkceStav` (s akcí):

```ts
  const rezim = await rezimAkce(akce.rezim).doplnStav(akce);
  return {
    akce: { … },
    lhutaAktivityMinut,
    prihlaseni: …,
    zapasy: …,
    ...(rezim ? { rezim } : {}),
  };
```

`src/realtime/redakce.ts` v `redigujProDivaka`:

```ts
export function redigujProDivaka(payload: AkceStavPayload, divak: Divak): AkceStavPayload {
  return {
    ...payload,
    akce: payload.akce && !divak.jeAdmin ? { ...payload.akce, pristiHeslo: "" } : payload.akce,
    zapasy: payload.zapasy.map((zapas) => redigujZapas(zapas, divak)),
    // Tajemství módu zaslepuje mód sám — a vždycky, i adminovi (spec §7).
    ...(payload.rezim ? { rezim: rezimAkce(payload.rezim.id).rediguj(payload.rezim, divak) } : {}),
  };
}
```

`web/src/views/Skladani.tsx:79`: prop `rezim: RezimId` (v `App.tsx` předat `akce.rezim ?? "klasicky"`) a `const chyba = zkontrolujSestavuRezimu(rezim, vstupy);`.

- [ ] **Step 6: Redakční test jádra**

Do `src/realtime/redakce.test.ts`:

```ts
it("větev módu se zaslepuje i adminovi", () => {
  const payload = { akce: null, prihlaseni: [], zapasy: [], rezim: { id: "diplomacie" as const, data: { aktivni: null, verze: {}, zapasy: [{ zapasId: 1, gmHracId: "gm", stav: "rozeslano" as const, nastupceHracId: "n", scenarId: null, role: [{ hracId: "k", role: "kat" as const, cilHracId: "x", upravenoPoRozeslani: false }] }] } } };
  expect(redigujProDivaka(payload, { hracId: "admin", jeAdmin: true }).rezim?.data.zapasy[0]?.role).toEqual([]);
  expect(redigujProDivaka(payload, { hracId: "gm", jeAdmin: false }).rezim?.data.zapasy[0]?.role).toHaveLength(1);
});
```

- [ ] **Step 7: Celá sada**

Run: `npm test && npm --prefix web test && npx tsc --noEmit && npm run build; echo EXIT=$?`, pak `npm run verze -- minor`, commit, push a `ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo`.
Expected: vše PASS včetně **všech dosavadních** DB testů (klasický mód beze změny), `EXIT=0`.

```bash
git add src/shared/rezimy.ts src/shared/rezimy.test.ts src/rezimy src/diplomacie/rezim.ts src/diplomacie/rezim.db.test.ts src/shared/types.ts src/http/routes/events.ts src/http/routes/matches.ts src/db/matches.ts src/realtime/akceStav.ts src/realtime/redakce.ts src/realtime/redakce.test.ts web/src/views/Skladani.tsx web/src/App.tsx package.json src/shared/verze.ts
git commit -m "Hook event modes into the core and plug in Diplomacy

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 9: API rolí pro GM

**Files:**
- Create: `src/diplomacie/routes.ts` (část rolí)
- Modify: `src/http/server.ts` (`ServerDeps`, `vychoziDeps`, registrace)
- Test: `src/diplomacie/routes.db.test.ts`

**Interfaces:**
- Consumes: `losujRole`, `zmenRoli`, `zmenCil` (úkol 4), db funkce (úkol 7), `GM_BARVA`, `broadcastAkce`, `requireUser`, `requireId`, `HttpError`.
- Produces: `registerDiplomacieRoutes(app: FastifyInstance, deps: DiploDeps): void`, `interface DiploDeps { rozeberScenar: typeof rozeberScenar }`, routy:
  - `POST /api/diplo/zapas/:id/nastupce` `{ hracId }`
  - `POST /api/diplo/zapas/:id/los`
  - `PUT /api/diplo/zapas/:id/role/:hracId` `{ role?: Role; cilHracId?: string; potvrzeno?: boolean }`
  - `POST /api/diplo/zapas/:id/rozeslat`
  - `POST /api/diplo/zapas/:id/zpet` `{ potvrzeno?: boolean }`
  - všechny vracejí `{ ok: true }`, stav jde přes SSE.

- [ ] **Step 1: Padající DB testy**

`src/diplomacie/routes.db.test.ts` (pomocníci z úkolů 7–8: `zapasOsmi("diplomacie")` → zápas s `h1`…`h8`, GM `h7`; `klient(hracId, admin)` → `sid`):

```ts
const HRACI = ["h1", "h2", "h3", "h4", "h5", "h6", "h8"];
const post = (url: string, sid: string, payload?: object) => app.inject({ method: "POST", url, cookies: { sid }, ...(payload ? { payload } : {}) });

it("jen GM zápasu smí losovat — admin-ne-GM i hráč dostanou 403", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const rob = await klient(ROB, true);
  const hrac = await klient("h1", false);
  expect((await post(`/api/diplo/zapas/${zapas.id}/nastupce`, rob, { hracId: "h1" })).statusCode).toBe(403);
  expect((await post(`/api/diplo/zapas/${zapas.id}/nastupce`, hrac, { hracId: "h1" })).statusCode).toBe(403);
});

it("celý průchod: Nástupce → los → úprava → rozeslání → úprava s potvrzením → zpět", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const u = `/api/diplo/zapas/${zapas.id}`;

  expect((await post(`${u}/los`, gm)).statusCode).toBe(409); // bez Nástupce
  expect((await post(`${u}/nastupce`, gm, { hracId: "h7" })).statusCode).toBe(400); // GM není hráč
  expect((await post(`${u}/nastupce`, gm, { hracId: "h3" })).statusCode).toBe(200);
  expect((await post(`${u}/los`, gm)).statusCode).toBe(200);

  const d = (await getDiploZapas(zapas.id))!;
  expect(d.stav).toBe("losovano");
  expect(d.role.map((r) => r.hracId).sort()).toEqual([...HRACI].sort());
  expect(d.role.find((r) => r.hracId === "h3")?.role).toBe("nastupce");

  const sasek = d.role.find((r) => r.role === "sasek")!.hracId;
  const zmena = await app.inject({ method: "PUT", url: `${u}/role/${sasek}`, cookies: { sid: gm }, payload: { role: "kat" } });
  expect(zmena.statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.role.find((r) => r.hracId === sasek)).toMatchObject({ role: "kat", upravenoPoRozeslani: false });

  expect((await post(`${u}/rozeslat`, gm)).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.stav).toBe("rozeslano");

  const bez = await app.inject({ method: "PUT", url: `${u}/role/${sasek}`, cookies: { sid: gm }, payload: { role: "sasek" } });
  expect(bez.statusCode).toBe(409);
  const s = await app.inject({ method: "PUT", url: `${u}/role/${sasek}`, cookies: { sid: gm }, payload: { role: "sasek", potvrzeno: true } });
  expect(s.statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.role.find((r) => r.hracId === sasek)).toMatchObject({ role: "sasek", cilHracId: null, upravenoPoRozeslani: true });

  expect((await post(`${u}/zpet`, gm)).statusCode).toBe(409);
  expect((await post(`${u}/zpet`, gm, { potvrzeno: true })).statusCode).toBe(200);
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "priprava", nastupceHracId: null, role: [] });
});

it("nepovolený cíl a neznámá role jsou 400", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const u = `/api/diplo/zapas/${zapas.id}`;
  await post(`${u}/nastupce`, gm, { hracId: "h1" });
  await post(`${u}/los`, gm);
  const kat = (await getDiploZapas(zapas.id))!.role.find((r) => r.role === "kat")!.hracId;
  expect((await app.inject({ method: "PUT", url: `${u}/role/${kat}`, cookies: { sid: gm }, payload: { cilHracId: "h1" } })).statusCode).toBe(400);
  expect((await app.inject({ method: "PUT", url: `${u}/role/${kat}`, cookies: { sid: gm }, payload: { role: "cisar" } })).statusCode).toBe(400);
});

it("změna sestavy po losu je 409, v přípravě projde", async () => {
  const { zapas, sestava } = await zapasOsmi("diplomacie");
  const rob = await klient(ROB, true);
  const gm = await klient("h7", false);
  const put = () => app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/sestava`, cookies: { sid: rob }, payload: { sestava } });
  expect((await put()).statusCode).toBe(200);
  await post(`/api/diplo/zapas/${zapas.id}/nastupce`, gm, { hracId: "h1" });
  await post(`/api/diplo/zapas/${zapas.id}/los`, gm);
  const res = await put();
  expect(res.statusCode).toBe(409);
  expect(res.json().chyba).toBe("Role už jsou rozdané — nejdřív Zpět na výběr Nástupce.");
});

it("zápas mimo Diplomacii je 404", async () => {
  const { zapas } = await zapasOsmi("klasicky");
  const gm = await klient("h7", false);
  expect((await post(`/api/diplo/zapas/${zapas.id}/los`, gm)).statusCode).toBe(404);
});
```

(`zapasOsmi` vrací i `sestava`, kterou zápas založil. Pro klasickou akci sestava 8 lidí projde i jádrem.)

- [ ] **Step 2: Implementace**

`src/diplomacie/routes.ts`:

```ts
import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getZapas } from "../db/matches.js";
import { HttpError, requireId, requireUser } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { losujRole, zmenCil, zmenRoli } from "../shared/diplomacie/los.js";
import type { DiploZapas, Role } from "../shared/diplomacie/typy.js";
import type { rozeberScenar } from "./rozbor.js";
import { getDiploZapas, setNastupce, setStavDiplo, ulozRole, upravRoli, vratNaPripravu } from "./db.js";

export interface DiploDeps {
  rozeberScenar: typeof rozeberScenar;
}

const ROLE: readonly Role[] = ["garda", "najezdnik", "sasek", "zoldak", "kat"];

/** Přihlášený musí být GM tohoto zápasu Diplomacie; admin výjimku nemá (spec §6.3). */
async function requireGm(request: FastifyRequest): Promise<{ diplo: DiploZapas; hraci: string[] }> {
  const hracId = await requireUser(request);
  const zapasId = requireId(request);
  const diplo = await getDiploZapas(zapasId);
  if (!diplo) throw new HttpError(404, "Tohle není zápas Diplomacie.");
  if (diplo.gmHracId !== hracId) throw new HttpError(403, "Tohle smí jen GM tohoto zápasu.");
  const zaznam = await getZapas(zapasId);
  // Hráči v pořadí slotů, bez GM — mezi ně se rozdávají role.
  const hraci = (zaznam?.ucastnici ?? []).filter((u) => u.hracId !== diplo.gmHracId).map((u) => u.hracId);
  return { diplo, hraci };
}

const potvrzeno = (request: FastifyRequest) => (request.body as { potvrzeno?: unknown } | null)?.potvrzeno === true;

function chybaPravidla<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Neplatná úprava.");
  }
}

export function registerDiplomacieRoutes(app: FastifyInstance, deps: DiploDeps): void {
  app.post("/api/diplo/zapas/:id/nastupce", async (request) => {
    const { diplo, hraci } = await requireGm(request);
    if (diplo.stav !== "priprava") throw new HttpError(409, "Nástupce se vybírá jen v přípravě — nejdřív Zpět na výběr Nástupce.");
    const { hracId } = (request.body ?? {}) as { hracId?: unknown };
    if (typeof hracId !== "string" || !hraci.includes(hracId)) throw new HttpError(400, "Nástupcem může být jen hráč zápasu (ne GM).");
    await setNastupce(diplo.zapasId, hracId);
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/los", async (request) => {
    const { diplo, hraci } = await requireGm(request);
    if (diplo.stav === "rozeslano") throw new HttpError(409, "Role už jsou rozeslané — přelosovat jde jen před rozesláním.");
    if (diplo.nastupceHracId === null) throw new HttpError(409, "Nejdřív vyber Nástupce.");
    const role = chybaPravidla(() => losujRole(hraci, diplo.nastupceHracId!, randomInt));
    await ulozRole(diplo.zapasId, role, "losovano");
    await broadcastAkce();
    return { ok: true };
  });

  app.put("/api/diplo/zapas/:id/role/:hracId", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav === "priprava") throw new HttpError(409, "Role ještě nejsou vylosované.");
    if (diplo.stav === "rozeslano" && !potvrzeno(request)) throw new HttpError(409, "Role už hráči vidí — změnu je potřeba potvrdit.");
    const { hracId } = request.params as { hracId: string };
    const telo = (request.body ?? {}) as { role?: unknown; cilHracId?: unknown };
    let role = diplo.role;
    if (telo.role !== undefined) {
      if (!ROLE.includes(telo.role as Role)) throw new HttpError(400, "Neznámá role.");
      role = chybaPravidla(() => zmenRoli(role, hracId, telo.role as Role, diplo.nastupceHracId!, randomInt));
    }
    if (telo.cilHracId !== undefined) {
      if (typeof telo.cilHracId !== "string") throw new HttpError(400, "Cíl musí být hráč.");
      role = chybaPravidla(() => zmenCil(role, hracId, telo.cilHracId as string, diplo.nastupceHracId!));
    }
    const nova = role.find((r) => r.hracId === hracId);
    if (!nova) throw new HttpError(404, "Takový hráč v zápase není.");
    await upravRoli(diplo.zapasId, { ...nova, upravenoPoRozeslani: diplo.stav === "rozeslano" || nova.upravenoPoRozeslani });
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/rozeslat", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav !== "losovano") throw new HttpError(409, "Rozeslat jde jen vylosované role.");
    await setStavDiplo(diplo.zapasId, "rozeslano");
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/zpet", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav === "priprava") return { ok: true };
    if (diplo.stav === "rozeslano" && !potvrzeno(request)) throw new HttpError(409, "Role už hráči vidí — návrat je potřeba potvrdit.");
    await vratNaPripravu(diplo.zapasId);
    await broadcastAkce();
    return { ok: true };
  });

  registerScenarRoutes(app, deps);
}
```

`registerScenarRoutes` přibude v úkolu 10; do té doby v tomto úkolu napsat prázdnou `function registerScenarRoutes(_app: FastifyInstance, _deps: DiploDeps): void {}` na konec souboru — úkol 10 ji naplní (není to zástupný kód: v tomhle úkolu žádné routy scénáře nejsou a test na ně neexistuje).

`src/http/server.ts`: `export type ServerDeps = AuthDeps & MatchDeps & MicrosoftDeps & DiploDeps;`, ve `vychoziDeps()` přidat `rozeberScenar: (soubor, volby) => rozeberScenar(soubor, volby),` a v `buildServer` za `registerEmotyRoutes(app);` přidat `registerDiplomacieRoutes(app, deps);`.

- [ ] **Step 3: Testy**

```bash
npx tsc --noEmit && npm test
npm run verze -- minor
git add src/diplomacie/routes.ts src/diplomacie/routes.db.test.ts src/http/server.ts package.json src/shared/verze.ts
git commit -m "Let the GM pick the successor, draw, edit and send out roles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push && ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo
```

Expected: PASS.

---

## Úkol 10: Verze scénáře přes web

**Files:**
- Modify: `src/diplomacie/routes.ts` (`registerScenarRoutes`)
- Modify: `src/config.ts` (`autoriScenare`), `src/auth/routes.ts` (`GET /api/me` → `smiNahratScenar`)
- Modify: `web/src/api.ts` (`Me.smiNahratScenar`)
- Test: `src/diplomacie/scenar.db.test.ts`

**Interfaces:**
- Consumes: `rozeberScenar`, `jeHlavickaScenare` (úkol 5), db verzí (úkol 7), `nastaveniScenare` (úkol 8), `jePlatneJmenoScenare` (úkol 2).
- Produces: `config.autoriScenare: string[]`; `smiNahratScenar(hracId: string | null): Promise<boolean>` v `src/diplomacie/routes.ts`; routy dle spec §5.3; `Me.smiNahratScenar?: boolean`.

- [ ] **Step 1: Padající DB testy**

`src/diplomacie/scenar.db.test.ts` (`buildServer({ rozeberScenar: podvrh })`, kde `podvrh` vrací `{ ok: true, rozbor: ROZBOR, minimapa: Buffer.from("RIFF0000WEBP") }`, nebo pro vadný soubor `{ ok: false, chyba: "ValueError: x" }`; `LLC` = začátek fixtury `src/diplomacie/fixtures/LLC.aoe2scenario`; `vi.stubEnv("AUTORI_SCENARE", "jin")`):

```ts
const nahraj = (sid: string | undefined, data: Buffer, jmeno = "LLC v1.aoe2scenario", poznamka?: string) =>
  app.inject({
    method: "POST",
    url: "/api/diplo/scenar",
    cookies: sid ? { sid } : {},
    headers: { "content-type": "application/octet-stream", "x-jmeno-souboru": encodeURIComponent(jmeno), ...(poznamka ? { "x-poznamka": encodeURIComponent(poznamka) } : {}) },
    payload: data,
  });

it("autor nahraje, první verze se aktivuje, stažení vrátí přesně ty bajty", async () => {
  const jin = await klient("jin", false);
  const res = await nahraj(jin, LLC, "Diplomacie LLC v1.aoe2scenario", "první");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ aktivni: true, chybaRozboru: null });
  const id = res.json().id;
  const stazeni = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` });
  expect(stazeni.rawPayload.equals(LLC)).toBe(true);
  expect(stazeni.headers["content-disposition"]).toBe(`attachment; filename*=UTF-8''${encodeURIComponent("Diplomacie LLC v1.aoe2scenario")}`);
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar/aktivni/soubor" })).rawPayload.equals(LLC)).toBe(true);
  const mapa = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/minimapa.webp` });
  expect(mapa.headers["content-type"]).toBe("image/webp");
  expect(mapa.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
});

it("cizí hráč 403, nepřihlášený 401, špatné jméno a hlavička 400, duplicita 409", async () => {
  const hrac = await klient("h1", false);
  const jin = await klient("jin", false);
  expect((await nahraj(hrac, LLC)).statusCode).toBe(403);
  expect((await nahraj(undefined, LLC)).statusCode).toBe(401);
  expect((await nahraj(jin, LLC, "x.txt")).statusCode).toBe(400);
  expect((await nahraj(jin, Buffer.from("\x89PNG\r\n\x1a\n0000"))).statusCode).toBe(400);
  expect((await nahraj(jin, LLC)).statusCode).toBe(200);
  const dup = await nahraj(jin, LLC, "jine.aoe2scenario");
  expect(dup.statusCode).toBe(409);
  expect(dup.json().chyba).toMatch(/už je nahraná \(č\. \d+\)/);
});

it("nečitelná verze se uloží s chybou a nejde aktivovat", async () => {
  const jin = await klient("jin", false);
  podvrhSelze = true;
  const res = await nahraj(jin, LLC);
  expect(res.json()).toMatchObject({ aktivni: false, chybaRozboru: "ValueError: x" });
  expect((await app.inject({ method: "POST", url: `/api/diplo/scenar/${res.json().id}/aktivni`, cookies: { sid: jin } })).statusCode).toBe(409);
});

it("aktivace přepíše scénář v nastavení běžící akce Diplomacie", async () => {
  const jin = await klient("jin", false);
  const rob = await klient(ROB, true);
  const v1 = (await nahraj(jin, LLC, "LLC v1.aoe2scenario")).json().id;
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid: rob }, payload: { nazev: "D", rezim: "diplomacie" } });
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("x")]), "LLC v2.aoe2scenario")).json().id;
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "LLC v1.aoe2scenario" });
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2}/aktivni`, cookies: { sid: jin } });
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "LLC v2.aoe2scenario", scenarStarsi: ["LLC v1.aoe2scenario"], rezim: 3 });
  expect(v1).toBeLessThan(v2);
});

it("/api/me řekne, kdo smí nahrávat", async () => {
  expect((await app.inject({ method: "GET", url: "/api/me", cookies: { sid: await klient("jin", false) } })).json().smiNahratScenar).toBe(true);
  expect((await app.inject({ method: "GET", url: "/api/me", cookies: { sid: await klient("h1", false) } })).json().smiNahratScenar).toBe(false);
  expect((await app.inject({ method: "GET", url: "/api/me", cookies: { sid: await klient(ROB, true) } })).json().smiNahratScenar).toBe(true);
});
```

(`podvrhSelze` je `let` proměnná v testu, kterou `podvrh` čte; `beforeEach` ji vrací na `false`.)

- [ ] **Step 2: Konfigurace a `/api/me`**

`src/config.ts` vedle `adminHracIds`:

```ts
  /**
   * Autoři scénáře Diplomacie (spec §5.1): smí nahrávat verze, i když
   * nejsou admini. Stejný tvar jako ADMIN_STEAM_ID.
   */
  get autoriScenare(): string[] {
    return (process.env["AUTORI_SCENARE"] ?? "")
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter((id) => id !== "");
  },
```

`src/auth/routes.ts` v `GET /api/me`: všechny tři `return { hrac: …, maMicrosoft }` doplnit o `smiNahratScenar: await smiNahratScenar(hracId)` (pro nepřihlášeného `false`). `smiNahratScenar` importovat z `src/diplomacie/routes.ts`. `web/src/api.ts` do `Me`: `/** Admin nebo autor scénáře Diplomacie (AUTORI_SCENARE). */ smiNahratScenar?: boolean;`.

- [ ] **Step 3: Routy scénáře**

V `src/diplomacie/routes.ts` nahradit prázdnou `registerScenarRoutes`:

```ts
import { createHash } from "node:crypto";
import { config } from "../config.js";
import { getAktivniAkce, setNastaveniLobby } from "../db/events.js";
import { getPlayer } from "../db/players.js";
import { jePlatneJmenoScenare } from "../shared/lobbyKontrola.js";
import { jeHlavickaScenare } from "./rozbor.js";
import { aktivujVerzi, getAktivniVerze, getMinimapuVerze, getSouborVerze, getVerze, listVerzi, najdiVerziPodleSha, ulozVerziScenare } from "./db.js";
import { nastaveniScenare } from "./rezim.js";

const MAX_VELIKOST = 5 * 1024 * 1024;

export async function smiNahratScenar(hracId: string | null): Promise<boolean> {
  if (hracId === null) return false;
  if (config.autoriScenare.includes(hracId)) return true;
  return (await getPlayer(hracId))?.jeAdmin ?? false;
}

async function requireAutorScenare(request: FastifyRequest): Promise<string> {
  const hracId = await requireUser(request);
  if (!(await smiNahratScenar(hracId))) throw new HttpError(403, "Scénář smí nahrávat jen admin nebo autor scénáře.");
  return hracId;
}

/** Hlavička s textem (jméno, poznámka) chodí URL-kódovaná kvůli diakritice. */
function hlavicka(request: FastifyRequest, jmeno: string): string | null {
  const h = request.headers[jmeno];
  if (typeof h !== "string" || h === "") return null;
  try {
    return decodeURIComponent(h);
  } catch {
    throw new HttpError(400, `Hlavička ${jmeno} není platně zakódovaná.`);
  }
}

/** Běžící akce Diplomacie hlídá v lobby vždy aktivní verzi (spec §5.5). */
async function promitniDoAkce(): Promise<void> {
  const akce = await getAktivniAkce();
  if (!akce || akce.rezim !== "diplomacie") return;
  await setNastaveniLobby(akce.id, { ...akce.nastaveniLobby, ...nastaveniScenare(await getAktivniVerze(), await listVerzi()) });
}

function idVerze(request: FastifyRequest): number {
  return requireId(request);
}

function registerScenarRoutes(app: FastifyInstance, deps: DiploDeps): void {
  app.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_VELIKOST }, (_req, telo, hotovo) => hotovo(null, telo));

  app.get("/api/diplo/scenar", async () => ({ verze: await listVerzi() }));

  app.post("/api/diplo/scenar", { bodyLimit: MAX_VELIKOST }, async (request) => {
    const hracId = await requireAutorScenare(request);
    const jmeno = hlavicka(request, "x-jmeno-souboru");
    if (jmeno === null || !jePlatneJmenoScenare(jmeno)) throw new HttpError(400, "Soubor musí být .aoe2scenario a jméno bez cesty (nejvýš 100 znaků).");
    const data = request.body;
    if (!Buffer.isBuffer(data) || !jeHlavickaScenare(data)) throw new HttpError(400, "Tohle není scénář AoE2 DE.");
    const sha256 = createHash("sha256").update(data).digest("hex");
    const existujici = await najdiVerziPodleSha(sha256);
    if (existujici !== null) throw new HttpError(409, `Tahle verze už je nahraná (č. ${existujici}).`);
    const vysledek = await deps.rozeberScenar(data);
    const { id, aktivovana } = await ulozVerziScenare({
      jmenoSouboru: jmeno,
      sha256,
      data,
      rozbor: vysledek.ok ? vysledek.rozbor : null,
      chybaRozboru: vysledek.ok ? null : vysledek.chyba,
      minimapa: vysledek.ok ? vysledek.minimapa : null,
      nahralHracId: hracId,
      poznamka: hlavicka(request, "x-poznamka"),
    });
    if (aktivovana) await promitniDoAkce();
    await broadcastAkce();
    return { id, aktivni: aktivovana, chybaRozboru: vysledek.ok ? null : vysledek.chyba };
  });

  app.post("/api/diplo/scenar/:id/aktivni", async (request) => {
    await requireAutorScenare(request);
    const verze = await getVerze(idVerze(request));
    if (!verze) throw new HttpError(404, "Taková verze není.");
    if (verze.rozbor === null) throw new HttpError(409, "Verze bez rozboru se nedá aktivovat.");
    await aktivujVerzi(verze.id);
    await promitniDoAkce();
    await broadcastAkce();
    return { ok: true };
  });

  const posliSoubor = (reply: Parameters<Parameters<FastifyInstance["get"]>[1]>[1], soubor: { jmenoSouboru: string; data: Buffer }) =>
    reply
      .header("content-type", "application/octet-stream")
      .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(soubor.jmenoSouboru)}`)
      .send(soubor.data);

  app.get("/api/diplo/scenar/aktivni/soubor", async (_request, reply) => {
    const aktivni = await getAktivniVerze();
    const soubor = aktivni ? await getSouborVerze(aktivni.id) : null;
    if (!soubor) throw new HttpError(404, "Scénář zatím nikdo nenahrál.");
    return posliSoubor(reply, soubor);
  });

  app.get("/api/diplo/scenar/:id/soubor", async (request, reply) => {
    const soubor = await getSouborVerze(idVerze(request));
    if (!soubor) throw new HttpError(404, "Taková verze není.");
    return posliSoubor(reply, soubor);
  });

  app.get("/api/diplo/scenar/:id/minimapa.webp", async (request, reply) => {
    const mapa = await getMinimapuVerze(idVerze(request));
    if (!mapa) throw new HttpError(404, "Tahle verze minimapu nemá.");
    // Obsah verze se nikdy nemění — prohlížeč si ji smí pamatovat napořád.
    return reply.header("content-type", "image/webp").header("cache-control", "public, max-age=31536000, immutable").send(mapa);
  });
}
```

Fastify zpracuje cestu `/api/diplo/scenar/aktivni/soubor` dřív než `/:id/soubor` (statický segment má přednost), takže `aktivni` se nikdy nečte jako id.

- [ ] **Step 4: Testy, verze, commit**

```bash
npx tsc --noEmit && npm test && npm --prefix web test
npm run verze -- minor
git add src/diplomacie/routes.ts src/diplomacie/scenar.db.test.ts src/config.ts src/auth/routes.ts web/src/api.ts package.json src/shared/verze.ts
git commit -m "Upload, parse, activate and download scenario versions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push && ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo
```

Expected: PASS. Pak doplnit `AUTORI_SCENARE` do `docs/nasazeni-jouki-cz.md` §3.6 (sloupec diplo: „Jinovo `hrac_id` po prvním přihlášení“).

---

## Úkol 11: Klient módů, místa pro doplňky a zakrytí

**Files:**
- Create: `web/src/diplomacie/api.ts`, `web/src/diplomacie/Zakryti.tsx`, `web/src/rezimy/index.tsx`, `web/src/diplomacie/index.tsx`
- Modify: `web/src/views/KartaHrace.tsx`, `ObrazovkaHosta.tsx`, `VerejnyZapas.tsx`, `Skladani.tsx` (props `doplnek`, `doplnekKroku`, `popisSlotu`), `web/src/App.tsx`
- Test: `web/src/diplomacie/Zakryti.test.tsx`, `web/src/views/KartaHrace.test.tsx` (doplněk)

**Interfaces:**
- Consumes: `AkceStavPayload.rezim` (úkol 8), routy úkolů 9–10.
- Produces:
  - `diploApi` (`web/src/diplomacie/api.ts`): `nastupce(zapasId, hracId)`, `los(zapasId)`, `role(zapasId, hracId, zmena: { role?: Role; cilHracId?: string; potvrzeno?: boolean })`, `rozeslat(zapasId)`, `zpet(zapasId, potvrzeno: boolean)`, `verze(): Promise<{ verze: ScenarVerze[] }>`, `nahrat(soubor: File, poznamka: string): Promise<{ id: number; aktivni: boolean; chybaRozboru: string | null }>`, `aktivovat(id)`, `souborUrl(id: number | "aktivni"): string`, `minimapaUrl(id: number): string`
  - `Zakryti({ popisek, children, rub? }: { popisek: string; children: ReactNode; rub?: ReactNode })`
  - `interface RezimKlienta { kartaHrace?(p: KontextZapasu): ReactNode; krokHosta?(p: KontextZapasu): ReactNode; verejnyZapas?(p: KontextZapasu): ReactNode; popisSlotu?(barva: Barva): string | null }`, `type Hlidej = (akce: () => Promise<unknown>) => Promise<void>`, `interface KontextZapasu { zapas: ZapasView; stav: AkceStavPayload; ja: string | null; hlidej: Hlidej }`, `rezimKlienta(id: RezimId | undefined): RezimKlienta`
  - props: `KartaHrace.doplnek?: ReactNode`, `ObrazovkaHosta.doplnek?: ReactNode`, `ObrazovkaHosta.doplnekKroku?: ReactNode`, `VerejnyZapas.doplnek?: ReactNode`, `Skladani.popisSlotu?: (barva: Barva) => string | null`

- [ ] **Step 1: Zakrytí (padající test)**

`web/src/diplomacie/Zakryti.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Zakryti } from "./Zakryti.js";

it("je zakryté, kliknutí odkryje, další zakryje", () => {
  render(<Zakryti popisek="Tvá tajná role — klikni pro odkrytí"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role — klikni pro odkrytí" }));
  expect(screen.getByText("KAT")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zakrýt" }));
  expect(screen.queryByText("KAT")).toBeNull();
});

it("nový mount (obnovení stránky) začíná zakrytý", () => {
  const { unmount } = render(<Zakryti popisek="Odkrýt"><p>KAT</p></Zakryti>);
  fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
  unmount();
  render(<Zakryti popisek="Odkrýt"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
});
```

`web/src/diplomacie/Zakryti.tsx`:

```tsx
import { useState, type ReactNode } from "react";

/**
 * Tajný obsah, ve výchozím stavu zakrytý (spec §1.1 bod 8). Stav je jen
 * v paměti komponenty — po obnovení stránky je karta zase zakrytá, ať si ji
 * streamer neprozradí tím, že stránku znovu načte.
 */
export function Zakryti({ popisek, children, rub }: { popisek: string; children: ReactNode; rub?: ReactNode }) {
  const [odkryto, setOdkryto] = useState(false);
  return (
    <div className={odkryto ? "zakryti odkryto" : "zakryti"} data-testid="zakryti">
      <button type="button" className="zakryti-tlacitko" aria-expanded={odkryto} onClick={() => setOdkryto(!odkryto)}>
        {odkryto ? "Zakrýt" : popisek}
      </button>
      {odkryto ? children : rub ?? null}
    </div>
  );
}
```

Run: `npm --prefix web test -- Zakryti` → PASS.

- [ ] **Step 2: API klienta Diplomacie**

`web/src/diplomacie/api.ts`:

```ts
import type { Role, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { cesta } from "../cesty.js";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const telo = (await res.json().catch(() => ({ chyba: "Neznámá chyba." }))) as { chyba?: string };
    throw new Error(telo.chyba ?? `Server odpověděl ${res.status}.`);
  }
  return (await res.json()) as T;
}
const post = (url: string, telo?: object) =>
  fetch(cesta(url), { method: "POST", headers: telo ? { "content-type": "application/json" } : {}, body: telo ? JSON.stringify(telo) : undefined }).then((r) => json<{ ok: true }>(r));

export const diploApi = {
  nastupce: (zapasId: number, hracId: string) => post(`/api/diplo/zapas/${zapasId}/nastupce`, { hracId }),
  los: (zapasId: number) => post(`/api/diplo/zapas/${zapasId}/los`),
  role: (zapasId: number, hracId: string, zmena: { role?: Role; cilHracId?: string; potvrzeno?: boolean }) =>
    fetch(cesta(`/api/diplo/zapas/${zapasId}/role/${encodeURIComponent(hracId)}`), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(zmena) }).then((r) => json<{ ok: true }>(r)),
  rozeslat: (zapasId: number) => post(`/api/diplo/zapas/${zapasId}/rozeslat`),
  zpet: (zapasId: number, potvrzeno: boolean) => post(`/api/diplo/zapas/${zapasId}/zpet`, { potvrzeno }),
  verze: () => fetch(cesta("/api/diplo/scenar")).then((r) => json<{ verze: ScenarVerze[] }>(r)),
  nahrat: (soubor: File, poznamka: string) =>
    fetch(cesta("/api/diplo/scenar"), {
      method: "POST",
      headers: { "content-type": "application/octet-stream", "x-jmeno-souboru": encodeURIComponent(soubor.name), ...(poznamka ? { "x-poznamka": encodeURIComponent(poznamka) } : {}) },
      body: soubor,
    }).then((r) => json<{ id: number; aktivni: boolean; chybaRozboru: string | null }>(r)),
  aktivovat: (id: number) => post(`/api/diplo/scenar/${id}/aktivni`),
  souborUrl: (id: number | "aktivni") => cesta(`/api/diplo/scenar/${id}/soubor`),
  minimapaUrl: (id: number) => cesta(`/api/diplo/scenar/${id}/minimapa.webp`),
};
```

(`json` je stejný jako v `web/src/api.ts`. DRY: exportovat ho z `web/src/api.ts` (`export async function json…`) a tady importovat, místo kopie.)

- [ ] **Step 3: Místa pro doplňky v jádru (H9)**

- `KartaHrace.tsx`: prop `/** Doplněk módu akce (např. karta role Diplomacie), pod kontrolou lobby. */ doplnek?: ReactNode;` a vykreslit `{doplnek}` hned za blokem `KontrolaLobby` (před `strany-zapasu`).
- `ObrazovkaHosta.tsx`: totéž `doplnek` na stejném místě a navíc `doplnekKroku?: ReactNode` vykreslený na konci sekce „Zakládáš!“ (stažení scénáře).
- `VerejnyZapas.tsx`: `doplnek?: ReactNode` za `.strany` (nový `<br />` + `{doplnek}`).
- `Skladani.tsx`: `popisSlotu?: (barva: Barva) => string | null` — u řádku s barvou, kde vrátí text, ukázat malý štítek `<span className="popis-slotu">{text}</span>` za výběrem barvy.

Test do `web/src/views/KartaHrace.test.tsx`:

```tsx
it("doplněk módu se vykreslí na kartě", () => {
  render(<KartaHrace {...zakladKarty} doplnek={<p>KARTA ROLE</p>} />);
  expect(screen.getByText("KARTA ROLE")).toBeTruthy();
});
```

(`zakladKarty` = props, které existující testy souboru už používají.)

- [ ] **Step 4: Seznam módů na klientovi**

`web/src/rezimy/index.tsx`:

```tsx
import type { ReactNode } from "react";
import type { AkceStavPayload, Barva, RezimId, ZapasView } from "../../../src/shared/types.js";
import { diplomacieKlient } from "../diplomacie/index.js";

/** `hlidej` z App.tsx: spustí akci, chybu ukáže uživateli a dočte stav. */
export type Hlidej = (akce: () => Promise<unknown>) => Promise<void>;

export interface KontextZapasu {
  zapas: ZapasView;
  stav: AkceStavPayload;
  ja: string | null;
  hlidej: Hlidej;
}

/** Co mód přidá do obrazovek jádra (spec §4.1 H9). Klasický večer nic. */
export interface RezimKlienta {
  kartaHrace?(p: KontextZapasu): ReactNode;
  krokHosta?(p: KontextZapasu): ReactNode;
  verejnyZapas?(p: KontextZapasu): ReactNode;
  popisSlotu?(barva: Barva): string | null;
}

const KLIENTI: Record<RezimId, RezimKlienta> = { klasicky: {}, diplomacie: diplomacieKlient };

export function rezimKlienta(id: RezimId | undefined): RezimKlienta {
  return KLIENTI[id ?? "klasicky"];
}
```

`web/src/diplomacie/index.tsx` v tomto úkolu:

```tsx
import type { RezimKlienta } from "../rezimy/index.js";
import { GM_BARVA } from "../../../src/shared/diplomacie/sestava.js";

/** Diplomacie na obrazovkách jádra; komponenty přibývají v úkolech 12–15. */
export const diplomacieKlient: RezimKlienta = {
  popisSlotu: (barva) => (barva === GM_BARVA ? "GM" : null),
};
```

`web/src/App.tsx`: `const rk = rezimKlienta(akce?.rezim);` a předat:
- `Skladani`: `popisSlotu={rk.popisSlotu}`
- `ObrazovkaHosta`: `doplnek={rk.kartaHrace?.({ zapas, stav, ja: me.hracId, hlidej })}`, `doplnekKroku={rk.krokHosta?.({ zapas, stav, ja: me.hracId, hlidej })}`
- `KartaHrace`: `doplnek={rk.kartaHrace?.({ zapas, stav, ja: me.hracId, hlidej })}`
- `VerejnyZapas`: `doplnek={stav ? rk.verejnyZapas?.({ zapas, stav, ja: me?.hracId ?? null, hlidej }) : null}`

(`stav` je `AkceStavPayload` z `useAkceStav`; kde je v App `stav` možná `null`, předat jen když existuje.)

- [ ] **Step 5: Testy a commit**

```bash
npm --prefix web test && npm test && npm run build; echo EXIT=$?
npm run verze
git add web/src package.json src/shared/verze.ts
git commit -m "Give modes slots on the core screens and add the cover

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 12: Minimapa scénáře

**Files:**
- Create: `web/src/diplomacie/MapaScenare.tsx`, `web/src/diplomacie/MapaScenare.test.tsx`

**Interfaces:**
- Consumes: `ScenarVerze` (úkol 4), `diploApi.minimapaUrl` (úkol 11).
- Produces: `MapaScenare({ verze, starty, jmena, velikost }: { verze: ScenarVerze; starty: "zadne" | "vsechny" | Barva; jmena?: Partial<Record<Barva, string>>; velikost?: "mala" | "velka" })`

- [ ] **Step 1: Padající test**

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import { MapaScenare } from "./MapaScenare.js";

const verze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null };

it("bez startů jen obrázek", () => {
  render(<MapaScenare verze={verze} starty="zadne" />);
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" }).getAttribute("src")).toMatch(/\/api\/diplo\/scenar\/3\/minimapa\.webp$/);
  expect(screen.queryAllByTestId("start")).toHaveLength(0);
});
it("všechny starty se jmény pro GM", () => {
  render(<MapaScenare verze={verze} starty="vsechny" jmena={{ 1: "Rob" }} />);
  expect(screen.getAllByTestId("start")).toHaveLength(7);
  expect(screen.getByText("Rob")).toBeTruthy();
});
it("hráč vidí jen svůj start", () => {
  render(<MapaScenare verze={verze} starty={3} />);
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(screen.getByText("Tady začínáš")).toBeTruthy();
});
it("verze bez rozboru nic nevykreslí", () => {
  const { container } = render(<MapaScenare verze={{ ...verze, rozbor: null }} starty="zadne" />);
  expect(container.innerHTML).toBe("");
});
```

- [ ] **Step 2: Implementace**

```tsx
import { BARVA_NAZEV, type Barva } from "../../../src/shared/types.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { diploApi } from "./api.js";

interface Props {
  verze: ScenarVerze;
  /** Kterou pozici ukázat: žádnou (nastavení lobby), všechny (GM), nebo jen svou (hráč). */
  starty: "zadne" | "vsechny" | Barva;
  jmena?: Partial<Record<Barva, string>>;
  velikost?: "mala" | "velka";
}

/**
 * Minimapa scénáře z rozboru (spec §5.4). Obrázek je jeden pro všechny,
 * starty jsou překryv — souřadnice 0–1 z rozboru, takže sedí při každé
 * velikosti. Barvy značek jsou třídy `barva-N` z palety, ne čísla napevno.
 */
export function MapaScenare({ verze, starty, jmena = {}, velikost = "mala" }: Props) {
  if (!verze.rozbor) return null;
  const viditelne = verze.rozbor.starty.filter((s) => starty === "vsechny" || s.barva === starty);
  return (
    <figure className={`mapa-scenare ${velikost}`}>
      <img src={diploApi.minimapaUrl(verze.id)} alt={`Mapa scénáře ${verze.jmenoSouboru}`} width={verze.rozbor.minimapa.sirka} height={verze.rozbor.minimapa.vyska} />
      {starty === "zadne"
        ? null
        : viditelne.map((s) => (
            <span key={s.barva} data-testid="start" className={`start barva-${s.barva}`} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} title={BARVA_NAZEV[s.barva]}>
              <span className="popisek">{starty === "vsechny" ? (jmena[s.barva] ?? BARVA_NAZEV[s.barva]) : "Tady začínáš"}</span>
            </span>
          ))}
    </figure>
  );
}
```

CSS: `.mapa-scenare { position: relative; }`, `img { width: 100%; height: auto; }`, `.start { position: absolute; transform: translate(-50%, -50%); }` s kolečkem v barvě hráče přes existující třídy `barva-N` (ty už web má pro karty — použít jejich proměnné), `.mala`/`.velka` šířky z proměnných.

- [ ] **Step 3: Testy a commit**

```bash
npm --prefix web test -- MapaScenare
npm run verze
git add web/src/diplomacie/MapaScenare.tsx web/src/diplomacie/MapaScenare.test.tsx web/src/*.css package.json src/shared/verze.ts
git commit -m "Show the scenario minimap with start positions

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 13: Karta role, pravidla a veřejný řádek

**Files:**
- Create: `web/src/diplomacie/KartaRole.tsx`, `PravidlaHry.tsx`, `VerejnyRadek.tsx` (+ testy `KartaRole.test.tsx`, `PravidlaHry.test.tsx`)
- Modify: `web/src/diplomacie/index.tsx` (`kartaHrace`, `verejnyZapas`)

**Interfaces:**
- Consumes: `DiploData`, `NAZEV_ROLE`, `POPIS_ROLE`, `Zakryti`, `MapaScenare`, `prehraj` (`web/src/zvuk.ts`), `zvon.mp3`.
- Produces: `KartaRole({ zapas, data, ja })`, `PravidlaHry({ verze })`, `VerejnyRadek({ zapas, data })`; `diplomacieKlient.kartaHrace` vrací pro GM `PultGm` (úkol 14) a pro hráče `KartaRole`.

- [ ] **Step 1: Padající testy**

`web/src/diplomacie/KartaRole.test.tsx` (pomocník `stavDiplo(stav, role, ja)` sestaví `DiploData` s jedním zápasem — role už zredigované, tak jak je pošle server; `zapas` = `ZapasView` s účastníky `h1`…`h8` a jmény `Hráč 1`… přes `alias`):

```tsx
vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70 }));
import { prehraj } from "../zvuk.js";

it("před rozesláním čeká", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  expect(screen.getByText("Role se rozdají po startu hry, až GM potvrdí Nástupce.")).toBeTruthy();
});

it("po rozeslání je karta zakrytá a po odkrytí ukáže roli, cíl a oběť", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4", upravenoPoRozeslani: false }])} ja="h2" />);
  expect(screen.queryByText("Kat")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role — klikni pro odkrytí" }));
  expect(screen.getByRole("heading", { name: "Kat" })).toBeTruthy();
  expect(screen.getByText("Tvá oběť:")).toBeTruthy();
  expect(screen.getByText("Hráč 4")).toBeTruthy();
});

it("Nájezdník vidí druhého Nájezdníka, Žoldák pakt", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null, upravenoPoRozeslani: false }, { hracId: "h5", role: "najezdnik", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByText("Druhý Nájezdník:")).toBeTruthy();
  expect(screen.getByText("Hráč 5")).toBeTruthy();
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6", upravenoPoRozeslani: false }])} ja="h2" />);
  expect(screen.getByText("Pokrevní pouto:")).toBeTruthy();
});

it("všichni v zápase vidí Nástupce a úprava GM se ohlásí", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null, upravenoPoRozeslani: true }])} ja="h2" />);
  expect(screen.getByText(/Nástupcem císaře je/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByText("GM upravil tvou roli.")).toBeTruthy();
});

it("přechod do rozesláno zazvoní, načtení s už rozeslanými rolemi ne", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  vi.mocked(prehraj).mockClear();
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  expect(prehraj).not.toHaveBeenCalled();
});

it("bez rozboru scénáře karta funguje jen s texty rolí", () => {
  render(<KartaRole zapas={zapas} data={{ ...stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }]), aktivni: null, verze: {} }} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});
```

`PravidlaHry.test.tsx`:

```tsx
it("pravidla vypíšou cíle s čísly ze scénáře a limity", () => {
  render(<PravidlaHry verze={verze} />);
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByText(/zabij 650 nepratelskych jednotek/)).toBeTruthy();
  expect(screen.getByText(/Nejvýš 30 vesničanů/)).toBeTruthy();
  expect(screen.getByText("Nástupce císaře")).toBeTruthy();
});
```

- [ ] **Step 2: Implementace**

`web/src/diplomacie/PravidlaHry.tsx`:

```tsx
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { Role, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";

const PORADI: Role[] = ["nastupce", "garda", "najezdnik", "sasek", "zoldak", "kat"];

/** Pravidla jako rozbalovací tahák; čísla z rozboru verze, kterou zápas hraje (spec §8.2). */
export function PravidlaHry({ verze }: { verze: ScenarVerze | null }) {
  const r = verze?.rozbor ?? null;
  return (
    <details className="pravidla-hry">
      <summary>Pravidla hry</summary>
      {r ? (
        <>
          <h4>Start</h4>
          <p>
            {r.suroviny.jidlo} jídla, {r.suroviny.drevo} dřeva, {r.suroviny.zlato} zlata, {r.suroviny.kamen} kamene; populace {r.suroviny.populace}.
          </p>
          <ul>
            {r.limity.vesnicane !== null ? <li>Nejvýš {r.limity.vesnicane} vesničanů</li> : null}
            {r.limity.rybarskeLode !== null ? <li>Nejvýš {r.limity.rybarskeLode} rybářských lodí</li> : null}
            {r.limity.obchodniVozy !== null ? <li>Nejvýš {r.limity.obchodniVozy} obchodních vozů</li> : null}
          </ul>
          <h4>Sekundární tajné cíle (losuje hra)</h4>
          <ul>{r.cile.map((c) => <li key={c.text}>{c.text}</li>)}</ul>
        </>
      ) : null}
      <h4>Primární cíle</h4>
      <ul>
        <li>Držet 7 relikvií po dobu 15 herních minut.</li>
        <li>Smrt vlastního krále znamená okamžitou prohru.</li>
      </ul>
      <h4>Role</h4>
      {PORADI.map((role) => (
        <section key={role}>
          <h5>{NAZEV_ROLE[role]}</h5>
          <p>{POPIS_ROLE[role].cil}</p>
        </section>
      ))}
    </details>
  );
}
```

`web/src/diplomacie/KartaRole.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, DiploZapas, RoleHrace } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import zvonUrl from "../assets/zvon.mp3";
import { prehraj } from "../zvuk.js";
import { jmenoHrace, mujUcastnik } from "../zapas.js";
import { MapaScenare } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";

interface Props {
  zapas: ZapasView;
  data: DiploData;
  ja: string;
}

export function diploZapasu(data: DiploData, zapasId: number): DiploZapas | undefined {
  return data.zapasy.find((z) => z.zapasId === zapasId);
}

export function verzeZapasu(data: DiploData, d: DiploZapas | undefined) {
  return d?.scenarId != null ? (data.verze[d.scenarId] ?? null) : data.aktivni;
}

/** Tajná karta role hráče (spec §8.2). Data jsou už zredigovaná serverem. */
export function KartaRole({ zapas, data, ja }: Props) {
  const d = diploZapasu(data, zapas.id);
  const jmeno = (hracId: string) => {
    const u = zapas.ucastnici.find((x) => x.hracId === hracId);
    return u ? jmenoHrace(u) : hracId;
  };
  // Zvon jen při přechodu do „rozesláno“, ne při načtení stránky s už
  // rozeslanými rolemi — stejně jako ostatní zvonění v App.tsx.
  const driv = useRef<string | undefined>(undefined);
  useEffect(() => {
    const predtim = driv.current;
    driv.current = d?.stav;
    if (predtim !== undefined && predtim !== "rozeslano" && d?.stav === "rozeslano") prehraj(zvonUrl);
  }, [d?.stav]);

  if (!d) return null;
  const verze = verzeZapasu(data, d);
  const moje = d.role.find((r) => r.hracId === ja);
  const barva = mujUcastnik(zapas, ja)?.barva;

  return (
    <section className="sekce-krok karta-role" data-testid="karta-role">
      <header className="zahlavi-sekce">
        <h3>Diplomacie</h3>
      </header>
      {d.stav !== "rozeslano" || !moje ? (
        <p className="ceka stred">Role se rozdají po startu hry, až GM potvrdí Nástupce.</p>
      ) : (
        <>
          <p className="stred">Nástupcem císaře je <strong>{d.nastupceHracId ? jmeno(d.nastupceHracId) : "?"}</strong>.</p>
          <Zakryti popisek="Tvá tajná role — klikni pro odkrytí">
            <ObsahRole moje={moje} vse={d.role} jmeno={jmeno} />
            {verze && barva !== undefined ? <MapaScenare verze={verze} starty={barva} /> : null}
          </Zakryti>
        </>
      )}
      <PravidlaHry verze={verze} />
    </section>
  );
}

function ObsahRole({ moje, vse, jmeno }: { moje: RoleHrace; vse: RoleHrace[]; jmeno: (id: string) => string }) {
  const popis = POPIS_ROLE[moje.role];
  const parak = moje.role === "najezdnik" ? vse.find((r) => r.role === "najezdnik" && r.hracId !== moje.hracId) : undefined;
  return (
    <div className={`role role-${moje.role}`}>
      {moje.upravenoPoRozeslani ? <p className="upozorneni">GM upravil tvou roli.</p> : null}
      <h4>{NAZEV_ROLE[moje.role]}</h4>
      <p className="cil">{popis.cil}</p>
      {moje.role === "kat" && moje.cilHracId ? <p><span>Tvá oběť:</span> <strong>{jmeno(moje.cilHracId)}</strong></p> : null}
      {moje.role === "zoldak" && moje.cilHracId ? <p><span>Pokrevní pouto:</span> <strong>{jmeno(moje.cilHracId)}</strong></p> : null}
      {parak ? <p><span>Druhý Nájezdník:</span> <strong>{jmeno(parak.hracId)}</strong></p> : null}
      {popis.vyhody.length > 0 ? (<><h5>Výhody</h5><ul>{popis.vyhody.map((v) => <li key={v}>{v}</li>)}</ul></>) : null}
      {popis.nevyhody.length > 0 ? (<><h5>Nevýhody</h5><ul>{popis.nevyhody.map((v) => <li key={v}>{v}</li>)}</ul></>) : null}
    </div>
  );
}
```

(`jmenoHrace` a `mujUcastnik` jsou ve `web/src/zapas.ts`; ověřit, že `jmenoHrace` bere účastníka — ano, `KartaHrace` ho tak volá.)

`web/src/diplomacie/VerejnyRadek.tsx`:

```tsx
import type { DiploData } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace } from "../zapas.js";
import { diploZapasu } from "./KartaRole.js";

/** Zápas Diplomacie očima diváka: jen to, co je veřejné (spec §8.2). */
export function VerejnyRadek({ zapas, data }: { zapas: ZapasView; data: DiploData }) {
  const d = diploZapasu(data, zapas.id);
  const nastupce = d?.nastupceHracId ? zapas.ucastnici.find((u) => u.hracId === d.nastupceHracId) : undefined;
  return <span className="diplo-radek">Diplomacie{nastupce ? <> · Nástupce: {jmenoHrace(nastupce)}</> : null}</span>;
}
```

`web/src/diplomacie/index.tsx` doplnit (PultGm přijde v úkolu 14 — do té doby GM vidí `KartaRole`, což je pro něj prázdná karta „čeká se“; úkol 14 to přepne):

```tsx
  kartaHrace: ({ zapas, stav, ja }) => (stav.rezim && ja ? <KartaRole zapas={zapas} data={stav.rezim.data} ja={ja} /> : null),
  verejnyZapas: ({ zapas, stav }) => (stav.rezim ? <VerejnyRadek zapas={zapas} data={stav.rezim.data} /> : null),
```

- [ ] **Step 3: Testy a commit**

```bash
npm --prefix web test && npm run build; echo EXIT=$?
npm run verze
git add web/src/diplomacie package.json src/shared/verze.ts web/src/*.css
git commit -m "Show each player their secret role card

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 14: Pult GM

**Files:**
- Create: `web/src/diplomacie/PultGm.tsx`, `web/src/diplomacie/PultGm.test.tsx`
- Modify: `web/src/diplomacie/index.tsx` (GM dostane pult)

**Interfaces:**
- Consumes: `diploApi` (úkol 11), `odchylkySlozeni`, `povoleneCile`, `textPrehledu` (úkol 4), `NAZEV_ROLE`, `MapaScenare`, `Zakryti`, `Kopirovatelne` (`web/src/views/Kopirovatelne.tsx`, prop `hodnota` = celý text, `popis` = „přehled rolí“).
- Produces: `PultGm({ zapas, data, hlidej }: { zapas: ZapasView; data: DiploData; hlidej: Hlidej })` (`Hlidej` z `web/src/rezimy/index.tsx`).

- [ ] **Step 1: Padající testy**

```tsx
vi.mock("./api.js", () => ({ diploApi: { nastupce: vi.fn(async () => ({ ok: true })), los: vi.fn(async () => ({ ok: true })), role: vi.fn(async () => ({ ok: true })), rozeslat: vi.fn(async () => ({ ok: true })), zpet: vi.fn(async () => ({ ok: true })), minimapaUrl: () => "/m.webp" } }));
import { diploApi } from "./api.js";

const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Pult GM — klikni pro odkrytí" }));

it("je zakrytý; v přípravě nabídne 7 dlaždic s pN a barvou", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  expect(screen.queryByTestId("dlazdice")).toBeNull();
  odkryj();
  const dlazdice = screen.getAllByTestId("dlazdice");
  expect(dlazdice).toHaveLength(7);
  expect(dlazdice[0]!.textContent).toMatch(/p1.*modrá.*Hráč 1/);
});

it("klik na dlaždici vybere Nástupce, pak Rozdat role losuje", async () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  odkryj();
  fireEvent.click(screen.getAllByTestId("dlazdice")[2]!);
  expect(diploApi.nastupce).toHaveBeenCalledWith(zapas.id, "h3");
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={spust} />);
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  expect(diploApi.los).toHaveBeenCalledWith(zapas.id);
});

it("po losu tabulka s roletkami, cíle jen povolené, souhrn složení a rozeslání", () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  const cil = screen.getByRole("combobox", { name: `Cíl: ${jmeno(kat.hracId)}` });
  const moznosti = within(cil).getAllByRole("option").map((o) => o.getAttribute("value"));
  expect(moznosti).not.toContain("h1");
  expect(moznosti).not.toContain(kat.hracId);
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(kat.hracId)}` }), { target: { value: "garda" } });
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, kat.hracId, { role: "garda" });
  expect(screen.getByText("Složení odpovídá pravidlům.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Rozeslat role" }));
  expect(diploApi.rozeslat).toHaveBeenCalledWith(zapas.id);
});

it("po rozeslání se úprava potvrzuje dialogem", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const sasek = ROLE_LOS.find((r) => r.role === "sasek")!;
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(sasek.hracId)}` }), { target: { value: "kat" } });
  expect(window.confirm).toHaveBeenCalled();
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, sasek.hracId, { role: "kat", potvrzeno: true });
});

it("odchylka složení je vidět", () => {
  const tri = ROLE_LOS.map((r) => (r.role === "kat" ? { ...r, role: "najezdnik" as const, cilHracId: null } : r));
  render(<PultGm zapas={zapas} data={gmData("losovano", tri, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.getByText("3× Nájezdník (má být 2×), chybí Kat")).toBeTruthy();
});
```

(`const spust = async (fn: () => Promise<unknown>) => { await fn(); };`, `ROLE_LOS = losujRole(["h1","h2","h3","h4","h5","h6","h8"], "h1", () => 0)`, `gmData(stav, role, nastupce?)` = nezredigovaná `DiploData` pro GM `h7`, `jmeno(id)` = „Hráč N“. Dialog `window.confirm` je tu jediná výjimka z pravidla „žádné modální dialogy“ — pro test ho mockujeme; v UI je úmyslný: potvrzení změny role, kterou hráč už vidí.)

- [ ] **Step 2: Implementace**

```tsx
import { useState } from "react";
import { odchylkySlozeni, povoleneCile, textPrehledu } from "../../../src/shared/diplomacie/los.js";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, Role } from "../../../src/shared/diplomacie/typy.js";
import { BARVA_NAZEV, type Barva, type ZapasView } from "../../../src/shared/types.js";
import type { Hlidej } from "../rezimy/index.js";
import { Kopirovatelne } from "../views/Kopirovatelne.js";
import { jmenoHrace } from "../zapas.js";
import { diploApi } from "./api.js";
import { diploZapasu, verzeZapasu } from "./KartaRole.js";
import { MapaScenare } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";

const VOLITELNE_ROLE: Role[] = ["garda", "najezdnik", "sasek", "zoldak", "kat"];
const POPIS_STAVU = { priprava: "Příprava", losovano: "Losováno", rozeslano: "Rozesláno" } as const;

/** Pult GM (spec §8.1). Nic si nedrží lokálně — všechno je ve stavu ze serveru. */
export function PultGm({ zapas, data, hlidej }: { zapas: ZapasView; data: DiploData; hlidej: Hlidej }) {
  const [pracuje, setPracuje] = useState(false);
  const d = diploZapasu(data, zapas.id);
  if (!d) return null;
  const verze = verzeZapasu(data, d);
  const hraci = zapas.ucastnici.filter((u) => u.hracId !== d.gmHracId).sort((a, b) => a.barva - b.barva);
  const jmeno = (id: string) => {
    const u = zapas.ucastnici.find((x) => x.hracId === id);
    return u ? jmenoHrace(u) : id;
  };
  // Chybu ukáže hlidej z App; tlačítka jsou mezitím zamčená, ať GM neklikne dvakrát.
  const akce = (fn: () => Promise<unknown>) => {
    setPracuje(true);
    void hlidej(fn).finally(() => setPracuje(false));
  };
  const potvrzeni = d.stav === "rozeslano";
  const zmen = (hracId: string, zmena: { role?: Role; cilHracId?: string }) => {
    if (potvrzeni && !window.confirm(`${jmeno(hracId)} už svou roli vidí. Opravdu ji změnit?`)) return;
    akce(() => diploApi.role(zapas.id, hracId, potvrzeni ? { ...zmena, potvrzeno: true } : zmena));
  };
  const odchylky = d.role.length > 0 ? odchylkySlozeni(d.role) : [];
  const jmena = Object.fromEntries(zapas.ucastnici.map((u) => [u.barva, jmenoHrace(u)])) as Partial<Record<Barva, string>>;

  return (
    <section className="sekce-krok pult-gm" data-testid="pult-gm">
      <header className="zahlavi-sekce">
        <h3>Pult GM</h3>
        <span className="stav-diplo">{POPIS_STAVU[d.stav]}</span>
      </header>
      <Zakryti popisek="Pult GM — klikni pro odkrytí">
        {verze ? <MapaScenare verze={verze} starty="vsechny" jmena={jmena} velikost="velka" /> : null}

        {d.stav === "priprava" ? (
          <>
            <p>Komu hra nedala sekundární cíl? Hláška ve hře „pN ma: …“ — číslo hráče je jeho barva.</p>
            <div className="dlazdice-nastupce">
              {hraci.map((u) => (
                <button key={u.hracId} type="button" data-testid="dlazdice" className={`dlazdice barva-${u.barva}${d.nastupceHracId === u.hracId ? " vybrana" : ""}`} disabled={pracuje} onClick={() => akce(() => diploApi.nastupce(zapas.id, u.hracId))}>
                  <span className="cislo">p{u.barva}</span> <span className="barva">{BARVA_NAZEV[u.barva]}</span> <strong>{jmenoHrace(u)}</strong>
                </button>
              ))}
            </div>
            <button type="button" disabled={pracuje || d.nastupceHracId === null} onClick={() => akce(() => diploApi.los(zapas.id))}>
              Rozdat role
            </button>
          </>
        ) : (
          <>
            <table className="tabulka-roli">
              <tbody>
                {d.role.map((r) => (
                  <tr key={r.hracId}>
                    <th>{jmeno(r.hracId)}</th>
                    <td>
                      {r.role === "nastupce" ? (
                        <strong>{NAZEV_ROLE.nastupce}</strong>
                      ) : (
                        <select aria-label={`Role: ${jmeno(r.hracId)}`} value={r.role} disabled={pracuje} onChange={(e) => zmen(r.hracId, { role: e.target.value as Role })}>
                          {VOLITELNE_ROLE.map((v) => <option key={v} value={v}>{NAZEV_ROLE[v]}</option>)}
                        </select>
                      )}
                    </td>
                    <td>
                      {r.role === "kat" || r.role === "zoldak" ? (
                        <select aria-label={`Cíl: ${jmeno(r.hracId)}`} value={r.cilHracId ?? ""} disabled={pracuje} onChange={(e) => zmen(r.hracId, { cilHracId: e.target.value })}>
                          {povoleneCile(d.role.map((x) => x.hracId), r.hracId, d.nastupceHracId!).map((c) => <option key={c} value={c}>{jmeno(c)}</option>)}
                        </select>
                      ) : r.role === "najezdnik" ? (
                        <span>zná: {d.role.filter((x) => x.role === "najezdnik" && x.hracId !== r.hracId).map((x) => jmeno(x.hracId)).join(", ")}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={odchylky.length > 0 ? "souhrn varovani" : "souhrn"}>{odchylky.length > 0 ? odchylky.join(", ") : "Složení odpovídá pravidlům."}</p>
            <div className="ovladani">
              {d.stav === "losovano" ? (
                <>
                  <button type="button" disabled={pracuje} onClick={() => akce(() => diploApi.los(zapas.id))}>Přelosovat</button>
                  <button type="button" className="cta" disabled={pracuje} onClick={() => akce(() => diploApi.rozeslat(zapas.id))}>Rozeslat role</button>
                </>
              ) : null}
              <button
                type="button"
                disabled={pracuje}
                onClick={() => {
                  if (potvrzeni && !window.confirm("Role už hráči vidí. Opravdu je smazat a vybírat Nástupce znovu?")) return;
                  akce(() => diploApi.zpet(zapas.id, potvrzeni));
                }}
              >
                Zpět na výběr Nástupce
              </button>
              <Kopirovatelne hodnota={textPrehledu(d.role, jmeno)} popis="přehled rolí" jenIkona />
            </div>
          </>
        )}
        <PravidlaHry verze={verze} />
      </Zakryti>
    </section>
  );
}
```

`web/src/diplomacie/index.tsx`:

```tsx
  kartaHrace: ({ zapas, stav, ja, hlidej }) => {
    if (!stav.rezim || !ja) return null;
    const d = stav.rezim.data.zapasy.find((z) => z.zapasId === zapas.id);
    return d?.gmHracId === ja ? <PultGm zapas={zapas} data={stav.rezim.data} hlidej={hlidej} /> : <KartaRole zapas={zapas} data={stav.rezim.data} ja={ja} />;
  },
```

- [ ] **Step 3: Testy a commit**

```bash
npm --prefix web test && npm run build; echo EXIT=$?
npm run verze
git add web/src/diplomacie web/src/rezimy web/src/App.tsx web/src/*.css package.json src/shared/verze.ts
git commit -m "Add the GM panel for picking the successor and dealing roles

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 15: Správa scénáře a stažení pro hosta

**Files:**
- Create: `web/src/diplomacie/SpravaScenare.tsx`, `StazeniScenare.tsx` (+ testy)
- Modify: `web/src/diplomacie/index.tsx` (`krokHosta`), `web/src/App.tsx` (správa scénáře i bez akce)

**Interfaces:**
- Consumes: `diploApi` (`verze`, `nahrat`, `aktivovat`, `souborUrl`), `MapaScenare`, `Kopirovatelne`.
- Produces: `SpravaScenare({ hlidej }: { hlidej: Hlidej })`, `StazeniScenare({ verze, ja })`, `cestaKeScenarum(hracId: string): string`.

- [ ] **Step 1: Padající testy**

`StazeniScenare.test.tsx`:

```tsx
it("cesta pro Steam a pro Xbox hráče", () => {
  expect(cestaKeScenarum("76561198014056480")).toBe("%USERPROFILE%\\Games\\Age of Empires 2 DE\\76561198014056480\\resources\\_common\\scenario\\");
  expect(cestaKeScenarum("xbox:2533274952064423")).toBe("%USERPROFILE%\\Games\\Age of Empires 2 DE\\2533274952064423\\resources\\_common\\scenario\\");
});
it("host dostane odkaz na verzi zápasu, nebo větu, že scénář chybí", () => {
  const { rerender } = render(<StazeniScenare verze={verze} ja="76561198014056480" />);
  expect(screen.getByRole("link", { name: "Stáhnout scénář" }).getAttribute("href")).toMatch(/\/api\/diplo\/scenar\/3\/soubor$/);
  expect(screen.getByText(/přepiš/)).toBeTruthy();
  rerender(<StazeniScenare verze={null} ja="x" />);
  expect(screen.getByText("Scénář zatím nikdo nenahrál.")).toBeTruthy();
});
```

`SpravaScenare.test.tsx` (mock `diploApi.verze` vrací dvě verze — aktivní s rozborem a starší s `chybaRozboru`):

```tsx
it("vypíše verze, nečitelnou nejde aktivovat, nahrání pošle soubor a poznámku", async () => {
  render(<SpravaScenare hlidej={async (fn) => { await fn(); }} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  expect(await screen.findByText("LLC v2.aoe2scenario")).toBeTruthy();
  expect(screen.getByText(/nepodařilo se přečíst/)).toBeTruthy();
  expect(screen.getAllByRole("button", { name: "Nastavit jako aktivní" })).toHaveLength(0);
  const soubor = new File(["1.59"], "LLC v3.aoe2scenario");
  fireEvent.change(screen.getByLabelText("Co je nového"), { target: { value: "opravy" } });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [soubor] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(diploApi.nahrat).toHaveBeenCalledWith(soubor, "opravy");
});
it("stejné jméno jako existující verze upozorní", async () => {
  render(<SpravaScenare hlidej={async (fn) => { await fn(); }} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  await screen.findByText("LLC v2.aoe2scenario");
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v2.aoe2scenario")] } });
  expect(screen.getByText(/Doporučuju jiné jméno/)).toBeTruthy();
});
```

- [ ] **Step 2: Implementace**

`StazeniScenare.tsx`:

```tsx
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { Kopirovatelne } from "../views/Kopirovatelne.js";
import { diploApi } from "./api.js";

/** Složka scénářů hry pro tohoto hráče (ověřeno na stroji autora 1. 10. 2026, spec §5.3). */
export function cestaKeScenarum(hracId: string): string {
  const id = hracId.startsWith("xbox:") ? hracId.slice("xbox:".length) : hracId;
  return `%USERPROFILE%\\Games\\Age of Empires 2 DE\\${id}\\resources\\_common\\scenario\\`;
}

export function StazeniScenare({ verze, ja }: { verze: ScenarVerze | null; ja: string }) {
  if (!verze) return <p className="ceka">Scénář zatím nikdo nenahrál.</p>;
  return (
    <div className="stazeni-scenare">
      <a className="cta" href={diploApi.souborUrl(verze.id)} download={verze.jmenoSouboru}>
        Stáhnout scénář
      </a>
      <p>
        Ulož <strong>{verze.jmenoSouboru}</strong> do složky (starou kopii stejného jména přepiš):
      </p>
      <Kopirovatelne hodnota={cestaKeScenarum(ja)} popis="cestu ke scénářům" />
      <p>V Create Lobby zvol Game Mode <strong>Scenario</strong> a tenhle scénář. Ostatní hráči ho dostanou z lobby.</p>
    </div>
  );
}
```

`SpravaScenare.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { Hlidej } from "../rezimy/index.js";
import { diploApi } from "./api.js";
import { MapaScenare } from "./MapaScenare.js";

/**
 * Nahrávání verzí scénáře pro adminy a autory (spec §5.3). Rozbalovací, ať
 * nepřekáží v panelu akce; seznam se načítá až po rozbalení.
 */
export function SpravaScenare({ hlidej }: { hlidej: Hlidej }) {
  const [otevreno, setOtevreno] = useState(false);
  const [verze, setVerze] = useState<ScenarVerze[]>([]);
  const [soubor, setSoubor] = useState<File | null>(null);
  const [poznamka, setPoznamka] = useState("");
  const [vysledek, setVysledek] = useState<string | null>(null);
  const nacti = () => hlidej(async () => setVerze((await diploApi.verze()).verze));
  useEffect(() => {
    if (otevreno) void nacti();
  }, [otevreno]);
  const aktivni = verze.find((v) => v.aktivni) ?? null;
  const stejneJmeno = soubor !== null && verze.some((v) => v.jmenoSouboru === soubor.name);

  return (
    <details className="sprava-scenare" open={otevreno} onToggle={(e) => setOtevreno((e.target as HTMLDetailsElement).open)}>
      <summary>Scénář Diplomacie</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!soubor) return;
          void hlidej(async () => {
            const r = await diploApi.nahrat(soubor, poznamka);
            setVysledek(r.chybaRozboru ? `Soubor je uložený, ale nepodařilo se ho přečíst: ${r.chybaRozboru} — pravidla a mapa zůstávají z aktivní verze.` : r.aktivni ? "Nahráno a nastaveno jako aktivní." : "Nahráno. Aktivní zůstává dosavadní verze.");
            setSoubor(null);
            setPoznamka("");
            setVerze((await diploApi.verze()).verze);
          });
        }}
      >
        <label>
          Soubor scénáře <input type="file" accept=".aoe2scenario" onChange={(e) => setSoubor(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Co je nového <input value={poznamka} onChange={(e) => setPoznamka(e.target.value)} />
        </label>
        {stejneJmeno ? <p className="varovani">Doporučuju jiné jméno (např. s číslem verze), jinak kontrola lobby nepozná, že host má starou kopii.</p> : null}
        <button type="submit" disabled={!soubor}>Nahrát</button>
        {vysledek ? <p>{vysledek}</p> : null}
      </form>
      {aktivni?.rozbor ? (
        <div className="nahled-scenare">
          <MapaScenare verze={aktivni} starty="vsechny" />
          <ul>{aktivni.rozbor.cile.map((c) => <li key={c.text}>{c.text}</li>)}</ul>
          {aktivni.rozbor.varovani.map((v) => <p key={v} className="varovani">{v}</p>)}
        </div>
      ) : null}
      <ul className="verze-scenare">
        {verze.map((v) => (
          <li key={v.id} className={v.aktivni ? "aktivni" : ""}>
            <a href={diploApi.souborUrl(v.id)} download={v.jmenoSouboru}>{v.jmenoSouboru}</a> · {v.nahralJmeno} · {new Date(v.nahrano).toLocaleString("cs-CZ")}
            {v.poznamka ? <> · {v.poznamka}</> : null}
            {v.aktivni ? <strong> · aktivní</strong> : null}
            {v.chybaRozboru ? <span className="varovani"> · nepodařilo se přečíst: {v.chybaRozboru}</span> : null}
            {!v.aktivni && v.rozbor ? (
              <button type="button" onClick={() => void hlidej(async () => { await diploApi.aktivovat(v.id); setVerze((await diploApi.verze()).verze); })}>Nastavit jako aktivní</button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
```

`web/src/diplomacie/index.tsx`:

```tsx
  krokHosta: ({ zapas, stav, ja }) => {
    if (!stav.rezim || !ja) return null;
    const d = stav.rezim.data.zapasy.find((z) => z.zapasId === zapas.id);
    return <StazeniScenare verze={verzeZapasu(stav.rezim.data, d)} ja={ja} />;
  },
```

`web/src/App.tsx`: správa scénáře nepatří k jedné akci — Jin nahrává, když se mu to hodí, i když žádná akce neběží (spec §5.3). Proto se nevkládá přes mód, ale samostatně pod místo, kde je `SpravaAkce` / „Právě neběží žádná akce.“:

```tsx
      {me?.smiNahratScenar ? <SpravaScenare hlidej={hlidej} /> : null}
```

- [ ] **Step 3: Testy a commit**

```bash
npm --prefix web test && npm run build; echo EXIT=$?
npm run verze
git add web/src package.json src/shared/verze.ts
git commit -m "Let authors upload scenario versions and hosts download the right one

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push
```

---

## Úkol 16: Grafika — znaky rolí, rub karty, rám minimapy

**Files:**
- Create: `web/src/assets/diplomacie/role-<role>.webp` (7× vč. `role-gm.webp`), `rub-karty.webp`, `ram-mapy.webp`
- Create: `nastroje/grafika/zadani/diplomacie.md` (zadání a prompty), případně `nastroje/grafika/diplomacie.py` (dávka)
- Modify: `docs/grafika.md` (odkud obrázky jsou), `KartaRole.tsx`, `PultGm.tsx`, `Zakryti.tsx` (`rub`), `MapaScenare.tsx`, CSS

**Interfaces:**
- Produces: `ZNAK_ROLE: Record<Role | "gm", string>` (URL obrázků) ve `web/src/diplomacie/znaky.ts`.

- [ ] **Step 1: Zadání**

Do `nastroje/grafika/zadani/diplomacie.md` sepsat podle `docs/grafika.md` (paleta, heraldický styl, rozlišení jako erby civilizací 104–208 px, průhledné pozadí):

| soubor | motiv |
|---|---|
| `role-nastupce` | koruna |
| `role-garda` | štít |
| `role-najezdnik` | pochodeň |
| `role-sasek` | rolnička |
| `role-zoldak` | meč a měšec |
| `role-kat` | sekera |
| `role-gm` | žezlo a oko |
| `rub-karty` | pečeť s orlicí, „tajné“ |
| `ram-mapy` | zlatý rám kosočtverce ve stylu herního rozhraní |

- [ ] **Step 2: Generování lokálně (ComfyUI)**

Nástroji repa (`nastroje/grafika/` — vzor `gen_flux2.py`, `davka.py`) nebo MCP `comfyui` vygenerovat varianty každého motivu. Ukázat uživateli náhled (složit vedle sebe skriptem, jako náhled erbů v úkolu DLC) a nechat vybrat.

- [ ] **Step 3: Úpravy přes Codex**

Vybrané varianty dočistit/sjednotit přes `codex exec -i <obrázek> "…"` (cesta k binárce v paměti `editace-obrazku-pres-codex`). Žádná ruční úprava pixelů. Převod na webp a zmenšení nástrojem (`nastroje/grafika/export.py`).

- [ ] **Step 4: Zapojení**

`web/src/diplomacie/znaky.ts` s importy obrázků; `KartaRole` dá znak k nadpisu role, `PultGm` ke jménu v tabulce, `Zakryti` dostane `rub={<img src={rubUrl} alt="" />}`, `MapaScenare` rám přes CSS `border-image` (jako `.karta`). Test: karta po odkrytí má obrázek s `alt` = název role.

- [ ] **Step 5: Dokumentace a commit**

`docs/grafika.md`: řádek „Znaky rolí Diplomacie, rub karty, rám minimapy — ComfyUI + Codex, zadání `nastroje/grafika/zadani/diplomacie.md`“.

```bash
npm --prefix web test && npm run build; echo EXIT=$?
npm run verze
git add web/src/assets/diplomacie web/src/diplomacie nastroje/grafika docs/grafika.md package.json src/shared/verze.ts
git commit -m "Give Diplomacy roles their emblems, the card a back and the map a frame

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Úkol 17: Dokumentace a živé ověření na `/aoe/diplo`

**Files:**
- Modify: `docs/prehled-praci-a-zameru.md` (§1 stav, nová §3.60 Diplomacie, §6 historie), `README.md` (odstavec „Diplomacie“), `CONTRIBUTING.md` (mapa kódu: `src/diplomacie`, `src/rezimy`, `web/src/diplomacie`; „Data ze hry“: barvy terénů)

- [ ] **Step 1: Dokumentace**

- `docs/prehled-praci-a-zameru.md` §3.60: co mód umí, háčky H1–H12, rozhodnutí (admin-ne-GM nevidí, verze scénáře v DB, rozbor v Pythonu), odkaz na spec a plán.
- `README.md`: „Diplomacie“ — jak založit akci, kdo je GM, jak nahrát scénář, co vidí hráči.
- `CONTRIBUTING.md`: nové složky do mapy kódu, `barvy_terenu.py` do „Data ze hry“, `PYTHON=python` pro lokální rozbor.

- [ ] **Step 2: Nasazení a živá kontrola**

```bash
npm test && npm --prefix web test && npx tsc --noEmit && npm run build; echo EXIT=$?
git add docs README.md CONTRIBUTING.md && git commit -m "Document the Diplomacy mode

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
git push && ssh root@178.104.160.182 /root/aoe-deploy/test-db.sh diplo
until curl -s https://jouki.cz/aoe/diplo/api/health | grep -q "$(node -p "require('./package.json').version")"; do sleep 15; done
```

Živě na `https://jouki.cz/aoe/diplo` (admin účet uživatele):
1. Nahrát `LLC.aoe2scenario` ve správě scénáře → aktivní, minimapa a čísla cílů sedí.
2. Založit akci s přepínačem Diplomacie → nastavení lobby: Scenario, scénář LLC.
3. Zkušební hráči doplní 8 přihlášených; sestava 7 + GM (uživatel na šedé) → Vytvořit zápas.
4. Pult GM: Nástupce → Rozdat role → úprava → Rozeslat.
5. `curl -s https://jouki.cz/aoe/diplo/api/akce` (nepřihlášený) → `rezim.data.zapasy[0].role` je `[]`, `nastupceHracId` vyplněné.
6. Karty očima jednotlivých hráčů lokálně přes zkušební dveře (`DEV_PRISTUP=true`, `npm run dev`) — na https jsou zavřené záměrně.
7. Vizuální kontrola na uživateli (CLAUDE.md: „Vizuální kontrola zůstává na uživateli“).

- [ ] **Step 3: Doplnit Jina jako autora**

Až se Jin poprvé přihlásí na `/aoe/diplo`, vzít jeho `hrac_id` (`SELECT hrac_id, alias FROM player` v `rob_aoe_diplo`) a nastavit `AUTORI_SCENARE` v Coolify (PATCH envs + `/deploy`, ne `/restart`). Zapsat do `docs/nasazeni-jouki-cz.md` §3.6.
