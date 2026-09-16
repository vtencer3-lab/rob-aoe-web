import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, getPool } from "../db/pool.js";
import { getPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";

const IDENTITA = {
  xuid: "2535412345678901",
  gamertag: "Jouki in Rage",
  uhs: "123",
  token: "xsts",
};

// Routy se registrují jen s config.maMicrosoft (viz server.ts) — bez těchhle
// dvou proměnných by 404ovaly bez ohledu na to, co je implementované. Stubuje
// se na úrovni testu, ne modulu, aby test „bez registrace" níže mohl mít obě
// proměnné vypnuté; afterEach je po každém testu odstubuje, ať se nepřenesou
// do dalšího (stejný vzor jako devRoutes.db.test.ts a jeho zapniDvere()).
function zapniMicrosoft(): void {
  vi.stubEnv("MS_CLIENT_ID", "test-client-id");
  vi.stubEnv("MS_CLIENT_SECRET", "test-client-secret");
}

function server(deps: {
  vymenKod?: (kod: string, verifier: string) => Promise<string>;
  ziskejIdentitu?: (accessToken: string) => Promise<typeof IDENTITA>;
} = {}) {
  zapniMicrosoft();
  return buildServer({
    vymenKod: deps.vymenKod ?? (async () => "ms-token"),
    ziskejIdentitu: deps.ziskejIdentitu ?? (async () => IDENTITA),
    poPrihlaseni: async () => {},
  });
}

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closePool();
});

it("bez MS_CLIENT_ID a MS_CLIENT_SECRET se Microsoft routy vůbec nezaregistrují", async () => {
  // Přesný precedens: devRoutes.db.test.ts "bez DEV_PRISTUP se zkušební
  // dveře vůbec nezaregistrují". Kdyby v server.ts zmizel `if
  // (config.maMicrosoft) registerMicrosoftRoutes(...)`, tenhle test to
  // odhalí — bez něj by 404 hlídalo jen čtení kódu, ne běžící sada.
  vi.stubEnv("MS_CLIENT_ID", undefined);
  vi.stubEnv("MS_CLIENT_SECRET", undefined);
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: async () => {},
  });

  const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
  expect(start.statusCode).toBe(404);

  const navrat = await app.inject({
    method: "GET",
    url: "/api/auth/microsoft/return?code=k&state=cokoliv",
  });
  expect(navrat.statusCode).toBe(404);
  await app.close();
});

describe("GET /api/auth/microsoft", () => {
  it("přesměruje na Microsoft a uloží state do cookie", async () => {
    const app = server();
    const res = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
    expect(res.statusCode).toBe(302);
    expect(res.headers["location"]).toContain("login.microsoftonline.com");
    expect(String(res.headers["set-cookie"])).toContain("ms_stav");
    await app.close();
  });
});

describe("GET /api/auth/microsoft/return", () => {
  it("bez shody state nepřihlásí, nikam se neptá a smaže cookie", async () => {
    // Bez téhle kontroly stačí útočníkovi podstrčit vlastní kód a přihlásí
    // oběť do svého účtu.
    const vymenKod = vi.fn(async () => "ms-token");
    const app = server({ vymenKod });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/microsoft/return?code=k&state=cizi",
      cookies: { ms_stav: "nase|overovatel" },
    });
    expect(res.statusCode).toBe(401);
    expect(vymenKod).not.toHaveBeenCalled();
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });

  it("úplně bez cookie odmítne a nikam se neptá", async () => {
    const vymenKod = vi.fn(async () => "ms-token");
    const app = server({ vymenKod });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/microsoft/return?code=k&state=cokoliv",
    });
    expect(res.statusCode).toBe(401);
    expect(vymenKod).not.toHaveBeenCalled();
    await app.close();
  });

  it("bez kódu v návratu odmítne, nikam se neptá a smaže cookie", async () => {
    const vymenKod = vi.fn(async () => "ms-token");
    const app = server({ vymenKod });
    const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
    const stav = String(start.headers["set-cookie"]).match(/ms_stav=([^;]+)/)![1]!;
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/microsoft/return?state=${decodeURIComponent(stav).split("|")[0]}`,
      cookies: { ms_stav: decodeURIComponent(stav) },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().chyba).toContain("kód");
    expect(vymenKod).not.toHaveBeenCalled();
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
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
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });

  it("chyba z Xboxu se ukáže česky, ne jako kód, a cookie se smaže", async () => {
    const app = server({
      ziskejIdentitu: async () => {
        throw new Error("Tenhle Microsoft účet nemá Xbox profil.");
      },
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
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });
});
