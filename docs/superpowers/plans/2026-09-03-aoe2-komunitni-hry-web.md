# Web pro komunitní hry Robdiesalot — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Webová aplikace, kde se lidé přihlásí přes Steam do Robových komunitních her AoE2 DE, Rob z nich složí zápasy, a všichni včetně Roba se dostanou do správné lobby jedním kliknutím.

**Architecture:** Jeden Node proces (Fastify) obsluhuje API, SSE i sestavený frontend; stav je celý v Postgresu. Jádrem je čistá funkce, která z odkazu `aoe2de://0/<id>` odvodí divácký odkaz `aoe2de://1/<id>`. Lobby zakládá člověk ručně a jednou vloží odkaz na web — žádná automatizace herního rozhraní, a tedy žádná desktopová aplikace.

**Tech Stack:** TypeScript (ESM), Node 24, Fastify 5, PostgreSQL (`pg`), React 19 + Vite 6, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-03-aoe2-komunitni-hry-web-design.md`

## Global Constraints

- Node 24+, TypeScript v ESM režimu (`"type": "module"`), veškerý import s příponou `.js`.
- Formáty zápasů právě dva: `1v1` a `coop_kings_2v2`. Nic dalšího se nepřidává.
- Barvy jen 1 (modrá) a 2 (červená). Coop Kings znamená **dva hráči se stejnou barvou**.
- Ukládá se výhradně `lobby_id` (holé číslo). Join i divácký odkaz se vždy odvozují, nikdy neukládají.
- Selhání externího API **nikdy** nesmí zablokovat přihlášení uživatele.
- Přes SSE se posílá **celý stav akce**, ne přírůstky.
- Veškerý stav v Postgresu včetně relací; restart procesu nesmí ztratit rozehraný večer.
- Název lobby: `ROB-<pořadí na dvě číslice>`, např. `ROB-07`.
- Heslo: 8 znaků z abecedy `abcdefghjkmnpqrstuvwxyz23456789` (bez `i`, `l`, `o`, `0`, `1`).
- Texty pro uživatele česky. Commit messages anglicky.
- Stav účastníka se nikdy nepojmenuje „je v lobby" — vždy „klikl na připojení".

---

## Task 0: Ruční ověření odkazů (bez kódu)

**Tohle je brána, ne úkol na psaní kódu.** Celý projekt stojí na tom, že divácký odkaz funguje. Zatím je to ověřené jen ze zdrojových kódů Empire League.

- [ ] **Step 1: Založit testovací lobby**

V AoE2 DE: Multiplayer → Host Game. Nastavit **Visibility: Public** (jinak nejde zapnout diváky), zadat heslo, zaškrtnout **Allow Spectators**, vytvořit lobby.

- [ ] **Step 2: Zkopírovat odkaz**

V lobby kliknout na tlačítko **Copy**. Ve schránce musí být text ve tvaru `aoe2de://0/234230181`. Zapsat si to číslo.

- [ ] **Step 3: Ověřit připojení hráče**

Druhý člověk vloží ten odkaz do adresního řádku prohlížeče a potvrdí. Očekávané: hra se přepne do lobby. Zaznamenat, jestli to fungovalo napoprvé, nebo až po otevření lobby prohlížeče ve hře.

- [ ] **Step 4: Ověřit diváka před startem**

Rob otevře `aoe2de://1/<stejné číslo>`. Očekávané: dostane se do lobby jako divák.

- [ ] **Step 5: Ověřit diváka za běhu hry**

Spustit hru a krok 4 zopakovat. Očekávané: napojí se na rozehranou hru.

- [ ] **Step 6: Zapsat výsledek**

Doplnit zjištěné do sekce 14 specifikace (otevřené otázky). **Když krok 4 nebo 5 nefunguje, zastavit se a přepracovat návrh — nepokračovat na Task 1.**

---

## Task 1: Kostra projektu

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.env.example`
- Create: `src/http/server.ts`
- Test: `src/http/server.test.ts`

**Interfaces:**
- Produces: `buildServer(): FastifyInstance` — továrna na server, kterou používají všechny testy i produkční start.

- [ ] **Step 1: Založit package.json**

```json
{
  "name": "rob-aoe-web",
  "version": "0.1.0",
  "type": "module",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "node --watch --experimental-strip-types src/main.ts",
    "build": "tsc -p tsconfig.json && npm --prefix web run build",
    "start": "node dist/main.js",
    "test": "vitest run",
    "db:migrate": "node --experimental-strip-types scripts/migrate.ts"
  },
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cookie": "^11.0.2",
    "@fastify/static": "^8.0.4",
    "pg": "^8.13.1"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/pg": "^8.11.10",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Založit tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": ".",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*.ts", "scripts/**/*.ts"]
}
```

- [ ] **Step 3: Založit vitest.config.ts**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Napsat padající test**

`src/http/server.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

describe("server", () => {
  it("odpovídá na /api/health", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });
});
```

- [ ] **Step 5: Spustit test a ověřit, že padá**

Run: `npm install && npm test`
Expected: FAIL — `Cannot find module './server.js'`

- [ ] **Step 6: Napsat minimální implementaci**

`src/http/server.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.get("/api/health", async () => ({ ok: true }));
  return app;
}
```

- [ ] **Step 7: Spustit test a ověřit, že prochází**

Run: `npm test`
Expected: PASS

- [ ] **Step 8: Založit .env.example**

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/rob_aoe
BASE_URL=http://localhost:3000
PORT=3000
STEAM_API_KEY=
ADMIN_STEAM_ID=
```

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .env.example src/http
git commit -m "chore: scaffold Fastify server with health endpoint"
```

---

## Task 2: Modul `aoe` — odkazy do hry

Jádro celého projektu. Čistá funkce, žádná databáze, žádná síť.

**Files:**
- Create: `src/aoe/lobbyUri.ts`
- Test: `src/aoe/lobbyUri.test.ts`

**Interfaces:**
- Produces:
  - `parseJoinUri(input: string): ParseResult` kde `ParseResult = { ok: true; lobbyId: string } | { ok: false; error: LobbyUriError }`
  - `type LobbyUriError = "prazdne" | "divacky_odkaz" | "spatny_tvar"`
  - `joinUri(lobbyId: string): string`
  - `spectatorUri(lobbyId: string): string`

- [ ] **Step 1: Napsat padající testy**

`src/aoe/lobbyUri.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { joinUri, parseJoinUri, spectatorUri } from "./lobbyUri.js";

describe("parseJoinUri", () => {
  it("přijme platný join odkaz", () => {
    expect(parseJoinUri("aoe2de://0/234230181")).toEqual({ ok: true, lobbyId: "234230181" });
  });

  it("toleruje mezery kolem", () => {
    expect(parseJoinUri("  aoe2de://0/234230181\n")).toEqual({ ok: true, lobbyId: "234230181" });
  });

  it("pozná omylem vložený divácký odkaz", () => {
    expect(parseJoinUri("aoe2de://1/234230181")).toEqual({ ok: false, error: "divacky_odkaz" });
  });

  it("odmítne prázdný vstup", () => {
    expect(parseJoinUri("   ")).toEqual({ ok: false, error: "prazdne" });
  });

  it("odmítne cokoliv jiného", () => {
    expect(parseJoinUri("https://example.com/234230181")).toEqual({ ok: false, error: "spatny_tvar" });
    expect(parseJoinUri("aoe2de://0/abc")).toEqual({ ok: false, error: "spatny_tvar" });
    expect(parseJoinUri("aoe2de://0/")).toEqual({ ok: false, error: "spatny_tvar" });
  });
});

describe("odvození odkazů", () => {
  it("složí join odkaz", () => {
    expect(joinUri("234230181")).toBe("aoe2de://0/234230181");
  });

  it("složí divácký odkaz", () => {
    expect(spectatorUri("234230181")).toBe("aoe2de://1/234230181");
  });

  it("divácký odkaz vzniklý z join odkazu má stejné číslo", () => {
    const parsed = parseJoinUri("aoe2de://0/999");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(spectatorUri(parsed.lobbyId)).toBe("aoe2de://1/999");
  });
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/aoe/lobbyUri.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Napsat implementaci**

`src/aoe/lobbyUri.ts`:

```ts
export type LobbyUriError = "prazdne" | "divacky_odkaz" | "spatny_tvar";

export type ParseResult =
  | { ok: true; lobbyId: string }
  | { ok: false; error: LobbyUriError };

const JOIN = /^aoe2de:\/\/0\/(\d+)$/;
const SPECTATOR = /^aoe2de:\/\/1\/\d+$/;

export function parseJoinUri(input: string): ParseResult {
  const text = (input ?? "").trim();
  if (text === "") return { ok: false, error: "prazdne" };
  if (SPECTATOR.test(text)) return { ok: false, error: "divacky_odkaz" };
  const match = JOIN.exec(text);
  if (!match?.[1]) return { ok: false, error: "spatny_tvar" };
  return { ok: true, lobbyId: match[1] };
}

export function joinUri(lobbyId: string): string {
  return `aoe2de://0/${lobbyId}`;
}

export function spectatorUri(lobbyId: string): string {
  return `aoe2de://1/${lobbyId}`;
}
```

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/aoe/lobbyUri.test.ts`
Expected: PASS (9 testů)

- [ ] **Step 5: Commit**

```bash
git add src/aoe
git commit -m "feat: derive AoE2 spectator URI from a lobby join URI"
```

---

## Task 3: Sestavení zápasu — týmy, barvy, název, heslo

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/matches/composition.ts`
- Test: `src/matches/composition.test.ts`

**Interfaces:**
- Produces:
  - `type Format = "1v1" | "coop_kings_2v2"`
  - `type Tym = 1 | 2`, `type Barva = 1 | 2`
  - `interface Seat { steamId: string; tym: Tym; barva: Barva; jeHost: boolean }`
  - `seatCount(format: Format): number`
  - `assignSeats(format: Format, players: SeatInput[]): Seat[]` kde `interface SeatInput { steamId: string; odehranoHer: number | null }`
  - `lobbyName(poradi: number): string`
  - `generatePassword(rng?: () => number): string`
  - `BARVA_NAZEV: Record<Barva, string>`

- [ ] **Step 1: Založit sdílené typy**

`src/shared/types.ts`:

```ts
export type Format = "1v1" | "coop_kings_2v2";
export type Tym = 1 | 2;
export type Barva = 1 | 2;

export const BARVA_NAZEV: Record<Barva, string> = {
  1: "modrá",
  2: "červená",
};

export interface Seat {
  steamId: string;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
}
```

- [ ] **Step 2: Napsat padající testy**

`src/matches/composition.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assignSeats, generatePassword, lobbyName, seatCount } from "./composition.js";

const p = (steamId: string, odehranoHer: number | null) => ({ steamId, odehranoHer });

describe("seatCount", () => {
  it("zná velikost obou formátů", () => {
    expect(seatCount("1v1")).toBe(2);
    expect(seatCount("coop_kings_2v2")).toBe(4);
  });
});

describe("assignSeats — 1v1", () => {
  it("dá každému jiný tým a jinou barvu", () => {
    const seats = assignSeats("1v1", [p("A", 10), p("B", 50)]);
    expect(seats.map((s) => [s.steamId, s.tym, s.barva])).toEqual([
      ["A", 1, 1],
      ["B", 2, 2],
    ]);
  });
});

describe("assignSeats — Coop Kings", () => {
  it("dá dvojici stejnou barvu i tým a soupeřům druhou", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 1), p("B", 2), p("C", 3), p("D", 4)]);
    expect(seats.map((s) => [s.steamId, s.tym, s.barva])).toEqual([
      ["A", 1, 1],
      ["B", 1, 1],
      ["C", 2, 2],
      ["D", 2, 2],
    ]);
  });

  it("spoluhráči sdílí barvu, soupeři ne", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 1), p("B", 2), p("C", 3), p("D", 4)]);
    expect(seats[0]!.barva).toBe(seats[1]!.barva);
    expect(seats[2]!.barva).toBe(seats[3]!.barva);
    expect(seats[0]!.barva).not.toBe(seats[2]!.barva);
  });
});

describe("assignSeats — host", () => {
  it("hostem je hráč s nejvíc odehranými hrami", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 10), p("B", 900), p("C", 30), p("D", 40)]);
    expect(seats.filter((s) => s.jeHost).map((s) => s.steamId)).toEqual(["B"]);
  });

  it("při shodě vybere prvního", () => {
    const seats = assignSeats("1v1", [p("A", 5), p("B", 5)]);
    expect(seats.find((s) => s.jeHost)!.steamId).toBe("A");
  });

  it("neznámý počet her se počítá jako nula", () => {
    const seats = assignSeats("1v1", [p("A", null), p("B", 1)]);
    expect(seats.find((s) => s.jeHost)!.steamId).toBe("B");
  });

  it("host je vždy právě jeden", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 1), p("B", 1), p("C", 1), p("D", 1)]);
    expect(seats.filter((s) => s.jeHost)).toHaveLength(1);
  });
});

describe("assignSeats — chyby", () => {
  it("odmítne špatný počet hráčů", () => {
    expect(() => assignSeats("1v1", [p("A", 1)])).toThrow(/2 hráče/);
    expect(() => assignSeats("coop_kings_2v2", [p("A", 1), p("B", 1)])).toThrow(/4 hráče/);
  });

  it("odmítne stejného hráče dvakrát", () => {
    expect(() => assignSeats("1v1", [p("A", 1), p("A", 1)])).toThrow(/dvakrát/);
  });
});

describe("lobbyName", () => {
  it("doplní nulu na dvě číslice", () => {
    expect(lobbyName(7)).toBe("ROB-07");
    expect(lobbyName(12)).toBe("ROB-12");
    expect(lobbyName(103)).toBe("ROB-103");
  });
});

describe("generatePassword", () => {
  it("má osm znaků", () => {
    expect(generatePassword()).toHaveLength(8);
  });

  it("neobsahuje zaměnitelné znaky", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).not.toMatch(/[ilo01]/);
    }
  });

  it("je deterministické při daném generátoru", () => {
    expect(generatePassword(() => 0)).toBe("aaaaaaaa");
  });
});
```

- [ ] **Step 3: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/matches/composition.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 4: Napsat implementaci**

`src/matches/composition.ts`:

```ts
import type { Barva, Format, Seat, Tym } from "../shared/types.js";

export interface SeatInput {
  steamId: string;
  odehranoHer: number | null;
}

const ROZLOZENI: Record<Format, ReadonlyArray<{ tym: Tym; barva: Barva }>> = {
  "1v1": [
    { tym: 1, barva: 1 },
    { tym: 2, barva: 2 },
  ],
  coop_kings_2v2: [
    { tym: 1, barva: 1 },
    { tym: 1, barva: 1 },
    { tym: 2, barva: 2 },
    { tym: 2, barva: 2 },
  ],
};

export function seatCount(format: Format): number {
  return ROZLOZENI[format].length;
}

export function assignSeats(format: Format, players: SeatInput[]): Seat[] {
  const rozlozeni = ROZLOZENI[format];
  if (players.length !== rozlozeni.length) {
    throw new Error(`Formát ${format} potřebuje přesně ${rozlozeni.length} hráče.`);
  }
  const unikatni = new Set(players.map((p) => p.steamId));
  if (unikatni.size !== players.length) {
    throw new Error("Stejný hráč nemůže být v zápase dvakrát.");
  }

  let hostIndex = 0;
  for (let i = 1; i < players.length; i++) {
    if ((players[i]!.odehranoHer ?? 0) > (players[hostIndex]!.odehranoHer ?? 0)) {
      hostIndex = i;
    }
  }

  return players.map((hrac, i) => ({
    steamId: hrac.steamId,
    tym: rozlozeni[i]!.tym,
    barva: rozlozeni[i]!.barva,
    jeHost: i === hostIndex,
  }));
}

export function lobbyName(poradi: number): string {
  return `ROB-${String(poradi).padStart(2, "0")}`;
}

const ABECEDA = "abcdefghjkmnpqrstuvwxyz23456789";

export function generatePassword(rng: () => number = Math.random): string {
  let heslo = "";
  for (let i = 0; i < 8; i++) {
    heslo += ABECEDA[Math.floor(rng() * ABECEDA.length)];
  }
  return heslo;
}
```

- [ ] **Step 5: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/matches/composition.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/shared src/matches
git commit -m "feat: assign teams, colors and host when composing a match"
```

---

## Task 4: Stavový automat zápasu

**Files:**
- Create: `src/matches/stateMachine.ts`
- Test: `src/matches/stateMachine.test.ts`

**Interfaces:**
- Produces:
  - `type MatchState = "nachystany" | "vyhlaseny" | "lobby_otevrena" | "hraje_se" | "dohrano" | "zruseny"`
  - `type Actor = "admin" | "host"`
  - `canTransition(from: MatchState, to: MatchState, actor: Actor): boolean`
  - `assertTransition(from: MatchState, to: MatchState, actor: Actor): void` — vyhodí `Error` se srozumitelnou hláškou
  - `MATCH_STATES: readonly MatchState[]`

- [ ] **Step 1: Napsat padající testy**

`src/matches/stateMachine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./stateMachine.js";

describe("host", () => {
  it("smí otevřít lobby a spustit hru", () => {
    expect(canTransition("vyhlaseny", "lobby_otevrena", "host")).toBe(true);
    expect(canTransition("lobby_otevrena", "hraje_se", "host")).toBe(true);
  });

  it("nesmí vyhlásit zápas, zapsat výsledek ani zrušit", () => {
    expect(canTransition("nachystany", "vyhlaseny", "host")).toBe(false);
    expect(canTransition("hraje_se", "dohrano", "host")).toBe(false);
    expect(canTransition("vyhlaseny", "zruseny", "host")).toBe(false);
  });

  it("nesmí přeskakovat kroky", () => {
    expect(canTransition("vyhlaseny", "hraje_se", "host")).toBe(false);
  });
});

describe("admin", () => {
  it("smí libovolný přechod včetně vrácení zpět", () => {
    expect(canTransition("nachystany", "hraje_se", "admin")).toBe(true);
    expect(canTransition("hraje_se", "vyhlaseny", "admin")).toBe(true);
    expect(canTransition("dohrano", "hraje_se", "admin")).toBe(true);
    expect(canTransition("lobby_otevrena", "zruseny", "admin")).toBe(true);
  });

  it("nesmí přejít do téhož stavu", () => {
    expect(canTransition("hraje_se", "hraje_se", "admin")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("mlčí u povoleného přechodu", () => {
    expect(() => assertTransition("vyhlaseny", "lobby_otevrena", "host")).not.toThrow();
  });

  it("u zakázaného vysvětlí co a proč", () => {
    expect(() => assertTransition("hraje_se", "dohrano", "host")).toThrow(
      /host nesmí přejít z „hraje_se“ do „dohrano“/,
    );
  });
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/matches/stateMachine.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Napsat implementaci**

`src/matches/stateMachine.ts`:

```ts
export type MatchState =
  | "nachystany"
  | "vyhlaseny"
  | "lobby_otevrena"
  | "hraje_se"
  | "dohrano"
  | "zruseny";

export type Actor = "admin" | "host";

export const MATCH_STATES: readonly MatchState[] = [
  "nachystany",
  "vyhlaseny",
  "lobby_otevrena",
  "hraje_se",
  "dohrano",
  "zruseny",
];

const HOST_PRECHODY: ReadonlyArray<[MatchState, MatchState]> = [
  ["vyhlaseny", "lobby_otevrena"],
  ["lobby_otevrena", "hraje_se"],
];

export function canTransition(from: MatchState, to: MatchState, actor: Actor): boolean {
  if (from === to) return false;
  if (actor === "admin") return true;
  return HOST_PRECHODY.some(([a, b]) => a === from && b === to);
}

export function assertTransition(from: MatchState, to: MatchState, actor: Actor): void {
  if (!canTransition(from, to, actor)) {
    throw new Error(`Role ${actor} nesmí přejít z „${from}“ do „${to}“.`);
  }
}
```

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/matches/stateMachine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/matches/stateMachine.ts src/matches/stateMachine.test.ts
git commit -m "feat: gate match state transitions by actor role"
```

---

## Task 5: Databáze — schéma, migrace, pool

**Files:**
- Create: `database/001_initial_schema.sql`
- Create: `scripts/migrate.ts`
- Create: `src/db/pool.ts`
- Modify: `vitest.config.ts` (vyloučit testy proti databázi z rychlé sady)
- Create: `vitest.db.config.ts`
- Test: `src/db/pool.db.test.ts`

**Interfaces:**
- Consumes: nic
- Produces:
  - `getPool(): Pool` — líně vytvořený sdílený `pg.Pool` z `DATABASE_URL`
  - `withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>`
  - `closePool(): Promise<void>`

- [ ] **Step 1: Napsat schéma**

`database/001_initial_schema.sql` (tabulku `schema_migrations` zakládá spouštěč, ne migrace):

```sql
CREATE TABLE player (
  steam_id        TEXT PRIMARY KEY,
  alias           TEXT,
  steam_name      TEXT,
  avatar_url      TEXT,
  country         TEXT,
  elo_1v1         INTEGER,
  elo_nejvyssi    INTEGER,
  odehrano_her    INTEGER,
  posledni_zapas  TIMESTAMPTZ,
  steam_hodiny    INTEGER,
  staty_stazeny_v TIMESTAMPTZ,
  staty_chyba     TEXT,
  je_admin        BOOLEAN NOT NULL DEFAULT FALSE,
  vytvoren        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE session (
  sid       TEXT PRIMARY KEY,
  steam_id  TEXT NOT NULL REFERENCES player(steam_id) ON DELETE CASCADE,
  vytvorena TIMESTAMPTZ NOT NULL DEFAULT now(),
  plati_do  TIMESTAMPTZ NOT NULL
);

CREATE TABLE akce (
  id        SERIAL PRIMARY KEY,
  nazev     TEXT NOT NULL,
  stav      TEXT NOT NULL DEFAULT 'priprava',
  vytvorena TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE prihlaska (
  akce_id  INTEGER NOT NULL REFERENCES akce(id) ON DELETE CASCADE,
  steam_id TEXT NOT NULL REFERENCES player(steam_id) ON DELETE CASCADE,
  stav     TEXT NOT NULL DEFAULT 'prihlasen',
  kdy      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (akce_id, steam_id)
);

CREATE TABLE zapas (
  id          SERIAL PRIMARY KEY,
  akce_id     INTEGER NOT NULL REFERENCES akce(id) ON DELETE CASCADE,
  poradi      INTEGER NOT NULL,
  format      TEXT NOT NULL,
  stav        TEXT NOT NULL DEFAULT 'nachystany',
  nazev_lobby TEXT NOT NULL,
  heslo       TEXT NOT NULL,
  lobby_id    TEXT,
  vitezny_tym SMALLINT,
  zacatek     TIMESTAMPTZ,
  konec       TIMESTAMPTZ,
  vytvoren    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (akce_id, poradi)
);

CREATE TABLE ucastnik (
  zapas_id         INTEGER NOT NULL REFERENCES zapas(id) ON DELETE CASCADE,
  steam_id         TEXT NOT NULL REFERENCES player(steam_id),
  tym              SMALLINT NOT NULL,
  barva            SMALLINT NOT NULL,
  je_host          BOOLEAN NOT NULL DEFAULT FALSE,
  kliknul_pripojit TIMESTAMPTZ,
  PRIMARY KEY (zapas_id, steam_id)
);

CREATE TABLE udalost (
  id       BIGSERIAL PRIMARY KEY,
  akce_id  INTEGER REFERENCES akce(id) ON DELETE CASCADE,
  zapas_id INTEGER REFERENCES zapas(id) ON DELETE CASCADE,
  kdo      TEXT REFERENCES player(steam_id),
  co       TEXT NOT NULL,
  detail   JSONB,
  kdy      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX prihlaska_akce_idx ON prihlaska (akce_id);
CREATE INDEX zapas_akce_idx ON zapas (akce_id, poradi);
CREATE INDEX udalost_akce_idx ON udalost (akce_id, kdy DESC);
```

- [ ] **Step 2: Napsat spouštěč migrací**

`scripts/migrate.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg from "pg";

const url = process.env["DATABASE_URL"];
if (!url) throw new Error("Chybí DATABASE_URL.");

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`);

const dir = join(import.meta.dirname, "..", "database");
const soubory = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const { rows } = await client.query<{ version: string }>("SELECT version FROM schema_migrations");
const hotove = new Set(rows.map((r) => r.version));

for (const soubor of soubory) {
  const version = soubor.replace(/\.sql$/, "");
  if (hotove.has(version)) continue;
  const sql = await readFile(join(dir, soubor), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
    await client.query("COMMIT");
    console.log(`applied ${version}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

await client.end();
```

- [ ] **Step 3: Napsat pool**

`src/db/pool.ts`:

```ts
import pg, { type Pool, type PoolClient } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env["DATABASE_URL"];
    if (!connectionString) throw new Error("Chybí DATABASE_URL.");
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const vysledek = await fn(client);
    await client.query("COMMIT");
    return vysledek;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool?.end();
  pool = undefined;
}
```

- [ ] **Step 4: Oddělit testy proti databázi od rychlé sady**

Uprav `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.db.test.ts", "node_modules/**"],
    environment: "node",
  },
});
```

Vytvoř `vitest.db.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.db.test.ts"],
    environment: "node",
    fileParallelism: false,
  },
});
```

Do `package.json` přidej skript `"test:db": "vitest run --config vitest.db.config.ts"`.

- [ ] **Step 5: Založit databáze a spustit migrace**

Run (PowerShell, běžící lokální Postgres):

```
psql -U postgres -c "CREATE DATABASE rob_aoe"
psql -U postgres -c "CREATE DATABASE rob_aoe_test"
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test"; npm run db:migrate
```

Expected: vypíše `applied 001_initial_schema`

- [ ] **Step 6: Napsat test proti databázi**

`src/db/pool.db.test.ts`:

```ts
import { afterAll, expect, it } from "vitest";
import { closePool, getPool, withTransaction } from "./pool.js";

afterAll(async () => {
  await closePool();
});

it("schéma je nasazené", async () => {
  const { rows } = await getPool().query<{ count: string }>(
    "SELECT count(*)::text AS count FROM information_schema.tables WHERE table_name = 'zapas'",
  );
  expect(rows[0]!.count).toBe("1");
});

it("transakce se při chybě vrátí zpět", async () => {
  await expect(
    withTransaction(async (client) => {
      await client.query("INSERT INTO akce (nazev) VALUES ('pokus')");
      throw new Error("naschvál");
    }),
  ).rejects.toThrow("naschvál");

  const { rows } = await getPool().query("SELECT 1 FROM akce WHERE nazev = 'pokus'");
  expect(rows).toHaveLength(0);
});
```

- [ ] **Step 7: Spustit testy proti databázi**

Run: `$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test"; npm run test:db`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add database scripts src/db vitest.config.ts vitest.db.config.ts package.json
git commit -m "feat: add database schema, migration runner and connection pool"
```

---

## Task 6: Úložiště hráčů

**Files:**
- Create: `src/db/players.ts`
- Test: `src/db/players.db.test.ts`

**Interfaces:**
- Consumes: `getPool` z `src/db/pool.js`
- Produces:
  - `interface PlayerRow { steamId: string; alias: string | null; steamName: string | null; avatarUrl: string | null; country: string | null; elo1v1: number | null; eloNejvyssi: number | null; odehranoHer: number | null; posledniZapas: Date | null; steamHodiny: number | null; statyStazenyV: Date | null; statyChyba: string | null; jeAdmin: boolean }`
  - `interface PlayerStatsUpdate { alias?: string | null; steamName?: string | null; avatarUrl?: string | null; country?: string | null; elo1v1?: number | null; eloNejvyssi?: number | null; odehranoHer?: number | null; posledniZapas?: Date | null; steamHodiny?: number | null; chyba: string | null }`
  - `upsertPlayer(steamId: string, jeAdmin: boolean): Promise<PlayerRow>`
  - `savePlayerStats(steamId: string, staty: PlayerStatsUpdate): Promise<void>`
  - `getPlayer(steamId: string): Promise<PlayerRow | null>`
  - `getPlayers(steamIds: string[]): Promise<PlayerRow[]>`

- [ ] **Step 1: Napsat padající testy**

`src/db/players.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { closePool, getPool } from "./pool.js";
import { getPlayer, getPlayers, savePlayerStats, upsertPlayer } from "./players.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("založí hráče a podruhé ho jen vrátí", async () => {
  const prvni = await upsertPlayer("76561198000000001", false);
  expect(prvni.steamId).toBe("76561198000000001");
  expect(prvni.alias).toBeNull();

  await upsertPlayer("76561198000000001", false);
  const { rows } = await getPool().query("SELECT 1 FROM player");
  expect(rows).toHaveLength(1);
});

it("nastaví příznak admina", async () => {
  const hrac = await upsertPlayer("76561198000000002", true);
  expect(hrac.jeAdmin).toBe(true);
});

it("uloží statistiky včetně času stažení", async () => {
  await upsertPlayer("76561198000000003", false);
  await savePlayerStats("76561198000000003", {
    alias: "TenceR",
    elo1v1: 1847,
    eloNejvyssi: 1901,
    odehranoHer: 512,
    steamHodiny: 1230,
    chyba: null,
  });

  const hrac = await getPlayer("76561198000000003");
  expect(hrac?.alias).toBe("TenceR");
  expect(hrac?.elo1v1).toBe(1847);
  expect(hrac?.steamHodiny).toBe(1230);
  expect(hrac?.statyStazenyV).toBeInstanceOf(Date);
  expect(hrac?.statyChyba).toBeNull();
});

it("zapíše chybu, ale nepřepíše dřívější hodnoty", async () => {
  await upsertPlayer("76561198000000004", false);
  await savePlayerStats("76561198000000004", { alias: "Pepa", elo1v1: 1500, chyba: null });
  await savePlayerStats("76561198000000004", { chyba: "Worlds Edge neodpovědělo" });

  const hrac = await getPlayer("76561198000000004");
  expect(hrac?.alias).toBe("Pepa");
  expect(hrac?.elo1v1).toBe(1500);
  expect(hrac?.statyChyba).toBe("Worlds Edge neodpovědělo");
});

it("skryté hodiny se uloží jako null", async () => {
  await upsertPlayer("76561198000000005", false);
  await savePlayerStats("76561198000000005", { steamHodiny: null, chyba: null });
  expect((await getPlayer("76561198000000005"))?.steamHodiny).toBeNull();
});

it("vrátí null pro neznámého hráče", async () => {
  expect(await getPlayer("76561198000000099")).toBeNull();
});

it("načte víc hráčů najednou", async () => {
  await upsertPlayer("76561198000000006", false);
  await upsertPlayer("76561198000000007", false);
  const hraci = await getPlayers(["76561198000000006", "76561198000000007", "neznamy"]);
  expect(hraci.map((h) => h.steamId).sort()).toEqual(["76561198000000006", "76561198000000007"]);
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — `./players.js` neexistuje

- [ ] **Step 3: Napsat implementaci**

`src/db/players.ts`:

```ts
import { getPool } from "./pool.js";

export interface PlayerRow {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  avatarUrl: string | null;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
  steamHodiny: number | null;
  statyStazenyV: Date | null;
  statyChyba: string | null;
  jeAdmin: boolean;
}

export interface PlayerStatsUpdate {
  alias?: string | null;
  steamName?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  elo1v1?: number | null;
  eloNejvyssi?: number | null;
  odehranoHer?: number | null;
  posledniZapas?: Date | null;
  steamHodiny?: number | null;
  chyba: string | null;
}

const SLOUPCE = `
  steam_id, alias, steam_name, avatar_url, country, elo_1v1, elo_nejvyssi,
  odehrano_her, posledni_zapas, steam_hodiny, staty_stazeny_v, staty_chyba, je_admin
`;

interface DbRow {
  steam_id: string;
  alias: string | null;
  steam_name: string | null;
  avatar_url: string | null;
  country: string | null;
  elo_1v1: number | null;
  elo_nejvyssi: number | null;
  odehrano_her: number | null;
  posledni_zapas: Date | null;
  steam_hodiny: number | null;
  staty_stazeny_v: Date | null;
  staty_chyba: string | null;
  je_admin: boolean;
}

function mapuj(row: DbRow): PlayerRow {
  return {
    steamId: row.steam_id,
    alias: row.alias,
    steamName: row.steam_name,
    avatarUrl: row.avatar_url,
    country: row.country,
    elo1v1: row.elo_1v1,
    eloNejvyssi: row.elo_nejvyssi,
    odehranoHer: row.odehrano_her,
    posledniZapas: row.posledni_zapas,
    steamHodiny: row.steam_hodiny,
    statyStazenyV: row.staty_stazeny_v,
    statyChyba: row.staty_chyba,
    jeAdmin: row.je_admin,
  };
}

export async function upsertPlayer(steamId: string, jeAdmin: boolean): Promise<PlayerRow> {
  const { rows } = await getPool().query<DbRow>(
    `INSERT INTO player (steam_id, je_admin) VALUES ($1, $2)
     ON CONFLICT (steam_id) DO UPDATE SET je_admin = EXCLUDED.je_admin
     RETURNING ${SLOUPCE}`,
    [steamId, jeAdmin],
  );
  return mapuj(rows[0]!);
}

export async function savePlayerStats(steamId: string, staty: PlayerStatsUpdate): Promise<void> {
  await getPool().query(
    `UPDATE player SET
       alias           = COALESCE($2, alias),
       steam_name      = COALESCE($3, steam_name),
       avatar_url      = COALESCE($4, avatar_url),
       country         = COALESCE($5, country),
       elo_1v1         = COALESCE($6, elo_1v1),
       elo_nejvyssi    = COALESCE($7, elo_nejvyssi),
       odehrano_her    = COALESCE($8, odehrano_her),
       posledni_zapas  = COALESCE($9, posledni_zapas),
       steam_hodiny    = CASE WHEN $10::boolean THEN $11::integer ELSE steam_hodiny END,
       staty_stazeny_v = now(),
       staty_chyba     = $12
     WHERE steam_id = $1`,
    [
      steamId,
      staty.alias ?? null,
      staty.steamName ?? null,
      staty.avatarUrl ?? null,
      staty.country ?? null,
      staty.elo1v1 ?? null,
      staty.eloNejvyssi ?? null,
      staty.odehranoHer ?? null,
      staty.posledniZapas ?? null,
      "steamHodiny" in staty,
      staty.steamHodiny ?? null,
      staty.chyba,
    ],
  );
}

export async function getPlayer(steamId: string): Promise<PlayerRow | null> {
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SLOUPCE} FROM player WHERE steam_id = $1`,
    [steamId],
  );
  return rows[0] ? mapuj(rows[0]) : null;
}

export async function getPlayers(steamIds: string[]): Promise<PlayerRow[]> {
  if (steamIds.length === 0) return [];
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SLOUPCE} FROM player WHERE steam_id = ANY($1::text[])`,
    [steamIds],
  );
  return rows.map(mapuj);
}
```

Proč `CASE WHEN` u `steam_hodiny`: `null` znamená „profil je skrytý" a musí jít uložit. `COALESCE` by tuhle informaci zahodilo, protože nerozliší „skryté" od „tuhle hodnotu neaktualizuji".

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/players.ts src/db/players.db.test.ts
git commit -m "feat: store player identity and cached leaderboard stats"
```

---

## Task 7: Klienti externích API

Rozdělené na **parsování** (čistá funkce, testuje se z uložených odpovědí) a **stahování** (síť, netestuje se). Testy nikdy nesmí sáhnout na síť.

**Files:**
- Create: `src/external/worldsEdge.ts`, `src/external/steam.ts`
- Create: `src/external/fixtures/worldsedge-personalstat.json`
- Create: `src/external/fixtures/steam-playersummaries.json`
- Create: `src/external/fixtures/steam-ownedgames.json`
- Create: `src/external/fixtures/steam-ownedgames-skryte.json`
- Test: `src/external/worldsEdge.test.ts`, `src/external/steam.test.ts`

**Interfaces:**
- Produces:
  - `interface LeaderboardStats { alias: string; country: string | null; elo1v1: number | null; eloNejvyssi: number | null; odehranoHer: number | null; posledniZapas: Date | null }`
  - `parsePersonalStat(json: unknown, steamId: string): LeaderboardStats | null`
  - `fetchPersonalStat(steamId: string, fetchImpl?: typeof fetch): Promise<LeaderboardStats | null>`
  - `interface SteamProfile { personaName: string; avatarUrl: string }`
  - `parsePlayerSummaries(json: unknown, steamId: string): SteamProfile | null`
  - `parseOwnedGames(json: unknown): number | null`
  - `fetchSteamProfile(steamId: string, apiKey: string, fetchImpl?: typeof fetch): Promise<SteamProfile | null>`
  - `fetchSteamHours(steamId: string, apiKey: string, fetchImpl?: typeof fetch): Promise<number | null>`

- [ ] **Step 1: Uložit odpovědi jako fixtures**

`src/external/fixtures/worldsedge-personalstat.json` (zkrácená skutečná odpověď z 2026-09-03):

```json
{
  "result": { "code": 0, "message": "SUCCESS" },
  "statGroups": [
    {
      "id": 80031,
      "type": 1,
      "members": [
        {
          "profile_id": 271202,
          "name": "/steam/76561198000635167",
          "alias": "Oni.Vinchester",
          "personal_statgroup_id": 80031,
          "country": "ru"
        }
      ]
    }
  ],
  "leaderboardStats": [
    {
      "statgroup_id": 80031,
      "leaderboard_id": 3,
      "wins": 1857,
      "losses": 724,
      "rank": 1,
      "rating": 2992,
      "highestrating": 3026,
      "lastmatchdate": 1788255997
    },
    {
      "statgroup_id": 80031,
      "leaderboard_id": 4,
      "wins": 844,
      "losses": 262,
      "rank": 89,
      "rating": 1975,
      "highestrating": 2041,
      "lastmatchdate": 1788253644
    }
  ]
}
```

`src/external/fixtures/steam-playersummaries.json`:

```json
{
  "response": {
    "players": [
      {
        "steamid": "76561198000635167",
        "personaname": "Vinchester",
        "avatarfull": "https://avatars.steamstatic.com/abc_full.jpg"
      }
    ]
  }
}
```

`src/external/fixtures/steam-ownedgames.json`:

```json
{ "response": { "game_count": 1, "games": [{ "appid": 813780, "playtime_forever": 73800 }] } }
```

`src/external/fixtures/steam-ownedgames-skryte.json`:

```json
{ "response": {} }
```

- [ ] **Step 2: Napsat padající testy pro Worlds Edge**

`src/external/worldsEdge.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import fixture from "./fixtures/worldsedge-personalstat.json" with { type: "json" };
import { parsePersonalStat } from "./worldsEdge.js";

describe("parsePersonalStat", () => {
  it("vytáhne jméno ve hře a 1v1 ELO", () => {
    const staty = parsePersonalStat(fixture, "76561198000635167");
    expect(staty).not.toBeNull();
    expect(staty!.alias).toBe("Oni.Vinchester");
    expect(staty!.elo1v1).toBe(2992);
    expect(staty!.eloNejvyssi).toBe(3026);
    expect(staty!.country).toBe("ru");
  });

  it("počet odehraných her je součet výher a proher v 1v1", () => {
    expect(parsePersonalStat(fixture, "76561198000635167")!.odehranoHer).toBe(1857 + 724);
  });

  it("ignoruje týmový žebříček", () => {
    // leaderboard_id 4 má rating 1975 — nesmí se použít
    expect(parsePersonalStat(fixture, "76561198000635167")!.elo1v1).not.toBe(1975);
  });

  it("převede datum posledního zápasu", () => {
    const staty = parsePersonalStat(fixture, "76561198000635167");
    expect(staty!.posledniZapas).toEqual(new Date(1788255997 * 1000));
  });

  it("vrátí null pro cizí Steam ID", () => {
    expect(parsePersonalStat(fixture, "76561198999999999")).toBeNull();
  });

  it("vrátí null pro nesmyslnou odpověď", () => {
    expect(parsePersonalStat({}, "76561198000635167")).toBeNull();
    expect(parsePersonalStat(null, "76561198000635167")).toBeNull();
    expect(parsePersonalStat("<html>chyba</html>", "76561198000635167")).toBeNull();
  });

  it("hráč bez záznamu v 1v1 žebříčku má ELO null, ale alias zůstane", () => {
    const bezZebricku = {
      statGroups: [
        { id: 5, members: [{ name: "/steam/1", alias: "Novacek", personal_statgroup_id: 5, country: "cz" }] },
      ],
      leaderboardStats: [],
    };
    const staty = parsePersonalStat(bezZebricku, "1");
    expect(staty!.alias).toBe("Novacek");
    expect(staty!.elo1v1).toBeNull();
    expect(staty!.odehranoHer).toBeNull();
  });
});
```

- [ ] **Step 3: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/external/worldsEdge.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 4: Napsat Worlds Edge klienta**

`src/external/worldsEdge.ts`:

```ts
export interface LeaderboardStats {
  alias: string;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
}

/** SOLO_RM_RANKED — 1v1 Random Map. Ostatní žebříčky se ignorují. */
const ZEBRICEK_1V1 = 3;

const ZAKLAD = "https://aoe-api.worldsedgelink.com/community/leaderboard";

interface Member {
  name?: unknown;
  alias?: unknown;
  personal_statgroup_id?: unknown;
  country?: unknown;
}

function cisloNeboNull(hodnota: unknown): number | null {
  return typeof hodnota === "number" && Number.isFinite(hodnota) ? hodnota : null;
}

export function parsePersonalStat(json: unknown, steamId: string): LeaderboardStats | null {
  if (typeof json !== "object" || json === null) return null;
  const data = json as { statGroups?: unknown; leaderboardStats?: unknown };
  if (!Array.isArray(data.statGroups)) return null;

  const hledane = `/steam/${steamId}`;
  let member: Member | undefined;
  for (const skupina of data.statGroups) {
    const members = (skupina as { members?: unknown }).members;
    if (!Array.isArray(members)) continue;
    const nalezeny = members.find((m) => (m as Member).name === hledane) as Member | undefined;
    if (nalezeny) {
      member = nalezeny;
      break;
    }
  }
  if (!member || typeof member.alias !== "string") return null;

  const statgroupId = member.personal_statgroup_id;
  const staty = Array.isArray(data.leaderboardStats) ? data.leaderboardStats : [];
  const radek = staty.find(
    (s) =>
      (s as { statgroup_id?: unknown }).statgroup_id === statgroupId &&
      (s as { leaderboard_id?: unknown }).leaderboard_id === ZEBRICEK_1V1,
  ) as Record<string, unknown> | undefined;

  const wins = radek ? cisloNeboNull(radek["wins"]) : null;
  const losses = radek ? cisloNeboNull(radek["losses"]) : null;
  const lastMatch = radek ? cisloNeboNull(radek["lastmatchdate"]) : null;

  return {
    alias: member.alias,
    country: typeof member.country === "string" ? member.country : null,
    elo1v1: radek ? cisloNeboNull(radek["rating"]) : null,
    eloNejvyssi: radek ? cisloNeboNull(radek["highestrating"]) : null,
    odehranoHer: wins !== null && losses !== null ? wins + losses : null,
    posledniZapas: lastMatch !== null ? new Date(lastMatch * 1000) : null,
  };
}

export async function fetchPersonalStat(
  steamId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const profily = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&profile_names=${profily}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStat(await res.json(), steamId);
}
```

- [ ] **Step 5: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/external/worldsEdge.test.ts`
Expected: PASS

- [ ] **Step 6: Napsat padající testy pro Steam**

`src/external/steam.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import ownedGames from "./fixtures/steam-ownedgames.json" with { type: "json" };
import ownedGamesSkryte from "./fixtures/steam-ownedgames-skryte.json" with { type: "json" };
import summaries from "./fixtures/steam-playersummaries.json" with { type: "json" };
import { parseOwnedGames, parsePlayerSummaries } from "./steam.js";

describe("parsePlayerSummaries", () => {
  it("vytáhne přezdívku a avatar", () => {
    const profil = parsePlayerSummaries(summaries, "76561198000635167");
    expect(profil).toEqual({
      personaName: "Vinchester",
      avatarUrl: "https://avatars.steamstatic.com/abc_full.jpg",
    });
  });

  it("vrátí null pro cizí Steam ID i pro nesmysl", () => {
    expect(parsePlayerSummaries(summaries, "76561198999999999")).toBeNull();
    expect(parsePlayerSummaries({}, "76561198000635167")).toBeNull();
  });
});

describe("parseOwnedGames", () => {
  it("převede minuty na celé hodiny", () => {
    expect(parseOwnedGames(ownedGames)).toBe(1230);
  });

  it("skrytý profil vrátí null, ne nulu", () => {
    expect(parseOwnedGames(ownedGamesSkryte)).toBeNull();
  });

  it("hráč, který AoE2 nevlastní, vrátí null", () => {
    expect(parseOwnedGames({ response: { game_count: 0, games: [] } })).toBeNull();
  });

  it("nesmyslná odpověď vrátí null", () => {
    expect(parseOwnedGames(null)).toBeNull();
  });
});
```

- [ ] **Step 7: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/external/steam.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 8: Napsat Steam klienta**

`src/external/steam.ts`:

```ts
export interface SteamProfile {
  personaName: string;
  avatarUrl: string;
}

const AOE2_APPID = 813780;
const ZAKLAD = "https://api.steampowered.com";

export function parsePlayerSummaries(json: unknown, steamId: string): SteamProfile | null {
  const hraci = (json as { response?: { players?: unknown } })?.response?.players;
  if (!Array.isArray(hraci)) return null;
  const hrac = hraci.find((h) => (h as { steamid?: unknown }).steamid === steamId) as
    | Record<string, unknown>
    | undefined;
  if (!hrac) return null;
  const personaName = hrac["personaname"];
  const avatarUrl = hrac["avatarfull"];
  if (typeof personaName !== "string" || typeof avatarUrl !== "string") return null;
  return { personaName, avatarUrl };
}

/** Vrací celé hodiny, nebo null když je profil skrytý nebo hru nevlastní. */
export function parseOwnedGames(json: unknown): number | null {
  const hry = (json as { response?: { games?: unknown } })?.response?.games;
  if (!Array.isArray(hry)) return null;
  const aoe = hry.find((h) => (h as { appid?: unknown }).appid === AOE2_APPID) as
    | { playtime_forever?: unknown }
    | undefined;
  const minuty = aoe?.playtime_forever;
  if (typeof minuty !== "number" || !Number.isFinite(minuty)) return null;
  return Math.floor(minuty / 60);
}

export async function fetchSteamProfile(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamProfile | null> {
  const url = `${ZAKLAD}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Steam odpovědělo ${res.status}`);
  return parsePlayerSummaries(await res.json(), steamId);
}

export async function fetchSteamHours(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const url =
    `${ZAKLAD}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
    `&appids_filter[0]=${AOE2_APPID}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Steam odpovědělo ${res.status}`);
  return parseOwnedGames(await res.json());
}
```

- [ ] **Step 9: Spustit celou rychlou sadu**

Run: `npm test`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/external
git commit -m "feat: read leaderboard stats and Steam profile from stored fixtures"
```

---

## Task 8: Obnova statistik hráče

**Files:**
- Create: `src/players/refresh.ts`
- Test: `src/players/refresh.test.ts`

**Interfaces:**
- Consumes: `savePlayerStats`, `PlayerStatsUpdate` z `src/db/players.js`; `LeaderboardStats` z `src/external/worldsEdge.js`; `SteamProfile` z `src/external/steam.js`
- Produces:
  - `CACHE_TTL_MS: number` (900 000)
  - `jeCerstve(statyStazenyV: Date | null, ted?: Date): boolean`
  - `interface RefreshDeps { nactiZebricek: (steamId: string) => Promise<LeaderboardStats | null>; nactiProfil: (steamId: string) => Promise<SteamProfile | null>; nactiHodiny: (steamId: string) => Promise<number | null>; uloz: (steamId: string, staty: PlayerStatsUpdate) => Promise<void> }`
  - `refreshPlayerStats(steamId: string, deps: RefreshDeps): Promise<void>` — **nikdy nevyhodí výjimku**

- [ ] **Step 1: Napsat padající testy**

`src/players/refresh.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import type { PlayerStatsUpdate } from "../db/players.js";
import { CACHE_TTL_MS, jeCerstve, refreshPlayerStats, type RefreshDeps } from "./refresh.js";

const ZEBRICEK = {
  alias: "TenceR",
  country: "cz",
  elo1v1: 1847,
  eloNejvyssi: 1901,
  odehranoHer: 512,
  posledniZapas: new Date("2026-08-30T10:00:00Z"),
};

function depsSe(prepis: Partial<RefreshDeps> = {}) {
  const ulozeno: PlayerStatsUpdate[] = [];
  const deps: RefreshDeps = {
    nactiZebricek: vi.fn(async () => ZEBRICEK),
    nactiProfil: vi.fn(async () => ({ personaName: "Vlasta", avatarUrl: "https://a/b.jpg" })),
    nactiHodiny: vi.fn(async () => 1230),
    uloz: vi.fn(async (_id: string, staty: PlayerStatsUpdate) => {
      ulozeno.push(staty);
    }),
    ...prepis,
  };
  return { deps, ulozeno };
}

describe("jeCerstve", () => {
  const ted = new Date("2026-09-03T12:00:00Z");

  it("nikdy nestažené není čerstvé", () => {
    expect(jeCerstve(null, ted)).toBe(false);
  });

  it("čerstvé je do patnácti minut", () => {
    expect(jeCerstve(new Date(ted.getTime() - CACHE_TTL_MS + 1000), ted)).toBe(true);
    expect(jeCerstve(new Date(ted.getTime() - CACHE_TTL_MS - 1000), ted)).toBe(false);
  });
});

describe("refreshPlayerStats", () => {
  it("uloží všechno z obou zdrojů", async () => {
    const { deps, ulozeno } = depsSe();
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno).toHaveLength(1);
    expect(ulozeno[0]).toMatchObject({
      alias: "TenceR",
      elo1v1: 1847,
      odehranoHer: 512,
      steamName: "Vlasta",
      steamHodiny: 1230,
      chyba: null,
    });
  });

  it("skryté hodiny uloží jako null, ne jako chybu", async () => {
    const { deps, ulozeno } = depsSe({ nactiHodiny: vi.fn(async () => null) });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.steamHodiny).toBeNull();
    expect(ulozeno[0]!.chyba).toBeNull();
  });

  it("pád žebříčku nevyhodí výjimku a zapíše se jako chyba", async () => {
    const { deps, ulozeno } = depsSe({
      nactiZebricek: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
    expect(ulozeno[0]!.chyba).toMatch(/žebříček/i);
  });

  it("pád žebříčku nezabrání uložení dat ze Steamu", async () => {
    const { deps, ulozeno } = depsSe({
      nactiZebricek: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.steamName).toBe("Vlasta");
    expect(ulozeno[0]!.steamHodiny).toBe(1230);
  });

  it("pád obou zdrojů pořád jen zapíše chybu", async () => {
    const selze = vi.fn(async () => {
      throw new Error("mimo provoz");
    });
    const { deps, ulozeno } = depsSe({
      nactiZebricek: selze,
      nactiProfil: selze,
      nactiHodiny: selze,
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
    expect(ulozeno[0]!.chyba).toBeTruthy();
  });

  it("selhání zápisu do databáze nevyhodí výjimku ven", async () => {
    const { deps } = depsSe({
      uloz: vi.fn(async () => {
        throw new Error("databáze spí");
      }),
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
  });

  it("neznámý hráč v žebříčku se uloží bez aliasu a bez chyby", async () => {
    const { deps, ulozeno } = depsSe({ nactiZebricek: vi.fn(async () => null) });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.alias).toBeNull();
    expect(ulozeno[0]!.chyba).toBeNull();
  });
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/players/refresh.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Napsat implementaci**

`src/players/refresh.ts`:

```ts
import type { PlayerStatsUpdate } from "../db/players.js";
import type { SteamProfile } from "../external/steam.js";
import type { LeaderboardStats } from "../external/worldsEdge.js";

export const CACHE_TTL_MS = 15 * 60 * 1000;

export function jeCerstve(statyStazenyV: Date | null, ted: Date = new Date()): boolean {
  if (!statyStazenyV) return false;
  return ted.getTime() - statyStazenyV.getTime() < CACHE_TTL_MS;
}

export interface RefreshDeps {
  nactiZebricek: (steamId: string) => Promise<LeaderboardStats | null>;
  nactiProfil: (steamId: string) => Promise<SteamProfile | null>;
  nactiHodiny: (steamId: string) => Promise<number | null>;
  uloz: (steamId: string, staty: PlayerStatsUpdate) => Promise<void>;
}

/**
 * Stáhne a uloží statistiky. Nikdy nevyhodí výjimku — selhání externího zdroje
 * se zapíše do sloupce staty_chyba a nesmí zablokovat přihlášení uživatele.
 */
export async function refreshPlayerStats(steamId: string, deps: RefreshDeps): Promise<void> {
  const chyby: string[] = [];

  const [zebricek, profil, hodiny] = await Promise.all([
    deps.nactiZebricek(steamId).catch((err: unknown) => {
      chyby.push(`Žebříček: ${popis(err)}`);
      return null;
    }),
    deps.nactiProfil(steamId).catch((err: unknown) => {
      chyby.push(`Steam profil: ${popis(err)}`);
      return null;
    }),
    deps.nactiHodiny(steamId).catch((err: unknown) => {
      chyby.push(`Steam hodiny: ${popis(err)}`);
      return undefined;
    }),
  ]);

  const staty: PlayerStatsUpdate = {
    alias: zebricek?.alias ?? null,
    country: zebricek?.country ?? null,
    elo1v1: zebricek?.elo1v1 ?? null,
    eloNejvyssi: zebricek?.eloNejvyssi ?? null,
    odehranoHer: zebricek?.odehranoHer ?? null,
    posledniZapas: zebricek?.posledniZapas ?? null,
    steamName: profil?.personaName ?? null,
    avatarUrl: profil?.avatarUrl ?? null,
    chyba: chyby.length > 0 ? chyby.join("; ") : null,
  };

  // undefined = načtení selhalo, hodnotu v databázi nesaháme.
  // null = profil je skrytý, a to se uložit musí.
  if (hodiny !== undefined) staty.steamHodiny = hodiny;

  try {
    await deps.uloz(steamId, staty);
  } catch {
    // Zápis selhal. Přihlášení tím nesmí spadnout; hodnoty se doplní příště.
  }
}

function popis(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
```

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/players/refresh.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/players
git commit -m "feat: refresh player stats without ever failing the request"
```

---

## Task 9: Steam OpenID a úložiště relací

Steam používá OpenID 2.0. Knihovna na to není potřeba — jde o jedno přesměrování a jedno ověřovací POST volání zpět na Steam.

**Files:**
- Create: `src/auth/steamOpenId.ts`, `src/db/sessions.ts`
- Test: `src/auth/steamOpenId.test.ts`, `src/db/sessions.db.test.ts`

**Interfaces:**
- Consumes: `getPool` z `src/db/pool.js`
- Produces:
  - `buildAuthUrl(baseUrl: string): string`
  - `extractSteamId(params: URLSearchParams): string | null`
  - `buildVerificationBody(params: URLSearchParams): URLSearchParams`
  - `isVerified(responseBody: string): boolean`
  - `SESSION_TTL_MS: number` (30 dní)
  - `createSession(steamId: string): Promise<string>` — vrací `sid`
  - `getSessionUser(sid: string): Promise<string | null>` — vrací `steamId` nebo `null`
  - `deleteSession(sid: string): Promise<void>`
  - `deleteExpiredSessions(): Promise<number>`

- [ ] **Step 1: Napsat padající testy pro OpenID**

`src/auth/steamOpenId.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildAuthUrl, buildVerificationBody, extractSteamId, isVerified } from "./steamOpenId.js";

describe("buildAuthUrl", () => {
  const url = new URL(buildAuthUrl("https://hry.example.com"));

  it("míří na Steam", () => {
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
  });

  it("nese návratovou adresu odvozenou od základní URL", () => {
    expect(url.searchParams.get("openid.return_to")).toBe(
      "https://hry.example.com/api/auth/steam/return",
    );
    expect(url.searchParams.get("openid.realm")).toBe("https://hry.example.com");
  });

  it("žádá o identifikátor podle specifikace", () => {
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.identity")).toBe(
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
  });

  it("nezdvojí lomítko, když základní URL končí lomítkem", () => {
    const s = new URL(buildAuthUrl("https://hry.example.com/"));
    expect(s.searchParams.get("openid.return_to")).toBe(
      "https://hry.example.com/api/auth/steam/return",
    );
  });
});

describe("extractSteamId", () => {
  it("vytáhne Steam ID z claimed_id", () => {
    const params = new URLSearchParams({
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000635167",
    });
    expect(extractSteamId(params)).toBe("76561198000635167");
  });

  it("odmítne cizí doménu", () => {
    const params = new URLSearchParams({
      "openid.claimed_id": "https://zlouni.example.com/openid/id/76561198000635167",
    });
    expect(extractSteamId(params)).toBeNull();
  });

  it("odmítne nečíselné ID a chybějící parametr", () => {
    expect(
      extractSteamId(new URLSearchParams({ "openid.claimed_id": "https://steamcommunity.com/openid/id/abc" })),
    ).toBeNull();
    expect(extractSteamId(new URLSearchParams())).toBeNull();
  });
});

describe("buildVerificationBody", () => {
  it("zopakuje parametry a přepne režim na ověření", () => {
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    const body = buildVerificationBody(params);
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.sig")).toBe("xyz");
  });
});

describe("isVerified", () => {
  it("pozná kladnou odpověď", () => {
    expect(isVerified("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")).toBe(true);
  });

  it("pozná zápornou odpověď", () => {
    expect(isVerified("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n")).toBe(false);
    expect(isVerified("")).toBe(false);
  });
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/auth/steamOpenId.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 3: Napsat OpenID modul**

`src/auth/steamOpenId.ts`:

```ts
const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_PREFIX = "https://steamcommunity.com/openid/id/";

export function buildAuthUrl(baseUrl: string): string {
  const zaklad = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${zaklad}/api/auth/steam/return`,
    "openid.realm": zaklad,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

export function extractSteamId(params: URLSearchParams): string | null {
  const claimed = params.get("openid.claimed_id");
  if (!claimed?.startsWith(CLAIMED_ID_PREFIX)) return null;
  const id = claimed.slice(CLAIMED_ID_PREFIX.length);
  return /^\d{17}$/.test(id) ? id : null;
}

export function buildVerificationBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");
  return body;
}

export function isVerified(responseBody: string): boolean {
  return /^is_valid\s*:\s*true\s*$/m.test(responseBody);
}

export async function verifyWithSteam(
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(STEAM_OPENID, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildVerificationBody(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return false;
  return isVerified(await res.text());
}
```

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/auth/steamOpenId.test.ts`
Expected: PASS

- [ ] **Step 5: Napsat padající testy pro relace**

`src/db/sessions.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { closePool, getPool } from "./pool.js";
import { upsertPlayer } from "./players.js";
import { createSession, deleteExpiredSessions, deleteSession, getSessionUser } from "./sessions.js";

const STEAM_ID = "76561198000000010";

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
  await upsertPlayer(STEAM_ID, false);
});

afterAll(async () => {
  await closePool();
});

it("založí relaci a vrátí podle ní hráče", async () => {
  const sid = await createSession(STEAM_ID);
  expect(sid).toHaveLength(64);
  expect(await getSessionUser(sid)).toBe(STEAM_ID);
});

it("neznámá relace vrátí null", async () => {
  expect(await getSessionUser("neexistuje")).toBeNull();
});

it("prošlá relace vrátí null", async () => {
  const sid = await createSession(STEAM_ID);
  await getPool().query("UPDATE session SET plati_do = now() - interval '1 hour' WHERE sid = $1", [sid]);
  expect(await getSessionUser(sid)).toBeNull();
});

it("odhlášení relaci smaže", async () => {
  const sid = await createSession(STEAM_ID);
  await deleteSession(sid);
  expect(await getSessionUser(sid)).toBeNull();
});

it("úklid smaže jen prošlé relace", async () => {
  const platna = await createSession(STEAM_ID);
  const prosla = await createSession(STEAM_ID);
  await getPool().query("UPDATE session SET plati_do = now() - interval '1 day' WHERE sid = $1", [prosla]);

  expect(await deleteExpiredSessions()).toBe(1);
  expect(await getSessionUser(platna)).toBe(STEAM_ID);
});

it("relace přežije restart procesu", async () => {
  const sid = await createSession(STEAM_ID);
  await closePool();
  expect(await getSessionUser(sid)).toBe(STEAM_ID);
});
```

- [ ] **Step 6: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — `./sessions.js` neexistuje

- [ ] **Step 7: Napsat úložiště relací**

`src/db/sessions.ts`:

```ts
import { randomBytes } from "node:crypto";
import { getPool } from "./pool.js";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(steamId: string): Promise<string> {
  const sid = randomBytes(32).toString("hex");
  const platiDo = new Date(Date.now() + SESSION_TTL_MS);
  await getPool().query("INSERT INTO session (sid, steam_id, plati_do) VALUES ($1, $2, $3)", [
    sid,
    steamId,
    platiDo,
  ]);
  return sid;
}

export async function getSessionUser(sid: string): Promise<string | null> {
  const { rows } = await getPool().query<{ steam_id: string }>(
    "SELECT steam_id FROM session WHERE sid = $1 AND plati_do > now()",
    [sid],
  );
  return rows[0]?.steam_id ?? null;
}

export async function deleteSession(sid: string): Promise<void> {
  await getPool().query("DELETE FROM session WHERE sid = $1", [sid]);
}

export async function deleteExpiredSessions(): Promise<number> {
  const { rowCount } = await getPool().query("DELETE FROM session WHERE plati_do <= now()");
  return rowCount ?? 0;
}
```

- [ ] **Step 8: Spustit testy a ověřit, že procházejí**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add src/auth src/db/sessions.ts src/db/sessions.db.test.ts
git commit -m "feat: verify Steam OpenID logins and persist sessions in Postgres"
```

---

## Task 10: Přihlašovací routy

**Files:**
- Create: `src/config.ts`
- Create: `src/auth/routes.ts`
- Modify: `src/http/server.ts` (registrace cookies a rout)
- Create: `src/main.ts`
- Test: `src/auth/routes.db.test.ts`

**Interfaces:**
- Consumes: `buildAuthUrl`, `extractSteamId`, `verifyWithSteam`; `createSession`, `getSessionUser`, `deleteSession`; `upsertPlayer`, `getPlayer`; `refreshPlayerStats`, `jeCerstve`
- Produces:
  - `config: { baseUrl: string; port: number; steamApiKey: string; adminSteamId: string; jeProdukce: boolean }`
  - `registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void`
  - `interface AuthDeps { overSteam: (params: URLSearchParams) => Promise<boolean>; obnovStaty: (steamId: string) => Promise<void> }`
  - `currentUser(request: FastifyRequest): Promise<string | null>`
  - Cookie `sid`: `HttpOnly`, `SameSite=Lax`, `Secure` pokud `jeProdukce`, `Path=/`

- [ ] **Step 1: Napsat konfiguraci**

`src/config.ts`:

```ts
function povinne(jmeno: string): string {
  const hodnota = process.env[jmeno];
  if (!hodnota) throw new Error(`Chybí proměnná prostředí ${jmeno}.`);
  return hodnota;
}

export const config = {
  baseUrl: process.env["BASE_URL"] ?? "http://localhost:3000",
  port: Number(process.env["PORT"] ?? 3000),
  steamApiKey: process.env["STEAM_API_KEY"] ?? "",
  adminSteamId: process.env["ADMIN_STEAM_ID"] ?? "",
  get jeProdukce(): boolean {
    return this.baseUrl.startsWith("https://");
  },
};

export { povinne };
```

- [ ] **Step 2: Napsat padající testy**

`src/auth/routes.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { closePool, getPool } from "../db/pool.js";
import { getPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";

const STEAM_ID = "76561198000000020";

const NAVRAT = new URLSearchParams({
  "openid.mode": "id_res",
  "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
  "openid.sig": "xyz",
});

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("přesměruje na Steam", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/auth/steam" });
  expect(res.statusCode).toBe(302);
  expect(res.headers["location"]).toContain("steamcommunity.com/openid/login");
  await app.close();
});

it("po ověření založí hráče, nastaví cookie a přesměruje na kořen", async () => {
  const obnovStaty = vi.fn(async () => {});
  const app = buildServer({ overSteam: async () => true, obnovStaty });
  const res = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${NAVRAT.toString()}`,
  });

  expect(res.statusCode).toBe(302);
  expect(res.headers["location"]).toBe("/");
  expect(res.cookies.find((c) => c.name === "sid")?.httpOnly).toBe(true);
  expect(await getPlayer(STEAM_ID)).not.toBeNull();
  expect(obnovStaty).toHaveBeenCalledWith(STEAM_ID);
  await app.close();
});

it("odmítne návrat, který Steam neověřil", async () => {
  const app = buildServer({ overSteam: async () => false, obnovStaty: async () => {} });
  const res = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${NAVRAT.toString()}`,
  });
  expect(res.statusCode).toBe(401);
  expect(await getPlayer(STEAM_ID)).toBeNull();
  await app.close();
});

it("selhání stahování statistik nezabrání přihlášení", async () => {
  const app = buildServer({
    overSteam: async () => true,
    obnovStaty: async () => {
      throw new Error("Worlds Edge mimo provoz");
    },
  });
  const res = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${NAVRAT.toString()}`,
  });
  expect(res.statusCode).toBe(302);
  expect(await getPlayer(STEAM_ID)).not.toBeNull();
  await app.close();
});

it("/api/me vrátí null bez cookie a hráče s cookie", async () => {
  const app = buildServer({ overSteam: async () => true, obnovStaty: async () => {} });

  const bez = await app.inject({ method: "GET", url: "/api/me" });
  expect(bez.json()).toEqual({ hrac: null });

  const prihlaseni = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${NAVRAT.toString()}`,
  });
  const sid = prihlaseni.cookies.find((c) => c.name === "sid")!.value;

  const s = await app.inject({ method: "GET", url: "/api/me", cookies: { sid } });
  expect(s.json().hrac.steamId).toBe(STEAM_ID);
  await app.close();
});

it("odhlášení zneplatní relaci", async () => {
  const app = buildServer({ overSteam: async () => true, obnovStaty: async () => {} });
  const prihlaseni = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${NAVRAT.toString()}`,
  });
  const sid = prihlaseni.cookies.find((c) => c.name === "sid")!.value;

  await app.inject({ method: "POST", url: "/api/auth/logout", cookies: { sid } });
  const po = await app.inject({ method: "GET", url: "/api/me", cookies: { sid } });
  expect(po.json()).toEqual({ hrac: null });
  await app.close();
});
```

- [ ] **Step 3: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — `buildServer` nebere parametry

- [ ] **Step 4: Napsat routy**

`src/auth/routes.ts`:

```ts
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getPlayer, upsertPlayer } from "../db/players.js";
import { createSession, deleteSession, getSessionUser } from "../db/sessions.js";
import { SESSION_TTL_MS } from "../db/sessions.js";
import { buildAuthUrl, extractSteamId } from "./steamOpenId.js";

export interface AuthDeps {
  overSteam: (params: URLSearchParams) => Promise<boolean>;
  obnovStaty: (steamId: string) => Promise<void>;
}

export async function currentUser(request: FastifyRequest): Promise<string | null> {
  const sid = request.cookies["sid"];
  return sid ? getSessionUser(sid) : null;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get("/api/auth/steam", async (_request, reply) => {
    return reply.redirect(buildAuthUrl(config.baseUrl), 302);
  });

  app.get("/api/auth/steam/return", async (request, reply) => {
    const params = new URLSearchParams(request.query as Record<string, string>);
    const steamId = extractSteamId(params);
    if (!steamId) return reply.code(401).send({ chyba: "Steam nevrátil platný identifikátor." });
    if (!(await deps.overSteam(params))) {
      return reply.code(401).send({ chyba: "Steam přihlášení se nepodařilo ověřit." });
    }

    await upsertPlayer(steamId, steamId === config.adminSteamId);

    // Statistiky se stahují mimo přihlašovací cestu. Když selžou, přihlášení platí dál.
    void deps.obnovStaty(steamId).catch(() => {});

    const sid = await createSession(steamId);
    return reply
      .setCookie("sid", sid, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.jeProdukce,
        path: "/",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      })
      .redirect("/", 302);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sid = request.cookies["sid"];
    if (sid) await deleteSession(sid);
    return reply.clearCookie("sid", { path: "/" }).send({ ok: true });
  });

  app.get("/api/me", async (request) => {
    const steamId = await currentUser(request);
    if (!steamId) return { hrac: null };
    return { hrac: await getPlayer(steamId) };
  });
}
```

- [ ] **Step 5: Rozšířit server o cookies a routy**

`src/http/server.ts`:

```ts
import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAuthRoutes, type AuthDeps } from "../auth/routes.js";
import { verifyWithSteam } from "../auth/steamOpenId.js";
import { config } from "../config.js";
import { getPlayer, savePlayerStats } from "../db/players.js";
import { fetchSteamHours, fetchSteamProfile } from "../external/steam.js";
import { fetchPersonalStat } from "../external/worldsEdge.js";
import { jeCerstve, refreshPlayerStats } from "../players/refresh.js";

function vychoziDeps(): AuthDeps {
  return {
    overSteam: (params) => verifyWithSteam(params),
    obnovStaty: async (steamId) => {
      // Worlds Edge je nezdokumentovaný endpoint bez známých limitů, takže se
      // stahuje nejvýš jednou za patnáct minut na hráče.
      const hrac = await getPlayer(steamId);
      if (jeCerstve(hrac?.statyStazenyV ?? null)) return;
      await refreshPlayerStats(steamId, {
        nactiZebricek: (id) => fetchPersonalStat(id),
        nactiProfil: (id) => fetchSteamProfile(id, config.steamApiKey),
        nactiHodiny: (id) => fetchSteamHours(id, config.steamApiKey),
        uloz: savePlayerStats,
      });
    },
  };
}

export function buildServer(deps: AuthDeps = vychoziDeps()): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.get("/api/health", async () => ({ ok: true }));
  registerAuthRoutes(app, deps);
  return app;
}
```

Fastify registruje pluginy asynchronně; aby `app.inject` v testech viděl cookies, přidej v testech `await app.ready()` — nebo nech `inject`, které `ready()` volá samo.

- [ ] **Step 6: Napsat vstupní bod**

`src/main.ts`:

```ts
import { config } from "./config.js";
import { deleteExpiredSessions } from "./db/sessions.js";
import { buildServer } from "./http/server.js";

const app = buildServer();
await app.listen({ port: config.port, host: "127.0.0.1" });
console.log(`Poslouchám na ${config.baseUrl} (port ${config.port})`);

setInterval(() => {
  void deleteExpiredSessions().catch(() => {});
}, 60 * 60 * 1000).unref();
```

- [ ] **Step 7: Spustit testy a ověřit, že procházejí**

Run: `npm run test:db && npm test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add src/config.ts src/auth/routes.ts src/auth/routes.db.test.ts src/http/server.ts src/main.ts
git commit -m "feat: log players in through Steam without blocking on stats"
```

---

## Task 11: Akce a přihlášky

**Files:**
- Create: `src/db/events.ts`
- Create: `src/http/guards.ts`
- Create: `src/http/routes/events.ts`
- Modify: `src/http/server.ts` (registrace rout)
- Test: `src/db/events.db.test.ts`, `src/http/routes/events.db.test.ts`

**Interfaces:**
- Consumes: `getPool` z `src/db/pool.js`; `PlayerRow` z `src/db/players.js`; `currentUser` z `src/auth/routes.js`
- Produces:
  - `type AkceStav = "priprava" | "prihlasovani" | "zavreno" | "bezi" | "konec"`
  - `interface AkceRow { id: number; nazev: string; stav: AkceStav }`
  - `createAkce(nazev: string): Promise<AkceRow>`
  - `getAktivniAkce(): Promise<AkceRow | null>` — nejnovější akce, která není ve stavu `konec`
  - `setAkceStav(akceId: number, stav: AkceStav): Promise<AkceRow>`
  - `signUp(akceId: number, steamId: string): Promise<void>`
  - `withdraw(akceId: number, steamId: string): Promise<void>`
  - `listSignups(akceId: number): Promise<PlayerRow[]>` — jen `stav = 'prihlasen'`, řazeno podle času přihlášení
  - `requireUser(request: FastifyRequest, reply: FastifyReply): Promise<string>` — vyhodí `HttpError(401)`
  - `requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<string>` — vyhodí `HttpError(403)`

- [ ] **Step 1: Napsat padající testy pro úložiště**

`src/db/events.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createAkce,
  getAktivniAkce,
  listSignups,
  setAkceStav,
  signUp,
  withdraw,
} from "./events.js";
import { closePool, getPool } from "./pool.js";
import { savePlayerStats, upsertPlayer } from "./players.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  await getPool().query("ALTER SEQUENCE akce_id_seq RESTART WITH 1");
});

afterAll(async () => {
  await closePool();
});

it("nová akce začíná v přípravě", async () => {
  const akce = await createAkce("Coop Kings večer");
  expect(akce.nazev).toBe("Coop Kings večer");
  expect(akce.stav).toBe("priprava");
});

it("aktivní akce je ta nejnovější nedokončená", async () => {
  const stara = await createAkce("stará");
  await setAkceStav(stara.id, "konec");
  const nova = await createAkce("nová");
  expect((await getAktivniAkce())?.id).toBe(nova.id);
});

it("bez akce vrátí null", async () => {
  expect(await getAktivniAkce()).toBeNull();
});

it("přihláška a odhlášení mění seznam", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000031", false);
  await upsertPlayer("76561198000000032", false);

  await signUp(akce.id, "76561198000000031");
  await signUp(akce.id, "76561198000000032");
  expect(await listSignups(akce.id)).toHaveLength(2);

  await withdraw(akce.id, "76561198000000031");
  const zbyli = await listSignups(akce.id);
  expect(zbyli.map((h) => h.steamId)).toEqual(["76561198000000032"]);
});

it("dvojí přihlášení nezaloží druhý řádek", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000033", false);
  await signUp(akce.id, "76561198000000033");
  await signUp(akce.id, "76561198000000033");
  expect(await listSignups(akce.id)).toHaveLength(1);
});

it("po odhlášení se jde přihlásit znovu", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000034", false);
  await signUp(akce.id, "76561198000000034");
  await withdraw(akce.id, "76561198000000034");
  await signUp(akce.id, "76561198000000034");
  expect(await listSignups(akce.id)).toHaveLength(1);
});

it("seznam nese statistiky hráče", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000035", false);
  await savePlayerStats("76561198000000035", { alias: "TenceR", elo1v1: 1847, chyba: null });
  await signUp(akce.id, "76561198000000035");

  const [hrac] = await listSignups(akce.id);
  expect(hrac!.alias).toBe("TenceR");
  expect(hrac!.elo1v1).toBe(1847);
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — `./events.js` neexistuje

- [ ] **Step 3: Napsat úložiště akcí**

`src/db/events.ts`:

```ts
import { getPool } from "./pool.js";
import type { PlayerRow } from "./players.js";

export type AkceStav = "priprava" | "prihlasovani" | "zavreno" | "bezi" | "konec";

export interface AkceRow {
  id: number;
  nazev: string;
  stav: AkceStav;
}

interface AkceDbRow {
  id: number;
  nazev: string;
  stav: AkceStav;
}

export async function createAkce(nazev: string): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    "INSERT INTO akce (nazev) VALUES ($1) RETURNING id, nazev, stav",
    [nazev],
  );
  return rows[0]!;
}

export async function getAktivniAkce(): Promise<AkceRow | null> {
  const { rows } = await getPool().query<AkceDbRow>(
    "SELECT id, nazev, stav FROM akce WHERE stav <> 'konec' ORDER BY id DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function setAkceStav(akceId: number, stav: AkceStav): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    "UPDATE akce SET stav = $2 WHERE id = $1 RETURNING id, nazev, stav",
    [akceId, stav],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return rows[0];
}

export async function signUp(akceId: number, steamId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO prihlaska (akce_id, steam_id, stav, kdy) VALUES ($1, $2, 'prihlasen', now())
     ON CONFLICT (akce_id, steam_id) DO UPDATE SET stav = 'prihlasen', kdy = now()`,
    [akceId, steamId],
  );
}

export async function withdraw(akceId: number, steamId: string): Promise<void> {
  await getPool().query(
    "UPDATE prihlaska SET stav = 'odhlasen' WHERE akce_id = $1 AND steam_id = $2",
    [akceId, steamId],
  );
}

export async function listSignups(akceId: number): Promise<PlayerRow[]> {
  const { rows } = await getPool().query<Record<string, never>>(
    `SELECT p.steam_id, p.alias, p.steam_name, p.avatar_url, p.country, p.elo_1v1,
            p.elo_nejvyssi, p.odehrano_her, p.posledni_zapas, p.steam_hodiny,
            p.staty_stazeny_v, p.staty_chyba, p.je_admin
       FROM prihlaska pr
       JOIN player p ON p.steam_id = pr.steam_id
      WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen'
      ORDER BY pr.kdy ASC`,
    [akceId],
  );
  return rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      steamId: row["steam_id"] as string,
      alias: row["alias"] as string | null,
      steamName: row["steam_name"] as string | null,
      avatarUrl: row["avatar_url"] as string | null,
      country: row["country"] as string | null,
      elo1v1: row["elo_1v1"] as number | null,
      eloNejvyssi: row["elo_nejvyssi"] as number | null,
      odehranoHer: row["odehrano_her"] as number | null,
      posledniZapas: row["posledni_zapas"] as Date | null,
      steamHodiny: row["steam_hodiny"] as number | null,
      statyStazenyV: row["staty_stazeny_v"] as Date | null,
      statyChyba: row["staty_chyba"] as string | null,
      jeAdmin: row["je_admin"] as boolean,
    };
  });
}
```

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 5: Napsat stráže oprávnění**

`src/http/guards.ts`:

```ts
import type { FastifyRequest } from "fastify";
import { currentUser } from "../auth/routes.js";
import { getPlayer } from "../db/players.js";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(request: FastifyRequest): Promise<string> {
  const steamId = await currentUser(request);
  if (!steamId) throw new HttpError(401, "Nejsi přihlášený.");
  return steamId;
}

export async function requireAdmin(request: FastifyRequest): Promise<string> {
  const steamId = await requireUser(request);
  const hrac = await getPlayer(steamId);
  if (!hrac?.jeAdmin) throw new HttpError(403, "Tohle smí jen Rob.");
  return steamId;
}
```

- [ ] **Step 6: Napsat padající testy pro routy**

`src/http/routes/events.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, listSignups, setAkceStav } from "../../db/events.js";
import { closePool, getPool } from "../../db/pool.js";
import { upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { buildServer } from "../server.js";

const HRAC = "76561198000000040";
const ROB = "76561198000000041";

async function prihlasenyKlient(steamId: string, jeAdmin: boolean) {
  await upsertPlayer(steamId, jeAdmin);
  return { sid: await createSession(steamId) };
}

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("nepřihlášený se nepřihlásí do akce", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const app = buildServer();
  const res = await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska` });
  expect(res.statusCode).toBe(401);
  await app.close();
});

it("přihlášený se přidá do seznamu", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/prihlaska`,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  expect(await listSignups(akce.id)).toHaveLength(1);
  await app.close();
});

it("do zavřené akce se přihlásit nejde", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "zavreno");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/prihlaska`,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(409);
  expect(res.json().chyba).toMatch(/není otevřené/i);
  await app.close();
});

it("běžný hráč nesmí zakládat akci ani měnit stav", async () => {
  const { sid } = await prihlasenyKlient(HRAC, false);
  const app = buildServer();

  const zalozeni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "moje akce" },
  });
  expect(zalozeni.statusCode).toBe(403);
  await app.close();
});

it("Rob smí založit akci a otevřít přihlašování", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();

  const zalozeni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "Coop Kings" },
  });
  expect(zalozeni.statusCode).toBe(200);
  const akceId = zalozeni.json().akce.id;

  const stav = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/stav`,
    cookies: { sid },
    payload: { stav: "prihlasovani" },
  });
  expect(stav.json().akce.stav).toBe("prihlasovani");
  await app.close();
});

it("GET /api/akce vrátí aktivní akci se seznamem", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });

  const res = await app.inject({ method: "GET", url: "/api/akce" });
  expect(res.json().akce.nazev).toBe("večer");
  expect(res.json().prihlaseni).toHaveLength(1);
  await app.close();
});

it("odhlášení hráče ze seznamu odebere", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });
  await app.inject({ method: "DELETE", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });
  expect(await listSignups(akce.id)).toHaveLength(0);
  await app.close();
});
```

- [ ] **Step 7: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — routy neexistují

- [ ] **Step 8: Napsat routy**

`src/http/routes/events.ts`:

```ts
import type { FastifyInstance } from "fastify";
import {
  createAkce,
  getAktivniAkce,
  listSignups,
  setAkceStav,
  signUp,
  withdraw,
  type AkceStav,
} from "../../db/events.js";
import { HttpError, requireAdmin, requireUser } from "../guards.js";

const STAVY: readonly AkceStav[] = ["priprava", "prihlasovani", "zavreno", "bezi", "konec"];

export function registerEventRoutes(app: FastifyInstance): void {
  app.get("/api/akce", async () => {
    const akce = await getAktivniAkce();
    if (!akce) return { akce: null, prihlaseni: [] };
    return { akce, prihlaseni: await listSignups(akce.id) };
  });

  app.post("/api/akce", async (request) => {
    await requireAdmin(request);
    const { nazev } = request.body as { nazev?: unknown };
    if (typeof nazev !== "string" || nazev.trim() === "") {
      throw new HttpError(400, "Akce musí mít název.");
    }
    return { akce: await createAkce(nazev.trim()) };
  });

  app.post("/api/akce/:id/stav", async (request) => {
    await requireAdmin(request);
    const akceId = Number((request.params as { id: string }).id);
    const { stav } = request.body as { stav?: unknown };
    if (typeof stav !== "string" || !STAVY.includes(stav as AkceStav)) {
      throw new HttpError(400, "Neznámý stav akce.");
    }
    return { akce: await setAkceStav(akceId, stav as AkceStav) };
  });

  app.post("/api/akce/:id/prihlaska", async (request) => {
    const steamId = await requireUser(request);
    const akceId = Number((request.params as { id: string }).id);
    const akce = await getAktivniAkce();
    if (!akce || akce.id !== akceId || akce.stav !== "prihlasovani") {
      throw new HttpError(409, "Přihlašování do téhle akce není otevřené.");
    }
    await signUp(akceId, steamId);
    return { ok: true };
  });

  app.delete("/api/akce/:id/prihlaska", async (request) => {
    const steamId = await requireUser(request);
    const akceId = Number((request.params as { id: string }).id);
    await withdraw(akceId, steamId);
    return { ok: true };
  });
}
```

- [ ] **Step 9: Zapojit routy a překlad chyb do serveru**

V `src/http/server.ts` přidej za `registerAuthRoutes(app, deps);`:

```ts
  registerEventRoutes(app);

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ chyba: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ chyba: "Něco se pokazilo na serveru." });
  });
```

a doplň importy `registerEventRoutes` z `./routes/events.js` a `HttpError` z `./guards.js`.

- [ ] **Step 10: Spustit testy a ověřit, že procházejí**

Run: `npm run test:db && npm test`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/db/events.ts src/db/events.db.test.ts src/http/guards.ts src/http/routes src/http/server.ts
git commit -m "feat: open signups for an event and list who is in"
```

---

## Task 12: Realtime — stav akce přes SSE

**Files:**
- Create: `src/realtime/hub.ts`
- Create: `src/realtime/akceStav.ts`
- Create: `src/http/routes/stream.ts`
- Modify: `src/http/routes/events.ts` (rozeslat stav po každé změně)
- Modify: `src/shared/types.ts` (přenosové typy)
- Modify: `src/http/server.ts`
- Test: `src/realtime/hub.test.ts`, `src/http/routes/stream.db.test.ts`

**Interfaces:**
- Produces:
  - `class Hub { subscribe(akceId: number, send: (data: string) => void): () => void; publish(akceId: number, payload: unknown): void; subscriberCount(akceId: number): number }`
  - `hub: Hub` — sdílená instance
  - `interface AkceStavPayload { akce: AkceView | null; prihlaseni: PlayerView[]; zapasy: ZapasView[] }`
  - `buildAkceStav(akceId: number): Promise<AkceStavPayload>`
  - `broadcastAkce(akceId: number): Promise<void>`

- [ ] **Step 1: Doplnit přenosové typy**

Přidej na konec `src/shared/types.ts`:

```ts
export interface PlayerView {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  avatarUrl: string | null;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  steamHodiny: number | null;
  posledniZapas: string | null;
  statyStazenyV: string | null;
  statyChyba: string | null;
}

export interface AkceView {
  id: number;
  nazev: string;
  stav: string;
}

export interface UcastnikView {
  steamId: string;
  alias: string | null;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
  kliknulPripojit: string | null;
}

export interface ZapasView {
  id: number;
  poradi: number;
  format: Format;
  stav: string;
  nazevLobby: string;
  heslo: string;
  lobbyId: string | null;
  joinUri: string | null;
  spectatorUri: string | null;
  viteznyTym: Tym | null;
  ucastnici: UcastnikView[];
}

export interface AkceStavPayload {
  akce: AkceView | null;
  prihlaseni: PlayerView[];
  zapasy: ZapasView[];
}
```

- [ ] **Step 2: Napsat padající testy pro hub**

`src/realtime/hub.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { Hub } from "./hub.js";

describe("Hub", () => {
  it("doručí zprávu všem odběratelům jedné akce", () => {
    const hub = new Hub();
    const a = vi.fn();
    const b = vi.fn();
    hub.subscribe(1, a);
    hub.subscribe(1, b);

    hub.publish(1, { ahoj: true });

    expect(a).toHaveBeenCalledWith(JSON.stringify({ ahoj: true }));
    expect(b).toHaveBeenCalledWith(JSON.stringify({ ahoj: true }));
  });

  it("nedoručí zprávu odběratelům jiné akce", () => {
    const hub = new Hub();
    const jina = vi.fn();
    hub.subscribe(2, jina);
    hub.publish(1, { ahoj: true });
    expect(jina).not.toHaveBeenCalled();
  });

  it("odhlášení odběratele ho přestane obsluhovat", () => {
    const hub = new Hub();
    const prijemce = vi.fn();
    const odhlas = hub.subscribe(1, prijemce);
    odhlas();
    hub.publish(1, { ahoj: true });
    expect(prijemce).not.toHaveBeenCalled();
    expect(hub.subscriberCount(1)).toBe(0);
  });

  it("pád jednoho odběratele nezabrání doručení ostatním", () => {
    const hub = new Hub();
    const rozbity = vi.fn(() => {
      throw new Error("spojení je pryč");
    });
    const zdravy = vi.fn();
    hub.subscribe(1, rozbity);
    hub.subscribe(1, zdravy);

    expect(() => hub.publish(1, { ahoj: true })).not.toThrow();
    expect(zdravy).toHaveBeenCalled();
  });

  it("publikování bez odběratelů nevadí", () => {
    expect(() => new Hub().publish(99, {})).not.toThrow();
  });
});
```

- [ ] **Step 3: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/realtime/hub.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 4: Napsat hub**

`src/realtime/hub.ts`:

```ts
type Odberatel = (data: string) => void;

export class Hub {
  readonly #odberatele = new Map<number, Set<Odberatel>>();

  subscribe(akceId: number, send: Odberatel): () => void {
    let mnozina = this.#odberatele.get(akceId);
    if (!mnozina) {
      mnozina = new Set();
      this.#odberatele.set(akceId, mnozina);
    }
    mnozina.add(send);
    return () => {
      mnozina.delete(send);
      if (mnozina.size === 0) this.#odberatele.delete(akceId);
    };
  }

  publish(akceId: number, payload: unknown): void {
    const mnozina = this.#odberatele.get(akceId);
    if (!mnozina) return;
    const data = JSON.stringify(payload);
    for (const send of mnozina) {
      // Rozpadlé spojení nesmí zabránit doručení ostatním.
      try {
        send(data);
      } catch {
        mnozina.delete(send);
      }
    }
  }

  subscriberCount(akceId: number): number {
    return this.#odberatele.get(akceId)?.size ?? 0;
  }
}

export const hub = new Hub();
```

- [ ] **Step 5: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/realtime/hub.test.ts`
Expected: PASS

- [ ] **Step 6: Napsat sestavení stavu akce**

`src/realtime/akceStav.ts`:

```ts
import { joinUri, spectatorUri } from "../aoe/lobbyUri.js";
import { getAktivniAkce, listSignups } from "../db/events.js";
import type { PlayerRow } from "../db/players.js";
import type { AkceStavPayload, PlayerView } from "../shared/types.js";
import { hub } from "./hub.js";

export function playerView(hrac: PlayerRow): PlayerView {
  return {
    steamId: hrac.steamId,
    alias: hrac.alias,
    steamName: hrac.steamName,
    avatarUrl: hrac.avatarUrl,
    country: hrac.country,
    elo1v1: hrac.elo1v1,
    eloNejvyssi: hrac.eloNejvyssi,
    odehranoHer: hrac.odehranoHer,
    steamHodiny: hrac.steamHodiny,
    posledniZapas: hrac.posledniZapas?.toISOString() ?? null,
    statyStazenyV: hrac.statyStazenyV?.toISOString() ?? null,
    statyChyba: hrac.statyChyba,
  };
}

export { joinUri, spectatorUri };

export async function buildAkceStav(): Promise<AkceStavPayload> {
  const akce = await getAktivniAkce();
  if (!akce) return { akce: null, prihlaseni: [], zapasy: [] };
  const prihlaseni = await listSignups(akce.id);
  return {
    akce: { id: akce.id, nazev: akce.nazev, stav: akce.stav },
    prihlaseni: prihlaseni.map(playerView),
    zapasy: [],
  };
}

/** Rozešle celý stav akce. Nikdy neposíláme přírůstky — obnova po výpadku spojení je pak zdarma. */
export async function broadcastAkce(akceId: number): Promise<void> {
  hub.publish(akceId, await buildAkceStav());
}
```

Pole `zapasy` zatím zůstává prázdné; naplní ho Task 15.

- [ ] **Step 7: Napsat SSE routu**

`src/http/routes/stream.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { getAktivniAkce } from "../../db/events.js";
import { buildAkceStav } from "../../realtime/akceStav.js";
import { hub } from "../../realtime/hub.js";

export function registerStreamRoutes(app: FastifyInstance): void {
  app.get("/api/stream", async (request, reply) => {
    const akce = await getAktivniAkce();
    if (!akce) return reply.code(404).send({ chyba: "Žádná aktivní akce." });

    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      // Bez tohohle Cloudflare Tunnel události bufferuje a realtime přestane být realtime.
      "x-accel-buffering": "no",
    });

    const posli = (data: string) => reply.raw.write(`data: ${data}\n\n`);
    posli(JSON.stringify(await buildAkceStav()));

    const odhlas = hub.subscribe(akce.id, posli);
    const puls = setInterval(() => reply.raw.write(": puls\n\n"), 25_000);

    request.raw.on("close", () => {
      clearInterval(puls);
      odhlas();
    });

    return reply;
  });
}
```

- [ ] **Step 8: Rozeslat stav po každé změně**

V `src/http/routes/events.ts` přidej import `broadcastAkce` z `../../realtime/akceStav.js` a zavolej `await broadcastAkce(akceId)` na konci obsluh `POST /api/akce/:id/stav`, `POST /api/akce/:id/prihlaska` a `DELETE /api/akce/:id/prihlaska`. U `POST /api/akce` zavolej `await broadcastAkce(akce.id)` s právě založenou akcí.

V `src/http/server.ts` zaregistruj `registerStreamRoutes(app);`.

- [ ] **Step 9: Napsat test SSE**

`src/http/routes/stream.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, setAkceStav } from "../../db/events.js";
import { closePool, getPool } from "../../db/pool.js";
import { hub } from "../../realtime/hub.js";
import { buildServer } from "../server.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("bez aktivní akce vrátí 404", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/stream" });
  expect(res.statusCode).toBe(404);
  await app.close();
});

it("pošle úvodní stav a přihlásí odběratele", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const app = buildServer();
  await app.ready();

  const res = await app.inject({ method: "GET", url: "/api/stream" });
  expect(res.headers["content-type"]).toContain("text/event-stream");
  expect(res.headers["x-accel-buffering"]).toBe("no");
  expect(res.payload).toContain(`"nazev":"večer"`);
  await app.close();
});

it("hub o odběrateli ví a po zavření spojení ho zapomene", async () => {
  const akce = await createAkce("večer");
  const odhlas = hub.subscribe(akce.id, () => {});
  expect(hub.subscriberCount(akce.id)).toBe(1);
  odhlas();
  expect(hub.subscriberCount(akce.id)).toBe(0);
});
```

Pozn.: `app.inject` uzavře odpověď sám, takže test ověřuje úvodní zprávu a hlavičky. Doručování živých změn ověřuje test hubu v kroku 2.

- [ ] **Step 10: Spustit celou sadu**

Run: `npm test && npm run test:db`
Expected: PASS

- [ ] **Step 11: Commit**

```bash
git add src/realtime src/http/routes/stream.ts src/http/routes/events.ts src/http/server.ts src/shared/types.ts
git commit -m "feat: push whole event state to browsers over SSE"
```

---

## Task 13: Frontend — přihlášení a živý seznam · **MILNÍK A**

Po tomhle úkolu je aplikace poprvé k něčemu: nahrazuje ruční přihlašování na Discordu ověřenými údaji. Dá se s ní jít za Robem dřív, než existují zápasy.

**Files:**
- Create: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/vitest.config.ts`, `web/index.html`, `web/src/setupTests.ts`
- Create: `web/src/main.tsx`, `web/src/App.tsx`, `web/src/api.ts`, `web/src/useAkceStav.ts`, `web/src/format.ts`, `web/src/styl.css`
- Create: `web/src/views/SeznamPrihlasenych.tsx`
- Modify: `src/http/server.ts` (servírování sestaveného frontendu)
- Test: `web/src/format.test.ts`, `web/src/views/SeznamPrihlasenych.test.tsx`

**Interfaces:**
- Consumes: `GET /api/me`, `GET /api/akce`, `GET /api/stream`, `POST|DELETE /api/akce/:id/prihlaska`; typy z `src/shared/types.ts`
- Produces:
  - `formatHodiny(hodiny: number | null): string`
  - `formatElo(elo: number | null): string`
  - `formatOdehrano(her: number | null): string`
  - `useAkceStav(): { stav: AkceStavPayload | null; spojeno: boolean }`

- [ ] **Step 1: Založit Vite projekt**

`web/package.json`:

```json
{
  "name": "rob-aoe-web-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.3",
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "jsdom": "^25.0.1",
    "typescript": "^5.7.2",
    "vite": "^6.0.3",
    "vitest": "^2.1.8"
  }
}
```

`web/vite.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
  build: { outDir: "dist" },
});
```

`web/vitest.config.ts`:

```ts
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
```

`web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "allowImportingTsExtensions": true
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`web/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

`web/index.html`:

```html
<!doctype html>
<html lang="cs">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Komunitní hry — Robdiesalot</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Do kořenového `package.json` přidej skript `"test:web": "npm --prefix web run test"`.

- [ ] **Step 2: Napsat padající testy pro formátování**

`web/src/format.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { formatElo, formatHodiny, formatOdehrano } from "./format.js";

describe("formatHodiny", () => {
  it("ukáže hodiny s jednotkou", () => {
    expect(formatHodiny(1230)).toBe("1230 h");
  });

  it("skrytý profil se pozná od nuly", () => {
    expect(formatHodiny(null)).toBe("nezveřejněno");
    expect(formatHodiny(0)).toBe("0 h");
  });
});

describe("formatElo", () => {
  it("ukáže číslo", () => {
    expect(formatElo(1847)).toBe("1847");
  });

  it("hráč bez žebříčku má pomlčku, ne nulu", () => {
    expect(formatElo(null)).toBe("—");
  });
});

describe("formatOdehrano", () => {
  it("skloňuje česky", () => {
    expect(formatOdehrano(1)).toBe("1 hra");
    expect(formatOdehrano(3)).toBe("3 hry");
    expect(formatOdehrano(512)).toBe("512 her");
    expect(formatOdehrano(0)).toBe("0 her");
  });

  it("neznámý počet má pomlčku", () => {
    expect(formatOdehrano(null)).toBe("—");
  });
});
```

- [ ] **Step 3: Spustit testy a ověřit, že padají**

Run: `npm --prefix web install && npm --prefix web run test`
Expected: FAIL — `./format.js` neexistuje

- [ ] **Step 4: Napsat formátování**

`web/src/format.ts`:

```ts
export function formatHodiny(hodiny: number | null): string {
  // null znamená skrytý Steam profil — to není totéž co nula odehraných hodin.
  return hodiny === null ? "nezveřejněno" : `${hodiny} h`;
}

export function formatElo(elo: number | null): string {
  return elo === null ? "—" : String(elo);
}

export function formatOdehrano(her: number | null): string {
  if (her === null) return "—";
  if (her === 1) return "1 hra";
  if (her >= 2 && her <= 4) return `${her} hry`;
  return `${her} her`;
}
```

- [ ] **Step 5: Spustit testy a ověřit, že procházejí**

Run: `npm --prefix web run test`
Expected: PASS

- [ ] **Step 6: Napsat API klienta a živé napojení**

`web/src/api.ts`:

```ts
import type { AkceStavPayload } from "../../src/shared/types.js";

export interface Me {
  hrac: { steamId: string; alias: string | null; jeAdmin: boolean } | null;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const telo = (await res.json().catch(() => ({ chyba: "Neznámá chyba." }))) as { chyba?: string };
    throw new Error(telo.chyba ?? `Server odpověděl ${res.status}.`);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => fetch("/api/me").then((r) => json<Me>(r)),
  akce: () => fetch("/api/akce").then((r) => json<AkceStavPayload>(r)),
  prihlasit: (akceId: number) =>
    fetch(`/api/akce/${akceId}/prihlaska`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
  odhlasit: (akceId: number) =>
    fetch(`/api/akce/${akceId}/prihlaska`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),
  odhlasitSe: () => fetch("/api/auth/logout", { method: "POST" }),
};
```

`web/src/useAkceStav.ts`:

```ts
import { useEffect, useState } from "react";
import type { AkceStavPayload } from "../../src/shared/types.js";

/**
 * Server posílá celý stav akce, ne přírůstky. Proto se tady nic neskládá —
 * poslední přijatá zpráva je pravda a obnova po výpadku spojení je zdarma.
 */
export function useAkceStav(): { stav: AkceStavPayload | null; spojeno: boolean } {
  const [stav, setStav] = useState<AkceStavPayload | null>(null);
  const [spojeno, setSpojeno] = useState(false);

  useEffect(() => {
    const zdroj = new EventSource("/api/stream");
    zdroj.onopen = () => setSpojeno(true);
    zdroj.onerror = () => setSpojeno(false);
    zdroj.onmessage = (udalost) => {
      setStav(JSON.parse(udalost.data) as AkceStavPayload);
      setSpojeno(true);
    };
    return () => zdroj.close();
  }, []);

  return { stav, spojeno };
}
```

- [ ] **Step 7: Napsat padající test seznamu**

`web/src/views/SeznamPrihlasenych.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { PlayerView } from "../../../src/shared/types.js";
import { SeznamPrihlasenych } from "./SeznamPrihlasenych.js";

const hrac = (prepis: Partial<PlayerView> = {}): PlayerView => ({
  steamId: "76561198000000001",
  alias: "TenceR",
  steamName: "Vlasta",
  avatarUrl: null,
  country: "cz",
  elo1v1: 1847,
  eloNejvyssi: 1901,
  odehranoHer: 512,
  steamHodiny: 1230,
  posledniZapas: null,
  statyStazenyV: "2026-09-03T12:00:00.000Z",
  statyChyba: null,
  ...prepis,
});

it("ukáže jméno ve hře, ELO a hodiny", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.getByText("TenceR")).toBeInTheDocument();
  expect(screen.getByText("1847")).toBeInTheDocument();
  expect(screen.getByText("1230 h")).toBeInTheDocument();
});

it("u skrytého profilu napíše nezveřejněno", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamHodiny: null })]} />);
  expect(screen.getByText("nezveřejněno")).toBeInTheDocument();
});

it("bez jména ve hře použije Steam přezdívku", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ alias: null })]} />);
  expect(screen.getByText("Vlasta")).toBeInTheDocument();
});

it("označí data, která se nepodařilo stáhnout", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ statyChyba: "Žebříček: timeout" })]} />);
  expect(screen.getByTitle(/timeout/)).toBeInTheDocument();
});

it("prázdný seznam to řekne slovy", () => {
  render(<SeznamPrihlasenych prihlaseni={[]} />);
  expect(screen.getByText(/zatím se nikdo nepřihlásil/i)).toBeInTheDocument();
});
```

- [ ] **Step 8: Spustit test a ověřit, že padá**

Run: `npm --prefix web run test`
Expected: FAIL — komponenta neexistuje

- [ ] **Step 9: Napsat komponentu**

`web/src/views/SeznamPrihlasenych.tsx`:

```tsx
import type { PlayerView } from "../../../src/shared/types.js";
import { formatElo, formatHodiny, formatOdehrano } from "../format.js";

export function SeznamPrihlasenych({ prihlaseni }: { prihlaseni: PlayerView[] }) {
  if (prihlaseni.length === 0) {
    return <p className="prazdno">Zatím se nikdo nepřihlásil.</p>;
  }

  return (
    <table className="seznam">
      <thead>
        <tr>
          <th>Hráč</th>
          <th>1v1 ELO</th>
          <th>Nejvýš</th>
          <th>Odehráno</th>
          <th>Hodin ve hře</th>
        </tr>
      </thead>
      <tbody>
        {prihlaseni.map((hrac) => (
          <tr key={hrac.steamId}>
            <td>
              {hrac.avatarUrl ? <img src={hrac.avatarUrl} alt="" width={20} height={20} /> : null}
              {hrac.alias ?? hrac.steamName ?? hrac.steamId}
              {hrac.statyChyba ? (
                <span className="varovani" title={hrac.statyChyba}>
                  ⚠
                </span>
              ) : null}
            </td>
            <td>{formatElo(hrac.elo1v1)}</td>
            <td>{formatElo(hrac.eloNejvyssi)}</td>
            <td>{formatOdehrano(hrac.odehranoHer)}</td>
            <td>{formatHodiny(hrac.steamHodiny)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 10: Napsat kostru aplikace**

`web/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { api, type Me } from "./api.js";
import { useAkceStav } from "./useAkceStav.js";
import { SeznamPrihlasenych } from "./views/SeznamPrihlasenych.js";

export function App() {
  const [me, setMe] = useState<Me["hrac"]>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const { stav, spojeno } = useAkceStav();

  useEffect(() => {
    void api.me().then((odpoved) => setMe(odpoved.hrac));
  }, []);

  const akce = stav?.akce ?? null;
  const jsemPrihlaseny = Boolean(me && stav?.prihlaseni.some((h) => h.steamId === me.steamId));

  async function prepnout() {
    if (!akce || !me) return;
    try {
      setChyba(null);
      await (jsemPrihlaseny ? api.odhlasit(akce.id) : api.prihlasit(akce.id));
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Nepovedlo se to.");
    }
  }

  return (
    <main>
      <header>
        <h1>Komunitní hry — Robdiesalot</h1>
        {me ? (
          <span>
            {me.alias ?? me.steamId}{" "}
            <button onClick={() => void api.odhlasitSe().then(() => setMe(null))}>Odhlásit</button>
          </span>
        ) : (
          <a className="tlacitko" href="/api/auth/steam">
            Přihlásit se přes Steam
          </a>
        )}
      </header>

      {!spojeno ? <p className="spojeni">Obnovuji spojení…</p> : null}
      {chyba ? <p className="chyba">{chyba}</p> : null}

      {akce ? (
        <>
          <h2>{akce.nazev}</h2>
          {me && akce.stav === "prihlasovani" ? (
            <button onClick={() => void prepnout()}>
              {jsemPrihlaseny ? "Odhlásit se z akce" : "Přihlásit se do akce"}
            </button>
          ) : null}
          <SeznamPrihlasenych prihlaseni={stav?.prihlaseni ?? []} />
        </>
      ) : (
        <p className="prazdno">Právě neběží žádná akce.</p>
      )}
    </main>
  );
}
```

`web/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./styl.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`web/src/styl.css`:

```css
:root {
  --pozadi: #1a1712;
  --text: #e8e0d0;
  --tlumene: #9a8f7a;
  --akcent: #c8a75a;
  --modra: #2f6fd0;
  --cervena: #c0392b;
  color-scheme: dark;
}

body {
  margin: 0;
  background: var(--pozadi);
  color: var(--text);
  font: 15px/1.5 system-ui, sans-serif;
}

main { max-width: 62rem; margin: 0 auto; padding: 1.5rem; }
header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; }

a.tlacitko, .cta {
  display: inline-block;
  background: var(--akcent);
  color: #241d10;
  font-weight: 700;
  padding: 0.7rem 1rem;
  border-radius: 5px;
  text-decoration: none;
}
.cta[aria-disabled="true"] { background: #2c2620; color: #6d6455; cursor: not-allowed; }

button { background: #3a3126; color: var(--text); border: 1px solid #4a4133; border-radius: 4px; padding: 0.4rem 0.7rem; cursor: pointer; }
button:disabled { opacity: 0.45; cursor: not-allowed; }

.seznam { width: 100%; border-collapse: collapse; }
.seznam th { text-align: left; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: var(--tlumene); }
.seznam td, .seznam th { padding: 0.5rem 0.6rem; border-bottom: 1px solid #2a241c; }

.prazdno, .ceka, .spojeni { color: var(--tlumene); }
.varovani { color: var(--akcent); margin-left: 0.35rem; cursor: help; }
.chyba { color: #e07a6a; }
.potvrzeno { color: #7fb96a; }

.karta, .zapas, .host { border: 1px solid #3d352a; border-radius: 8px; padding: 1rem; margin: 1rem 0; }
.karta .hero { border-radius: 6px; padding: 1.2rem; text-align: center; color: #fff; margin: 0.8rem 0; }
.karta .hero strong { display: block; font-size: 2rem; text-transform: uppercase; }
.karta.barva-1 .hero { background: var(--modra); }
.karta.barva-2 .hero { background: var(--cervena); }

.swatch { display: inline-block; width: 0.8rem; height: 0.8rem; border-radius: 2px; }
.barva-1 .swatch { background: var(--modra); }
.barva-2 .swatch { background: var(--cervena); }

.zrcadlo { list-style: none; padding: 0; }
.zrcadlo li { padding: 0.4rem 0; border-bottom: 1px solid #2a241c; }
.zaloha { color: var(--tlumene); font-size: 0.85rem; margin-top: 0.6rem; }
```

- [ ] **Step 11: Servírovat sestavený frontend**

V `src/http/server.ts` přidej po registraci rout:

```ts
  const webDist = join(import.meta.dirname, "..", "..", "web", "dist");
  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ chyba: "Neznámá cesta." });
      return reply.sendFile("index.html");
    });
  }
```

s importy `existsSync` z `node:fs`, `join` z `node:path` a `fastifyStatic` z `@fastify/static`.

- [ ] **Step 12: Vyzkoušet naživo**

Run ve dvou oknech:

```
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe"; npm run dev
npm --prefix web run dev
```

Otevřít `http://localhost:5173`, přihlásit se přes Steam, ověřit, že se v seznamu objeví jméno ve hře a ELO. Otevřít druhý prohlížeč a ověřit, že se seznam **doplní sám bez refreshe**.

- [ ] **Step 13: Spustit všechny testy**

Run: `npm test && npm run test:db && npm run test:web`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add web src/http/server.ts package.json
git commit -m "feat: sign up through Steam and watch the roster update live"
```

---

## Task 14: Úložiště zápasů

**Files:**
- Create: `src/db/matches.ts`
- Test: `src/db/matches.db.test.ts`

**Interfaces:**
- Consumes: `withTransaction`, `getPool`; `assignSeats`, `lobbyName`, `generatePassword`, `seatCount`; `MatchState`, `assertTransition`; `Format`
- Produces:
  - `interface ZapasRow { id: number; akceId: number; poradi: number; format: Format; stav: MatchState; nazevLobby: string; heslo: string; lobbyId: string | null; viteznyTym: Tym | null }`
  - `interface UcastnikRow { steamId: string; alias: string | null; tym: Tym; barva: Barva; jeHost: boolean; kliknulPripojit: Date | null }`
  - `createZapas(akceId: number, format: Format, steamIds: string[]): Promise<ZapasRow>`
  - `getZapas(zapasId: number): Promise<{ zapas: ZapasRow; ucastnici: UcastnikRow[] } | null>`
  - `listZapasy(akceId: number): Promise<Array<{ zapas: ZapasRow; ucastnici: UcastnikRow[] }>>`
  - `setZapasStav(zapasId: number, stav: MatchState, actor: Actor): Promise<void>`
  - `setLobbyId(zapasId: number, lobbyId: string): Promise<void>`
  - `setHost(zapasId: number, steamId: string): Promise<void>` — zároveň smaže `lobby_id`
  - `oznacKliknutiPripojit(zapasId: number, steamId: string): Promise<void>`
  - `setVysledek(zapasId: number, viteznyTym: Tym): Promise<void>`

- [ ] **Step 1: Napsat padající testy**

`src/db/matches.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce } from "./events.js";
import {
  createZapas,
  getZapas,
  listZapasy,
  oznacKliknutiPripojit,
  setHost,
  setLobbyId,
  setVysledek,
  setZapasStav,
} from "./matches.js";
import { closePool, getPool } from "./pool.js";
import { savePlayerStats, upsertPlayer } from "./players.js";
import { signUp } from "./events.js";

let akceId: number;
const HRACI = ["76561198000000050", "76561198000000051", "76561198000000052", "76561198000000053"];

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;
  for (const [i, steamId] of HRACI.entries()) {
    await upsertPlayer(steamId, false);
    await savePlayerStats(steamId, { alias: `Hrac${i}`, odehranoHer: i * 100, chyba: null });
    await signUp(akceId, steamId);
  }
});

afterAll(async () => {
  await closePool();
});

it("vytvoří 1v1 s pořadím, názvem lobby a heslem", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  expect(zapas.poradi).toBe(1);
  expect(zapas.nazevLobby).toBe("ROB-01");
  expect(zapas.heslo).toHaveLength(8);
  expect(zapas.stav).toBe("nachystany");
  expect(zapas.lobbyId).toBeNull();
});

it("čísluje zápasy po sobě", async () => {
  await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  const druhy = await createZapas(akceId, "1v1", HRACI.slice(2, 4));
  expect(druhy.poradi).toBe(2);
  expect(druhy.nazevLobby).toBe("ROB-02");
});

it("Coop Kings dá dvojicím sdílenou barvu", async () => {
  const zapas = await createZapas(akceId, "coop_kings_2v2", HRACI);
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici).toHaveLength(4);
  expect(ucastnici[0]!.barva).toBe(ucastnici[1]!.barva);
  expect(ucastnici[2]!.barva).toBe(ucastnici[3]!.barva);
  expect(ucastnici[0]!.barva).not.toBe(ucastnici[2]!.barva);
});

it("hostem je nejzkušenější hráč", async () => {
  const zapas = await createZapas(akceId, "coop_kings_2v2", HRACI);
  const { ucastnici } = (await getZapas(zapas.id))!;
  const host = ucastnici.find((u) => u.jeHost)!;
  expect(host.steamId).toBe(HRACI[3]);
});

it("účastníci nesou jméno ve hře", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.map((u) => u.alias)).toEqual(["Hrac0", "Hrac1"]);
});

it("odmítne hráče, který se mezitím odhlásil", async () => {
  await getPool().query("UPDATE prihlaska SET stav = 'odhlasen' WHERE steam_id = $1", [HRACI[1]]);
  await expect(createZapas(akceId, "1v1", HRACI.slice(0, 2))).rejects.toThrow(/není přihlášený/i);
});

it("neúspěšné vytvoření nezanechá poloviční zápas", async () => {
  await getPool().query("UPDATE prihlaska SET stav = 'odhlasen' WHERE steam_id = $1", [HRACI[1]]);
  await expect(createZapas(akceId, "1v1", HRACI.slice(0, 2))).rejects.toThrow();
  expect(await listZapasy(akceId)).toHaveLength(0);
});

it("odmítne špatný počet hráčů", async () => {
  await expect(createZapas(akceId, "coop_kings_2v2", HRACI.slice(0, 2))).rejects.toThrow(/4 hráče/);
});

it("uloží číslo lobby a posune stav", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setLobbyId(zapas.id, "234230181");
  await setZapasStav(zapas.id, "lobby_otevrena", "host");

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("234230181");
  expect(nacteny.zapas.stav).toBe("lobby_otevrena");
});

it("host nesmí zapsat výsledek", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setZapasStav(zapas.id, "lobby_otevrena", "host");
  await setZapasStav(zapas.id, "hraje_se", "host");
  await expect(setZapasStav(zapas.id, "dohrano", "host")).rejects.toThrow(/nesmí/);
});

it("změna hosta zahodí staré číslo lobby", async () => {
  const zapas = await createZapas(akceId, "coop_kings_2v2", HRACI);
  await setLobbyId(zapas.id, "234230181");
  await setHost(zapas.id, HRACI[0]!);

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBeNull();
  expect(nacteny.ucastnici.filter((u) => u.jeHost).map((u) => u.steamId)).toEqual([HRACI[0]]);
});

it("zaznamená kliknutí na připojení", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await oznacKliknutiPripojit(zapas.id, HRACI[0]!);
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.find((u) => u.steamId === HRACI[0])!.kliknulPripojit).toBeInstanceOf(Date);
  expect(ucastnici.find((u) => u.steamId === HRACI[1])!.kliknulPripojit).toBeNull();
});

it("uloží vítězný tým", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setVysledek(zapas.id, 2);
  expect((await getZapas(zapas.id))!.zapas.viteznyTym).toBe(2);
});

it("neznámý zápas vrátí null", async () => {
  expect(await getZapas(9999)).toBeNull();
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — `./matches.js` neexistuje

- [ ] **Step 3: Napsat úložiště**

`src/db/matches.ts`:

```ts
import { assignSeats, generatePassword, lobbyName } from "../matches/composition.js";
import { assertTransition, type Actor, type MatchState } from "../matches/stateMachine.js";
import type { Barva, Format, Tym } from "../shared/types.js";
import { getPool, withTransaction } from "./pool.js";

export interface ZapasRow {
  id: number;
  akceId: number;
  poradi: number;
  format: Format;
  stav: MatchState;
  nazevLobby: string;
  heslo: string;
  lobbyId: string | null;
  viteznyTym: Tym | null;
}

export interface UcastnikRow {
  steamId: string;
  alias: string | null;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
  kliknulPripojit: Date | null;
}

function mapujZapas(r: Record<string, unknown>): ZapasRow {
  return {
    id: r["id"] as number,
    akceId: r["akce_id"] as number,
    poradi: r["poradi"] as number,
    format: r["format"] as Format,
    stav: r["stav"] as MatchState,
    nazevLobby: r["nazev_lobby"] as string,
    heslo: r["heslo"] as string,
    lobbyId: r["lobby_id"] as string | null,
    viteznyTym: r["vitezny_tym"] as Tym | null,
  };
}

export async function createZapas(
  akceId: number,
  format: Format,
  steamIds: string[],
): Promise<ZapasRow> {
  return withTransaction(async (client) => {
    // Kdo se mezitím odhlásil, do zápasu nepatří. Kontrola i vložení jsou v jedné transakci,
    // takže neúspěch nezanechá poloviční zápas.
    const { rows: prihlaseni } = await client.query<{ steam_id: string; odehrano_her: number | null }>(
      `SELECT p.steam_id, p.odehrano_her
         FROM prihlaska pr JOIN player p ON p.steam_id = pr.steam_id
        WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen' AND pr.steam_id = ANY($2::text[])`,
      [akceId, steamIds],
    );
    const podleId = new Map(prihlaseni.map((r) => [r.steam_id, r.odehrano_her]));
    for (const steamId of steamIds) {
      if (!podleId.has(steamId)) {
        throw new Error(`Hráč ${steamId} už není přihlášený do akce.`);
      }
    }

    const seats = assignSeats(
      format,
      steamIds.map((steamId) => ({ steamId, odehranoHer: podleId.get(steamId) ?? null })),
    );

    const { rows: poradiRows } = await client.query<{ dalsi: number }>(
      "SELECT COALESCE(MAX(poradi), 0) + 1 AS dalsi FROM zapas WHERE akce_id = $1",
      [akceId],
    );
    const poradi = poradiRows[0]!.dalsi;

    const { rows } = await client.query(
      `INSERT INTO zapas (akce_id, poradi, format, nazev_lobby, heslo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, akce_id, poradi, format, stav, nazev_lobby, heslo, lobby_id, vitezny_tym`,
      [akceId, poradi, format, lobbyName(poradi), generatePassword()],
    );
    const zapas = mapujZapas(rows[0] as Record<string, unknown>);

    for (const seat of seats) {
      await client.query(
        "INSERT INTO ucastnik (zapas_id, steam_id, tym, barva, je_host) VALUES ($1, $2, $3, $4, $5)",
        [zapas.id, seat.steamId, seat.tym, seat.barva, seat.jeHost],
      );
    }
    return zapas;
  });
}

async function nactiUcastniky(zapasId: number): Promise<UcastnikRow[]> {
  const { rows } = await getPool().query(
    `SELECT u.steam_id, p.alias, u.tym, u.barva, u.je_host, u.kliknul_pripojit
       FROM ucastnik u JOIN player p ON p.steam_id = u.steam_id
      WHERE u.zapas_id = $1
      ORDER BY u.tym, u.steam_id`,
    [zapasId],
  );
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      steamId: row["steam_id"] as string,
      alias: row["alias"] as string | null,
      tym: row["tym"] as Tym,
      barva: row["barva"] as Barva,
      jeHost: row["je_host"] as boolean,
      kliknulPripojit: row["kliknul_pripojit"] as Date | null,
    };
  });
}

export async function getZapas(
  zapasId: number,
): Promise<{ zapas: ZapasRow; ucastnici: UcastnikRow[] } | null> {
  const { rows } = await getPool().query(
    `SELECT id, akce_id, poradi, format, stav, nazev_lobby, heslo, lobby_id, vitezny_tym
       FROM zapas WHERE id = $1`,
    [zapasId],
  );
  if (!rows[0]) return null;
  return {
    zapas: mapujZapas(rows[0] as Record<string, unknown>),
    ucastnici: await nactiUcastniky(zapasId),
  };
}

export async function listZapasy(
  akceId: number,
): Promise<Array<{ zapas: ZapasRow; ucastnici: UcastnikRow[] }>> {
  const { rows } = await getPool().query(
    `SELECT id, akce_id, poradi, format, stav, nazev_lobby, heslo, lobby_id, vitezny_tym
       FROM zapas WHERE akce_id = $1 ORDER BY poradi`,
    [akceId],
  );
  const vysledek = [];
  for (const r of rows) {
    const zapas = mapujZapas(r as Record<string, unknown>);
    vysledek.push({ zapas, ucastnici: await nactiUcastniky(zapas.id) });
  }
  return vysledek;
}

export async function setZapasStav(
  zapasId: number,
  stav: MatchState,
  actor: Actor,
): Promise<void> {
  const nacteny = await getZapas(zapasId);
  if (!nacteny) throw new Error(`Zápas ${zapasId} neexistuje.`);
  assertTransition(nacteny.zapas.stav, stav, actor);

  await getPool().query(
    `UPDATE zapas SET stav = $2,
       zacatek = CASE WHEN $2 = 'hraje_se' THEN COALESCE(zacatek, now()) ELSE zacatek END,
       konec   = CASE WHEN $2 = 'dohrano'  THEN now() ELSE konec END
     WHERE id = $1`,
    [zapasId, stav],
  );
}

export async function setLobbyId(zapasId: number, lobbyId: string): Promise<void> {
  await getPool().query("UPDATE zapas SET lobby_id = $2 WHERE id = $1", [zapasId, lobbyId]);
}

export async function setHost(zapasId: number, steamId: string): Promise<void> {
  await withTransaction(async (client) => {
    const { rowCount } = await client.query(
      "UPDATE ucastnik SET je_host = (steam_id = $2) WHERE zapas_id = $1",
      [zapasId, steamId],
    );
    if (!rowCount) throw new Error(`Zápas ${zapasId} nemá účastníky.`);
    // Staré číslo lobby patřilo předchozímu hostovi — nikdo se do mrtvé lobby připojovat nebude.
    await client.query("UPDATE zapas SET lobby_id = NULL WHERE id = $1", [zapasId]);
  });
}

export async function oznacKliknutiPripojit(zapasId: number, steamId: string): Promise<void> {
  await getPool().query(
    "UPDATE ucastnik SET kliknul_pripojit = now() WHERE zapas_id = $1 AND steam_id = $2",
    [zapasId, steamId],
  );
}

export async function setVysledek(zapasId: number, viteznyTym: Tym): Promise<void> {
  await getPool().query("UPDATE zapas SET vitezny_tym = $2 WHERE id = $1", [zapasId, viteznyTym]);
}
```

- [ ] **Step 4: Spustit testy a ověřit, že procházejí**

Run: `npm run test:db`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/matches.ts src/db/matches.db.test.ts
git commit -m "feat: compose a match transactionally with seats, lobby name and password"
```

---

## Task 15: Zápasové API a rozlišení, kdo co vidí

Heslo a číslo lobby jsou tajemství. Proudí stejným SSE kanálem jako zbytek stavu, takže se musí před rozesláním zaslepit každému, kdo v zápase nehraje a není Rob — jinak by je z veřejného kanálu vyčetl kdokoliv.

**Files:**
- Create: `database/002_host_potvrdil.sql`
- Create: `src/realtime/redakce.ts`
- Create: `src/http/routes/matches.ts`
- Modify: `src/db/matches.ts` (sloupec `host_potvrdil`)
- Modify: `src/realtime/akceStav.ts` (naplnit `zapasy`)
- Modify: `src/http/routes/stream.ts` (redakce podle diváka)
- Modify: `src/realtime/hub.ts` a `src/realtime/hub.test.ts` (předávat objekt, ne řetězec)
- Modify: `src/shared/types.ts` (`hostPotvrdil`)
- Test: `src/realtime/redakce.test.ts`, `src/http/routes/matches.db.test.ts`

**Interfaces:**
- Consumes: vše z `src/db/matches.js`, `parseJoinUri`/`joinUri`/`spectatorUri`, `requireUser`/`requireAdmin`
- Produces:
  - `interface Divak { steamId: string | null; jeAdmin: boolean }`
  - `redigujProDivaka(payload: AkceStavPayload, divak: Divak): AkceStavPayload`
  - `setHostPotvrdil(zapasId: number): Promise<void>`, `zrusHostPotvrdil(zapasId: number): Promise<void>`

- [ ] **Step 1: Přidat sloupec migrací**

`database/002_host_potvrdil.sql`:

```sql
ALTER TABLE zapas ADD COLUMN host_potvrdil TIMESTAMPTZ;
```

Run: `$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe_test"; npm run db:migrate`
Expected: `applied 002_host_potvrdil`

- [ ] **Step 2: Změnit hub tak, aby předával objekt**

Kanál doručuje **objekt**, ne hotový řetězec, protože každý divák dostane jinak zaslepenou verzi. V `src/realtime/hub.ts` změň typ a publikaci:

```ts
type Odberatel = (payload: unknown) => void;
```

a v `publish` odstraň `JSON.stringify`; předávej `payload` přímo:

```ts
  publish(akceId: number, payload: unknown): void {
    const mnozina = this.#odberatele.get(akceId);
    if (!mnozina) return;
    for (const send of mnozina) {
      try {
        send(payload);
      } catch {
        mnozina.delete(send);
      }
    }
  }
```

V `src/realtime/hub.test.ts` uprav dvě očekávání z `JSON.stringify({ ahoj: true })` na `{ ahoj: true }`.

Run: `npx vitest run src/realtime/hub.test.ts`
Expected: PASS

- [ ] **Step 3: Doplnit typ o potvrzení hosta**

V `src/shared/types.ts` přidej do `ZapasView`:

```ts
  hostPotvrdil: string | null;
```

- [ ] **Step 4: Napsat padající testy redakce**

`src/realtime/redakce.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { AkceStavPayload, ZapasView } from "../shared/types.js";
import { redigujProDivaka } from "./redakce.js";

const HRAC = "76561198000000060";
const CIZI = "76561198000000061";

const zapas: ZapasView = {
  id: 1,
  poradi: 1,
  format: "1v1",
  stav: "lobby_otevrena",
  nazevLobby: "ROB-01",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: "aoe2de://1/234230181",
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: HRAC, alias: "TenceR", tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "x", alias: "Pepa", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

const stav: AkceStavPayload = {
  akce: { id: 1, nazev: "večer", stav: "bezi" },
  prihlaseni: [],
  zapasy: [zapas],
};

describe("redigujProDivaka", () => {
  it("účastník vidí heslo i odkaz na připojení", () => {
    const videny = redigujProDivaka(stav, { steamId: HRAC, jeAdmin: false }).zapasy[0]!;
    expect(videny.heslo).toBe("k7rm2xq9");
    expect(videny.joinUri).toBe("aoe2de://0/234230181");
    expect(videny.lobbyId).toBe("234230181");
  });

  it("Rob vidí navíc divácký odkaz", () => {
    const videny = redigujProDivaka(stav, { steamId: "rob", jeAdmin: true }).zapasy[0]!;
    expect(videny.spectatorUri).toBe("aoe2de://1/234230181");
    expect(videny.heslo).toBe("k7rm2xq9");
  });

  it("účastník divácký odkaz nedostane", () => {
    const videny = redigujProDivaka(stav, { steamId: HRAC, jeAdmin: false }).zapasy[0]!;
    expect(videny.spectatorUri).toBeNull();
  });

  it("cizí divák nevidí heslo, číslo lobby ani žádný odkaz", () => {
    const videny = redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false }).zapasy[0]!;
    expect(videny.heslo).toBe("");
    expect(videny.lobbyId).toBeNull();
    expect(videny.joinUri).toBeNull();
    expect(videny.spectatorUri).toBeNull();
  });

  it("nepřihlášený je taky cizí", () => {
    const videny = redigujProDivaka(stav, { steamId: null, jeAdmin: false }).zapasy[0]!;
    expect(videny.heslo).toBe("");
  });

  it("cizí divák pořád vidí, kdo proti komu hraje a v jakém je to stavu", () => {
    const videny = redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false }).zapasy[0]!;
    expect(videny.nazevLobby).toBe("ROB-01");
    expect(videny.stav).toBe("lobby_otevrena");
    expect(videny.ucastnici).toHaveLength(2);
  });

  it("původní stav se nezmění", () => {
    redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false });
    expect(stav.zapasy[0]!.heslo).toBe("k7rm2xq9");
  });
});
```

- [ ] **Step 5: Spustit testy a ověřit, že padají**

Run: `npx vitest run src/realtime/redakce.test.ts`
Expected: FAIL — modul neexistuje

- [ ] **Step 6: Napsat redakci**

`src/realtime/redakce.ts`:

```ts
import type { AkceStavPayload, ZapasView } from "../shared/types.js";

export interface Divak {
  steamId: string | null;
  jeAdmin: boolean;
}

/**
 * Heslo a číslo lobby jsou tajemství. SSE kanál je jeden pro celou akci, takže
 * se zaslepují až tady — každému divákovi zvlášť, těsně před odesláním.
 */
export function redigujProDivaka(payload: AkceStavPayload, divak: Divak): AkceStavPayload {
  return {
    ...payload,
    zapasy: payload.zapasy.map((zapas) => redigujZapas(zapas, divak)),
  };
}

function redigujZapas(zapas: ZapasView, divak: Divak): ZapasView {
  const jeUcastnik =
    divak.steamId !== null && zapas.ucastnici.some((u) => u.steamId === divak.steamId);

  if (divak.jeAdmin) return { ...zapas };
  if (jeUcastnik) return { ...zapas, spectatorUri: null };

  return { ...zapas, heslo: "", lobbyId: null, joinUri: null, spectatorUri: null };
}
```

- [ ] **Step 7: Spustit testy a ověřit, že procházejí**

Run: `npx vitest run src/realtime/redakce.test.ts`
Expected: PASS

- [ ] **Step 8: Naplnit zápasy do stavu akce**

V `src/db/matches.ts` doplň `hostPotvrdil: Date | null` do `ZapasRow` a do `mapujZapas` (`r["host_potvrdil"] as Date | null`), přidej `host_potvrdil` do obou `SELECT` seznamů a doplň funkce:

```ts
export async function setHostPotvrdil(zapasId: number): Promise<void> {
  await getPool().query("UPDATE zapas SET host_potvrdil = now() WHERE id = $1", [zapasId]);
}

export async function zrusHostPotvrdil(zapasId: number): Promise<void> {
  await getPool().query("UPDATE zapas SET host_potvrdil = NULL WHERE id = $1", [zapasId]);
}
```

V `setHost` přidej do transakce i `host_potvrdil = NULL` — nový host nic nepotvrdil.

V `src/realtime/akceStav.ts` nahraď `zapasy: []` skutečným sestavením:

```ts
import { listZapasy } from "../db/matches.js";
import type { ZapasView } from "../shared/types.js";

function zapasView(zaznam: Awaited<ReturnType<typeof listZapasy>>[number]): ZapasView {
  const { zapas, ucastnici } = zaznam;
  return {
    id: zapas.id,
    poradi: zapas.poradi,
    format: zapas.format,
    stav: zapas.stav,
    nazevLobby: zapas.nazevLobby,
    heslo: zapas.heslo,
    lobbyId: zapas.lobbyId,
    // Odkazy se vždy odvozují z čísla lobby, nikdy se neukládají.
    joinUri: zapas.lobbyId ? joinUri(zapas.lobbyId) : null,
    spectatorUri: zapas.lobbyId ? spectatorUri(zapas.lobbyId) : null,
    viteznyTym: zapas.viteznyTym,
    hostPotvrdil: zapas.hostPotvrdil?.toISOString() ?? null,
    ucastnici: ucastnici.map((u) => ({
      steamId: u.steamId,
      alias: u.alias,
      tym: u.tym,
      barva: u.barva,
      jeHost: u.jeHost,
      kliknulPripojit: u.kliknulPripojit?.toISOString() ?? null,
    })),
  };
}
```

a v `buildAkceStav` vrať `zapasy: (await listZapasy(akce.id)).map(zapasView)`.

- [ ] **Step 9: Redigovat v SSE routě**

V `src/http/routes/stream.ts` zjisti diváka a redaguj před odesláním:

```ts
    const steamId = await currentUser(request);
    const hrac = steamId ? await getPlayer(steamId) : null;
    const divak = { steamId, jeAdmin: hrac?.jeAdmin ?? false };

    const posli = (payload: unknown) =>
      reply.raw.write(
        `data: ${JSON.stringify(redigujProDivaka(payload as AkceStavPayload, divak))}\n\n`,
      );
    posli(await buildAkceStav());
```

Stejně redaguj i odpověď `GET /api/akce` v `src/http/routes/events.ts`.

- [ ] **Step 10: Napsat padající testy zápasového API**

`src/http/routes/matches.db.test.ts`:

```ts
import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, setAkceStav, signUp } from "../../db/events.js";
import { getZapas } from "../../db/matches.js";
import { closePool, getPool } from "../../db/pool.js";
import { savePlayerStats, upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { buildServer } from "../server.js";

const ROB = "76561198000000070";
const HRACI = ["76561198000000071", "76561198000000072"];
let akceId: number;
let robSid: string;
let hracSid: string;

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;
  await setAkceStav(akceId, "prihlasovani");

  await upsertPlayer(ROB, true);
  robSid = await createSession(ROB);

  for (const [i, steamId] of HRACI.entries()) {
    await upsertPlayer(steamId, false);
    await savePlayerStats(steamId, { alias: `Hrac${i}`, odehranoHer: i * 10, chyba: null });
    await signUp(akceId, steamId);
  }
  hracSid = await createSession(HRACI[0]!);
});

afterAll(async () => {
  await closePool();
});

async function vytvorZapas(app: ReturnType<typeof buildServer>) {
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: robSid },
    payload: { format: "1v1", steamIds: HRACI },
  });
  return res.json().zapas as { id: number };
}

it("běžný hráč nesmí vytvořit zápas", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: hracSid },
    payload: { format: "1v1", steamIds: HRACI },
  });
  expect(res.statusCode).toBe(403);
  await app.close();
});

it("Rob vytvoří zápas a vyhlásí ho", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const vyhlaseni = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  expect(vyhlaseni.statusCode).toBe(200);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("vyhlaseny");
  await app.close();
});

it("host vloží odkaz a zápas se posune", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });

  const hostSid = await createSession(HRACI[1]!); // nejvíc odehraných her
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });

  expect(res.statusCode).toBe(200);
  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("234230181");
  expect(nacteny.zapas.stav).toBe("lobby_otevrena");
  await app.close();
});

it("omylem vložený divácký odkaz dostane vlastní vysvětlení", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  const hostSid = await createSession(HRACI[1]!);

  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://1/234230181" },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/divácký/i);
  await app.close();
});

it("nesmyslný odkaz se odmítne", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "https://example.com" },
  });
  expect(res.statusCode).toBe(400);
  await app.close();
});

it("kdo není host, odkaz vložit nesmí", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hracSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  expect(res.statusCode).toBe(403);
  await app.close();
});

it("host potvrdí nachystanou lobby", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/potvrzeni`,
    cookies: { sid: hostSid },
  });
  expect((await getZapas(zapas.id))!.zapas.hostPotvrdil).toBeInstanceOf(Date);
  await app.close();
});

it("změna hosta zahodí odkaz i potvrzení", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/potvrzeni`,
    cookies: { sid: hostSid },
  });

  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/host`,
    cookies: { sid: robSid },
    payload: { steamId: HRACI[0] },
  });

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBeNull();
  expect(nacteny.zapas.hostPotvrdil).toBeNull();
  expect(nacteny.ucastnici.find((u) => u.jeHost)!.steamId).toBe(HRACI[0]);
  await app.close();
});

it("účastník si označí kliknutí na připojení", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/pripojeni`,
    cookies: { sid: hracSid },
  });
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.find((u) => u.steamId === HRACI[0])!.kliknulPripojit).toBeInstanceOf(Date);
  await app.close();
});

it("Rob zapíše vítěze", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/vysledek`,
    cookies: { sid: robSid },
    payload: { viteznyTym: 2 },
  });
  expect(res.statusCode).toBe(200);
  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.viteznyTym).toBe(2);
  expect(nacteny.zapas.stav).toBe("dohrano");
  await app.close();
});

it("cizí divák nevidí ve streamu heslo", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });

  const cizi = await app.inject({ method: "GET", url: "/api/akce" });
  const videny = cizi.json().zapasy[0];
  expect(videny.heslo).toBe("");
  expect(videny.lobbyId).toBeNull();

  const robuv = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(robuv.json().zapasy[0].spectatorUri).toBe("aoe2de://1/234230181");
  await app.close();
});
```

- [ ] **Step 11: Spustit testy a ověřit, že padají**

Run: `npm run test:db`
Expected: FAIL — routy neexistují

- [ ] **Step 12: Napsat zápasové routy**

`src/http/routes/matches.ts`:

```ts
import type { FastifyInstance } from "fastify";
import { parseJoinUri } from "../../aoe/lobbyUri.js";
import {
  createZapas,
  getZapas,
  oznacKliknutiPripojit,
  setHost,
  setHostPotvrdil,
  setLobbyId,
  setVysledek,
  setZapasStav,
} from "../../db/matches.js";
import { MATCH_STATES, type MatchState } from "../../matches/stateMachine.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import type { Format, Tym } from "../../shared/types.js";
import { HttpError, requireAdmin, requireUser } from "../guards.js";

const FORMATY: readonly Format[] = ["1v1", "coop_kings_2v2"];

const CHYBA_ODKAZU: Record<string, string> = {
  prazdne: "Vlož odkaz z tlačítka Copy ve hře.",
  divacky_odkaz:
    "Tohle je divácký odkaz (aoe2de://1/…). Potřebuju ten z tlačítka Copy v lobby, který začíná aoe2de://0/.",
  spatny_tvar: "Tohle nevypadá jako odkaz na lobby. Má vypadat takhle: aoe2de://0/234230181",
};

async function nactiNeboSelzi(zapasId: number) {
  const zaznam = await getZapas(zapasId);
  if (!zaznam) throw new HttpError(404, "Takový zápas neexistuje.");
  return zaznam;
}

/** Vrátí roli přihlášeného vůči zápasu, nebo vyhodí 403. */
async function roleVZapase(request: Parameters<typeof requireUser>[0], zapasId: number) {
  const steamId = await requireUser(request);
  const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
  const { getPlayer } = await import("../../db/players.js");
  const hrac = await getPlayer(steamId);
  if (hrac?.jeAdmin) return { steamId, zapas, ucastnici, actor: "admin" as const };
  const ucastnik = ucastnici.find((u) => u.steamId === steamId);
  if (!ucastnik?.jeHost) throw new HttpError(403, "Tohle smí jen host zápasu nebo Rob.");
  return { steamId, zapas, ucastnici, actor: "host" as const };
}

export function registerMatchRoutes(app: FastifyInstance): void {
  app.post("/api/akce/:id/zapas", async (request) => {
    await requireAdmin(request);
    const akceId = Number((request.params as { id: string }).id);
    const { format, steamIds } = request.body as { format?: unknown; steamIds?: unknown };
    if (typeof format !== "string" || !FORMATY.includes(format as Format)) {
      throw new HttpError(400, "Neznámý formát zápasu.");
    }
    if (!Array.isArray(steamIds) || steamIds.some((s) => typeof s !== "string")) {
      throw new HttpError(400, "Chybí seznam hráčů.");
    }
    try {
      const zapas = await createZapas(akceId, format as Format, steamIds as string[]);
      await broadcastAkce(akceId);
      return { zapas };
    } catch (err) {
      throw new HttpError(409, err instanceof Error ? err.message : "Zápas se nepodařilo vytvořit.");
    }
  });

  app.post("/api/zapas/:id/stav", async (request) => {
    await requireAdmin(request);
    const zapasId = Number((request.params as { id: string }).id);
    const { stav } = request.body as { stav?: unknown };
    if (typeof stav !== "string" || !MATCH_STATES.includes(stav as MatchState)) {
      throw new HttpError(400, "Neznámý stav zápasu.");
    }
    const { zapas } = await nactiNeboSelzi(zapasId);
    await setZapasStav(zapasId, stav as MatchState, "admin");
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/lobby", async (request) => {
    const zapasId = Number((request.params as { id: string }).id);
    const { zapas, actor } = await roleVZapase(request, zapasId);
    const { odkaz } = request.body as { odkaz?: unknown };
    const vysledek = parseJoinUri(typeof odkaz === "string" ? odkaz : "");
    if (!vysledek.ok) throw new HttpError(400, CHYBA_ODKAZU[vysledek.error]!);

    await setLobbyId(zapasId, vysledek.lobbyId);
    if (zapas.stav === "vyhlaseny") await setZapasStav(zapasId, "lobby_otevrena", actor);
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/potvrzeni", async (request) => {
    const zapasId = Number((request.params as { id: string }).id);
    const { zapas } = await roleVZapase(request, zapasId);
    await setHostPotvrdil(zapasId);
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/host", async (request) => {
    await requireAdmin(request);
    const zapasId = Number((request.params as { id: string }).id);
    const { steamId } = request.body as { steamId?: unknown };
    if (typeof steamId !== "string") throw new HttpError(400, "Chybí hráč, který má hostovat.");
    const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
    if (!ucastnici.some((u) => u.steamId === steamId)) {
      throw new HttpError(400, "Hostovat může jen někdo z účastníků zápasu.");
    }
    await setHost(zapasId, steamId);
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/pripojeni", async (request) => {
    const steamId = await requireUser(request);
    const zapasId = Number((request.params as { id: string }).id);
    const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
    if (!ucastnici.some((u) => u.steamId === steamId)) {
      throw new HttpError(403, "V tomhle zápase nehraješ.");
    }
    await oznacKliknutiPripojit(zapasId, steamId);
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/vysledek", async (request) => {
    await requireAdmin(request);
    const zapasId = Number((request.params as { id: string }).id);
    const { viteznyTym } = request.body as { viteznyTym?: unknown };
    if (viteznyTym !== 1 && viteznyTym !== 2) throw new HttpError(400, "Vítězný tým je 1 nebo 2.");
    const { zapas } = await nactiNeboSelzi(zapasId);
    await setVysledek(zapasId, viteznyTym as Tym);
    if (zapas.stav !== "dohrano") await setZapasStav(zapasId, "dohrano", "admin");
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });
}
```

Import `getPlayer` přesuň na začátek souboru místo dynamického `await import` — dynamický import je tu jen proto, aby byl příklad soběstačný.

V `src/http/server.ts` zaregistruj `registerMatchRoutes(app);`.

- [ ] **Step 13: Spustit všechny testy**

Run: `npm test && npm run test:db`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add database/002_host_potvrdil.sql src/realtime src/http/routes/matches.ts src/db/matches.ts src/shared/types.ts src/http/server.ts
git commit -m "feat: run a match from composition to result, hiding lobby secrets from onlookers"
```

---

## Task 16: Frontend — karta hráče a obrazovka hosta

Tady se rozhoduje, jestli lidi přestanou kazit nastavení lobby. Testy proto míří přesně na to, co se dnes kazí: barvu, tým a to, s kým člověk sdílí civilizaci.

**Files:**
- Create: `web/src/views/KartaHrace.tsx`, `web/src/views/ObrazovkaHosta.tsx`, `web/src/zapas.ts`
- Modify: `web/src/api.ts`, `web/src/App.tsx`
- Test: `web/src/zapas.test.ts`, `web/src/views/KartaHrace.test.tsx`, `web/src/views/ObrazovkaHosta.test.tsx`

**Interfaces:**
- Consumes: `ZapasView`, `UcastnikView`, `BARVA_NAZEV` z `src/shared/types.js`
- Produces:
  - `mujUcastnik(zapas: ZapasView, steamId: string): UcastnikView | null`
  - `spoluhraci(zapas: ZapasView, steamId: string): UcastnikView[]` — stejný tým, bez sebe
  - `souperi(zapas: ZapasView, steamId: string): UcastnikView[]`
  - `mojeZapasy(zapasy: ZapasView[], steamId: string): ZapasView[]` — jen nedohrané
  - `<KartaHrace zapas ja />`, `<ObrazovkaHosta zapas ja onVlozitOdkaz onPotvrdit />`

- [ ] **Step 1: Napsat padající testy pomocných funkcí**

`web/src/zapas.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { UcastnikView, ZapasView } from "../../src/shared/types.js";
import { mojeZapasy, mujUcastnik, souperi, spoluhraci } from "./zapas.js";

const u = (steamId: string, tym: 1 | 2, barva: 1 | 2, jeHost = false): UcastnikView => ({
  steamId,
  alias: steamId.toUpperCase(),
  tym,
  barva,
  jeHost,
  kliknulPripojit: null,
});

const coop: ZapasView = {
  id: 1,
  poradi: 1,
  format: "coop_kings_2v2",
  stav: "vyhlaseny",
  nazevLobby: "ROB-01",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [u("a", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)],
};

describe("mujUcastnik", () => {
  it("najde mě", () => {
    expect(mujUcastnik(coop, "b")?.barva).toBe(1);
  });

  it("cizího nenajde", () => {
    expect(mujUcastnik(coop, "z")).toBeNull();
  });
});

describe("spoluhraci", () => {
  it("v Coop Kings je to ten se stejnou barvou, bez mě", () => {
    expect(spoluhraci(coop, "a").map((s) => s.steamId)).toEqual(["b"]);
  });

  it("v 1v1 nikdo", () => {
    const jeden: ZapasView = { ...coop, format: "1v1", ucastnici: [u("a", 1, 1), u("c", 2, 2)] };
    expect(spoluhraci(jeden, "a")).toEqual([]);
  });
});

describe("souperi", () => {
  it("jsou z druhého týmu", () => {
    expect(souperi(coop, "a").map((s) => s.steamId)).toEqual(["c", "d"]);
  });
});

describe("mojeZapasy", () => {
  it("vrátí jen ty, kde hraju", () => {
    expect(mojeZapasy([coop], "a")).toHaveLength(1);
    expect(mojeZapasy([coop], "z")).toHaveLength(0);
  });

  it("dohrané a zrušené vynechá", () => {
    expect(mojeZapasy([{ ...coop, stav: "dohrano" }], "a")).toHaveLength(0);
    expect(mojeZapasy([{ ...coop, stav: "zruseny" }], "a")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npm --prefix web run test`
Expected: FAIL — `./zapas.js` neexistuje

- [ ] **Step 3: Napsat pomocné funkce**

`web/src/zapas.ts`:

```ts
import type { UcastnikView, ZapasView } from "../../src/shared/types.js";

export function mujUcastnik(zapas: ZapasView, steamId: string): UcastnikView | null {
  return zapas.ucastnici.find((u) => u.steamId === steamId) ?? null;
}

export function spoluhraci(zapas: ZapasView, steamId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, steamId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.tym === ja.tym && u.steamId !== steamId);
}

export function souperi(zapas: ZapasView, steamId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, steamId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.tym !== ja.tym);
}

export function mojeZapasy(zapasy: ZapasView[], steamId: string): ZapasView[] {
  return zapasy.filter(
    (z) =>
      z.stav !== "dohrano" && z.stav !== "zruseny" && z.ucastnici.some((u) => u.steamId === steamId),
  );
}
```

- [ ] **Step 4: Napsat padající testy karty hráče**

`web/src/views/KartaHrace.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { KartaHrace } from "./KartaHrace.js";

const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "lobby_otevrena",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: null,
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

it("ukáže barvu a tým velkým písmem", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("modrá");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("1");
});

it("řekne, s kým se sdílí civilizace", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} />);
  expect(screen.getByText(/Pepa_CZ/)).toBeInTheDocument();
});

it("v 1v1 o sdílení civilizace nemluví", () => {
  const jeden: ZapasView = {
    ...zapas,
    format: "1v1",
    ucastnici: [zapas.ucastnici[0]!, zapas.ucastnici[2]!],
  };
  render(<KartaHrace zapas={jeden} ja="ja" onPripojit={vi.fn()} />);
  expect(screen.queryByText(/sdílíš/i)).not.toBeInTheDocument();
});

it("ukáže záložní cestu — název lobby, heslo i číslo", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} />);
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
  expect(screen.getByText("234230181")).toBeInTheDocument();
});

it("dokud host nevložil odkaz, čeká se", () => {
  const bezLobby: ZapasView = { ...zapas, stav: "vyhlaseny", lobbyId: null, joinUri: null };
  render(<KartaHrace zapas={bezLobby} ja="ja" onPripojit={vi.fn()} />);
  expect(screen.queryByRole("link", { name: /připojit/i })).not.toBeInTheDocument();
  expect(screen.getByText(/čeká se na hosta/i)).toBeInTheDocument();
});

it("odkaz na připojení míří do hry", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} />);
  expect(screen.getByRole("link", { name: /připojit/i })).toHaveAttribute(
    "href",
    "aoe2de://0/234230181",
  );
});

it("kliknutí na připojení se ohlásí serveru", async () => {
  const onPripojit = vi.fn();
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={onPripojit} />);
  screen.getByRole("link", { name: /připojit/i }).click();
  expect(onPripojit).toHaveBeenCalledWith(1);
});
```

- [ ] **Step 5: Spustit testy a ověřit, že padají**

Run: `npm --prefix web run test`
Expected: FAIL — komponenta neexistuje

- [ ] **Step 6: Napsat kartu hráče**

`web/src/views/KartaHrace.tsx`:

```tsx
import { BARVA_NAZEV, type ZapasView } from "../../../src/shared/types.js";
import { mujUcastnik, souperi, spoluhraci } from "../zapas.js";

interface Props {
  zapas: ZapasView;
  ja: string;
  onPripojit: (zapasId: number) => void;
}

export function KartaHrace({ zapas, ja, onPripojit }: Props) {
  const muj = mujUcastnik(zapas, ja);
  if (!muj) return null;

  const parta = spoluhraci(zapas, ja);
  const proti = souperi(zapas, ja);
  const barva = BARVA_NAZEV[muj.barva];

  return (
    <section className={`karta barva-${muj.barva}`}>
      <header>
        Zápas #{zapas.poradi} · {zapas.format === "1v1" ? "1v1" : "Coop Kings"}
      </header>

      <div className="hero">
        <strong data-testid="moje-barva">{barva}</strong>
        <span>
          tým <span data-testid="muj-tym">{muj.tym}</span>
        </span>
      </div>

      <p>
        V lobby si nastav <strong>{barva} barvu</strong> a <strong>tým {muj.tym}</strong>.
      </p>
      {parta.length > 0 ? (
        <p>
          Civilizaci sdílíš s <strong>{parta.map((s) => s.alias ?? s.steamId).join(", ")}</strong> —
          musíte mít oba stejnou barvu.
        </p>
      ) : null}

      {zapas.joinUri ? (
        <a className="cta" href={zapas.joinUri} onClick={() => onPripojit(zapas.id)}>
          Připojit se do hry
        </a>
      ) : (
        <p className="ceka">Čeká se na hosta, až založí lobby.</p>
      )}

      <footer>
        <p>Proti vám: {proti.map((s) => s.alias ?? s.steamId).join(", ")}</p>
        <p>
          Nejde odkaz? V lobby prohlížeči hledej <strong>{zapas.nazevLobby}</strong>
          {zapas.lobbyId ? (
            <>
              {" "}
              nebo vlož číslo <strong>{zapas.lobbyId}</strong>
            </>
          ) : null}
          .
        </p>
        {zapas.heslo ? (
          <p>
            Heslo: <strong>{zapas.heslo}</strong>
          </p>
        ) : null}
      </footer>
    </section>
  );
}
```

- [ ] **Step 7: Napsat padající testy obrazovky hosta**

`web/src/views/ObrazovkaHosta.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { ObrazovkaHosta } from "./ObrazovkaHosta.js";

const zaklad: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "vyhlaseny",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

it("diktuje nastavení, které jinak lidi kazí", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByText(/veřejná/i)).toBeInTheDocument();
  expect(screen.getByText(/allow spectators/i)).toBeInTheDocument();
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
});

it("ukáže zrcadlo lobby se všemi barvami a týmy", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  const radky = screen.getAllByTestId("radek-lobby");
  expect(radky).toHaveLength(4);
  expect(radky[0]).toHaveTextContent("modrá");
  expect(radky[2]).toHaveTextContent("červená");
});

it("dokud není vložený odkaz, nejde potvrdit", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /sedí to/i })).toBeDisabled();
});

it("po vložení odkazu jde potvrdit", () => {
  const sLobby = { ...zaklad, stav: "lobby_otevrena", lobbyId: "234230181" };
  render(<ObrazovkaHosta zapas={sLobby} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /sedí to/i })).toBeEnabled();
});

it("odešle vložený odkaz", async () => {
  const onVlozitOdkaz = vi.fn();
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} onPotvrdit={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  expect(onVlozitOdkaz).toHaveBeenCalledWith(1, "aoe2de://0/234230181");
});

it("po potvrzení to dá najevo", () => {
  const potvrzeny = { ...zaklad, stav: "lobby_otevrena", lobbyId: "234230181", hostPotvrdil: "2026-09-03T12:00:00.000Z" };
  render(<ObrazovkaHosta zapas={potvrzeny} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByText(/potvrzeno/i)).toBeInTheDocument();
});
```

Doplň do `web/package.json` do `devDependencies` `"@testing-library/user-event": "^14.5.2"` a nainstaluj.

- [ ] **Step 8: Spustit testy a ověřit, že padají**

Run: `npm --prefix web install && npm --prefix web run test`
Expected: FAIL — komponenta neexistuje

- [ ] **Step 9: Napsat obrazovku hosta**

`web/src/views/ObrazovkaHosta.tsx`:

```tsx
import { useState } from "react";
import { BARVA_NAZEV, type ZapasView } from "../../../src/shared/types.js";

interface Props {
  zapas: ZapasView;
  ja: string;
  onVlozitOdkaz: (zapasId: number, odkaz: string) => void;
  onPotvrdit: (zapasId: number) => void;
}

export function ObrazovkaHosta({ zapas, ja, onVlozitOdkaz, onPotvrdit }: Props) {
  const [odkaz, setOdkaz] = useState("");
  const maLobby = zapas.lobbyId !== null;

  return (
    <section className="host">
      <header>Jsi host zápasu #{zapas.poradi}</header>

      <ol className="nastaveni">
        <li>
          Viditelnost <strong>Veřejná</strong> — jinak nejde zapnout diváky
        </li>
        <li>
          Zaškrtnout <strong>Allow Spectators</strong> — bez toho se Rob nedostane dovnitř
        </li>
        <li>
          Název lobby <strong>{zapas.nazevLobby}</strong>
        </li>
        <li>
          Heslo <strong>{zapas.heslo}</strong>
        </li>
        <li>Počet hráčů {zapas.ucastnici.length}</li>
      </ol>

      <label>
        Odkaz z tlačítka Copy v lobby
        <input value={odkaz} onChange={(e) => setOdkaz(e.target.value)} placeholder="aoe2de://0/…" />
      </label>
      <button onClick={() => onVlozitOdkaz(zapas.id, odkaz)}>Uložit odkaz</button>

      <h3>Takhle to má v lobby vypadat</h3>
      <ul className="zrcadlo">
        {zapas.ucastnici.map((u) => (
          <li key={u.steamId} data-testid="radek-lobby" className={`barva-${u.barva}`}>
            <span className="swatch" /> {u.alias ?? u.steamId} — {BARVA_NAZEV[u.barva]}, tým {u.tym}
            {u.steamId === ja ? " ← TY" : ""}
            {u.kliknulPripojit ? " · klikl na připojení" : ""}
          </li>
        ))}
      </ul>

      {zapas.hostPotvrdil ? (
        <p className="potvrzeno">Potvrzeno. Rob se může dívat.</p>
      ) : (
        <button disabled={!maLobby} onClick={() => onPotvrdit(zapas.id)}>
          Sedí to — jsme nachystaní
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 10: Zapojit do aplikace**

Do `web/src/api.ts` přidej:

```ts
  pripojeni: (zapasId: number) => fetch(`/api/zapas/${zapasId}/pripojeni`, { method: "POST" }),
  vlozitOdkaz: (zapasId: number, odkaz: string) =>
    fetch(`/api/zapas/${zapasId}/lobby`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ odkaz }),
    }).then((r) => json<{ ok: true }>(r)),
  potvrdit: (zapasId: number) =>
    fetch(`/api/zapas/${zapasId}/potvrzeni`, { method: "POST" }).then((r) => json<{ ok: true }>(r)),
```

V `web/src/App.tsx` přidej import `mojeZapasy`, `mujUcastnik` z `./zapas.js` a obou komponent, a pod `<SeznamPrihlasenych />` vlož:

```tsx
{me
  ? mojeZapasy(stav?.zapasy ?? [], me.steamId).map((zapas) =>
      mujUcastnik(zapas, me.steamId)?.jeHost ? (
        <ObrazovkaHosta
          key={zapas.id}
          zapas={zapas}
          ja={me.steamId}
          onVlozitOdkaz={(id, odkaz) => void hlidej(() => api.vlozitOdkaz(id, odkaz))}
          onPotvrdit={(id) => void hlidej(() => api.potvrdit(id))}
        />
      ) : (
        <KartaHrace
          key={zapas.id}
          zapas={zapas}
          ja={me.steamId}
          onPripojit={(id) => void api.pripojeni(id)}
        />
      ),
    )
  : null}
```

a nad `return` přidej pomocníka, který chyby z API ukáže stejným kanálem jako u přihlašování:

```tsx
  async function hlidej(akce: () => Promise<unknown>) {
    try {
      setChyba(null);
      await akce();
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Nepovedlo se to.");
    }
  }
```

- [ ] **Step 11: Spustit testy**

Run: `npm --prefix web run test`
Expected: PASS

- [ ] **Step 12: Commit**

```bash
git add web/src
git commit -m "feat: tell each player their color and team, and let the host confirm the lobby"
```

---

## Task 17: Frontend — Robova režie

**Files:**
- Create: `web/src/views/Rezie.tsx`
- Modify: `web/src/api.ts`, `web/src/App.tsx`
- Test: `web/src/views/Rezie.test.tsx`

**Interfaces:**
- Consumes: `ZapasView`, `PlayerView`; API `/api/akce/:id/zapas`, `/api/zapas/:id/*`
- Produces: `<Rezie stav onVytvoritZapas onStav onVysledek onHost />`

- [ ] **Step 1: Napsat padající testy**

`web/src/views/Rezie.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AkceStavPayload, ZapasView } from "../../../src/shared/types.js";
import { Rezie } from "./Rezie.js";

const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "lobby_otevrena",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: "aoe2de://1/234230181",
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: "a", alias: "TenceR", tym: 1, barva: 1, jeHost: true, kliknulPripojit: "2026-09-03T12:00:00.000Z" },
    { steamId: "b", alias: "Pepa_CZ", tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

const stav: AkceStavPayload = {
  akce: { id: 1, nazev: "večer", stav: "bezi" },
  prihlaseni: [],
  zapasy: [zapas],
};

const props = {
  onVytvoritZapas: vi.fn(),
  onStav: vi.fn(),
  onVysledek: vi.fn(),
  onHost: vi.fn(),
};

it("stav účastníka pojmenuje jako kliknutí, ne jako přítomnost v lobby", () => {
  render(<Rezie stav={stav} {...props} />);
  expect(screen.getByText(/klikl na připojení/i)).toBeInTheDocument();
  expect(screen.queryByText(/je v lobby/i)).not.toBeInTheDocument();
});

it("spectate je dostupné hned, jak host vloží odkaz — potvrzení se nečeká", () => {
  // Rob se do lobby dostane jako divák ještě před startem hry, takže tam vidí
  // rozestavení a může špatně nastavenou lobby zavčas zarazit. Zamykat mu to
  // do potvrzení hosta by ho blokovalo přesně tam, kde je nejužitečnější.
  render(<Rezie stav={stav} {...props} />);
  const odkaz = screen.getByTestId("spectate");
  expect(odkaz).toHaveAttribute("aria-disabled", "false");
  expect(odkaz).toHaveAttribute("href", "aoe2de://1/234230181");
});

it("ukáže, jestli host nastavení už potvrdil", () => {
  render(<Rezie stav={stav} {...props} />);
  expect(screen.getByText(/host zatím nepotvrdil/i)).toBeInTheDocument();

  const potvrzeny = { ...stav, zapasy: [{ ...zapas, hostPotvrdil: "2026-09-03T12:00:00.000Z" }] };
  render(<Rezie stav={potvrzeny} {...props} />);
  expect(screen.getByText(/host potvrdil/i)).toBeInTheDocument();
});

it("záložní údaje jsou vidět pořád", () => {
  render(<Rezie stav={stav} {...props} />);
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
  expect(screen.getByText("234230181")).toBeInTheDocument();
});

it("bez čísla lobby spectate vůbec nenabízí", () => {
  const bez = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<Rezie stav={bez} {...props} />);
  expect(screen.getByTestId("spectate")).toHaveAttribute("aria-disabled", "true");
});
```

- [ ] **Step 2: Spustit testy a ověřit, že padají**

Run: `npm --prefix web run test`
Expected: FAIL — komponenta neexistuje

- [ ] **Step 3: Napsat režii**

`web/src/views/Rezie.tsx`:

```tsx
import { useState } from "react";
import { BARVA_NAZEV, type AkceStavPayload, type Format, type Tym } from "../../../src/shared/types.js";

// `useState` je potřeba jen ve `SkladaniZapasu` níž, ne v `Rezie`.

interface Props {
  stav: AkceStavPayload;
  onVytvoritZapas: (format: Format, steamIds: string[]) => void;
  onStav: (zapasId: number, stav: string) => void;
  onVysledek: (zapasId: number, tym: Tym) => void;
  onHost: (zapasId: number, steamId: string) => void;
}

export function Rezie({ stav, onVytvoritZapas, onStav, onVysledek, onHost }: Props) {
  return (
    <section className="rezie">
      {stav.zapasy.map((zapas) => {
        // Divácký odkaz funguje i před startem hry — ověřeno na živé lobby.
        // Jediná podmínka je, že host už vložil odkaz.
        const muzeSpectate = zapas.spectatorUri !== null;

        return (
          <article key={zapas.id} className="zapas">
            <header>
              Zápas #{zapas.poradi} · {zapas.stav}
            </header>

            <ul>
              {zapas.ucastnici.map((u) => (
                <li key={u.steamId} className={`barva-${u.barva}`}>
                  {u.alias ?? u.steamId} — {BARVA_NAZEV[u.barva]}, tým {u.tym}
                  {u.jeHost ? " (host)" : ""}
                  {" · "}
                  {/* Web ví jen to, že člověk klikl. Že opravdu dorazil, nevidí. */}
                  {u.kliknulPripojit ? "klikl na připojení" : "zatím neklikl"}
                  <button onClick={() => onHost(zapas.id, u.steamId)}>Hostuje tenhle</button>
                </li>
              ))}
            </ul>

            <a
              data-testid="spectate"
              className="cta"
              aria-disabled={muzeSpectate ? "false" : "true"}
              href={muzeSpectate ? zapas.spectatorUri! : undefined}
            >
              {muzeSpectate ? "Spectate" : "Spectate — čeká se na odkaz od hosta"}
            </a>
            <p className="potvrzeni">
              {zapas.hostPotvrdil ? "Host potvrdil nastavení." : "Host zatím nepotvrdil nastavení."}
            </p>

            <div className="zaloha">
              Kdyby to zamrzlo: lobby <strong>{zapas.nazevLobby}</strong>, heslo{" "}
              <strong>{zapas.heslo}</strong>, číslo <strong>{zapas.lobbyId ?? "—"}</strong>
            </div>

            <div className="ovladani">
              <button onClick={() => onStav(zapas.id, "vyhlaseny")}>Vyhlásit</button>
              <button onClick={() => onStav(zapas.id, "hraje_se")}>Hraje se</button>
              <button onClick={() => onVysledek(zapas.id, 1)}>Vyhrál tým 1</button>
              <button onClick={() => onVysledek(zapas.id, 2)}>Vyhrál tým 2</button>
              <button onClick={() => onStav(zapas.id, "zruseny")}>Zrušit</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}
```

Nad seznamem zápasů vykresli skládání nového zápasu. Pořadí kliknutí určuje dvojice, proto se vybraní drží v poli, ne v množině:

```tsx
function SkladaniZapasu({
  stav,
  onVytvoritZapas,
}: Pick<Props, "stav" | "onVytvoritZapas">) {
  const [format, setFormat] = useState<Format>("coop_kings_2v2");
  const [vybrani, setVybrani] = useState<string[]>([]);
  const potreba = format === "1v1" ? 2 : 4;

  function prepni(steamId: string) {
    setVybrani((d) =>
      d.includes(steamId) ? d.filter((s) => s !== steamId) : [...d, steamId],
    );
  }

  return (
    <div className="skladani">
      <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
        <option value="1v1">1v1</option>
        <option value="coop_kings_2v2">Coop Kings 2v2</option>
      </select>

      <p className="zaloha">
        Klikej v pořadí. {format === "coop_kings_2v2"
          ? "První dva tvoří jeden tým a sdílí civilizaci, druzí dva ten druhý."
          : "První hráč dostane modrou, druhý červenou."}
      </p>

      <ul className="vyber">
        {stav.prihlaseni.map((hrac) => {
          const poradi = vybrani.indexOf(hrac.steamId);
          return (
            <li key={hrac.steamId}>
              <button onClick={() => prepni(hrac.steamId)}>
                {poradi >= 0 ? `${poradi + 1}. ` : ""}
                {hrac.alias ?? hrac.steamName ?? hrac.steamId}
                {hrac.elo1v1 !== null ? ` (${hrac.elo1v1})` : ""}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        disabled={vybrani.length !== potreba}
        onClick={() => {
          onVytvoritZapas(format, vybrani);
          setVybrani([]);
        }}
      >
        Vytvořit zápas ({vybrani.length}/{potreba})
      </button>
    </div>
  );
}
```

a v `Rezie` ji vykresli nad `stav.zapasy.map(...)` jako `<SkladaniZapasu stav={stav} onVytvoritZapas={onVytvoritZapas} />`.

- [ ] **Step 4: Doplnit API volání a zapojit**

Do `web/src/api.ts`:

```ts
  vytvoritZapas: (akceId: number, format: Format, steamIds: string[]) =>
    fetch(`/api/akce/${akceId}/zapas`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format, steamIds }),
    }).then((r) => json<{ zapas: { id: number } }>(r)),
  zapasStav: (zapasId: number, stav: string) =>
    fetch(`/api/zapas/${zapasId}/stav`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stav }),
    }).then((r) => json<{ ok: true }>(r)),
  vysledek: (zapasId: number, viteznyTym: number) =>
    fetch(`/api/zapas/${zapasId}/vysledek`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ viteznyTym }),
    }).then((r) => json<{ ok: true }>(r)),
  zmenitHosta: (zapasId: number, steamId: string) =>
    fetch(`/api/zapas/${zapasId}/host`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ steamId }),
    }).then((r) => json<{ ok: true }>(r)),
```

V `App.tsx` vykresli `<Rezie />` jen když `me?.jeAdmin`.

- [ ] **Step 5: Spustit všechny testy**

Run: `npm test && npm run test:db && npm run test:web`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add web/src
git commit -m "feat: give Rob a director view with a guarded spectate button"
```

---

## Task 18: Nasazení a dokumentace

**Files:**
- Create: `README.md`
- Modify: `.env.example`
- Modify: `package.json` (skript `start`)

- [ ] **Step 1: Sestavit produkční build a ověřit ho**

Run:

```
npm run build
$env:DATABASE_URL="postgres://postgres:postgres@localhost:5432/rob_aoe"; $env:BASE_URL="http://localhost:3000"; npm start
```

Otevřít `http://localhost:3000` a ověřit, že se aplikace načte ze sestavených souborů (bez běžícího Vite).

- [ ] **Step 2: Vystavit to tunelem**

Run:

```
winget install --id Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000
```

Vzít vypsanou adresu `https://…trycloudflare.com`, nastavit ji do `BASE_URL` a aplikaci restartovat — Steam se po přihlášení vrací právě na `BASE_URL`, takže se to musí shodovat.

- [ ] **Step 3: Ověřit realtime přes tunel**

Otevřít tunelovou adresu ve dvou prohlížečích, v jednom se přihlásit do akce a ověřit, že se to v druhém objeví **samo, bez refreshe**. Kdyby se změny objevovaly opožděně nebo v dávkách, chybí hlavičky `cache-control: no-cache` a `x-accel-buffering: no` na SSE routě.

- [ ] **Step 4: Napsat README**

`README.md` s těmito oddíly:

- **K čemu to je** — dvě věty a odkaz na `docs/superpowers/specs/2026-09-03-aoe2-komunitni-hry-web-design.md`.
- **Co potřebuješ** — Node 24+, PostgreSQL, bezplatný Steam Web API klíč z `https://steamcommunity.com/dev/apikey`.
- **Rozjetí** — `npm install`, `npm --prefix web install`, `cp .env.example .env`, `npm run db:migrate`, `npm run dev` + `npm --prefix web run dev`.
- **Proměnné prostředí** — tabulka: `DATABASE_URL`, `BASE_URL` (musí sedět s adresou, na které to lidem běží), `PORT`, `STEAM_API_KEY` (bez něj se neukazují hodiny), `ADMIN_STEAM_ID` (Robův účet, jinak nikdo nemá režii).
- **Testy** — `npm test` (rychlé, bez sítě a databáze), `npm run test:db` (potřebuje `rob_aoe_test`), `npm run test:web`.
- **Vystavení ven** — Cloudflare Tunnel podle kroku 2; **ne port forwarding**, protože by to vystavilo domácí IP adresu. Postgres zůstává na `localhost`.
- **Jak to funguje ve zkratce** — `aoe2de://0/<id>` je připojení hráče, `aoe2de://1/<id>` je divácké připojení téže lobby; ukládá se jen to číslo a oba odkazy se odvozují.
- **Známá omezení** — chování na verzi z Microsoft Store není ověřené; URL helper je hlášeně nespolehlivý, proto je všude vidět i název lobby a číslo k ručnímu vyhledání.

- [ ] **Step 5: Commit**

```bash
git add README.md .env.example package.json
git commit -m "docs: describe how to run and expose the site"
```
