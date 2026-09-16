import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, getPool } from "../db/pool.js";
import { getPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";

// Routy se registrují jen s config.maMicrosoft (viz server.ts) — bez těchhle
// dvou proměnných by 404ovaly bez ohledu na to, co je implementované.
vi.stubEnv("MS_CLIENT_ID", "test-client-id");
vi.stubEnv("MS_CLIENT_SECRET", "test-client-secret");

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

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await closePool();
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
    const app = buildServer({
      vymenKod,
      ziskejIdentitu: async () => IDENTITA,
      poPrihlaseni: async () => {},
    });
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
    const app = buildServer({
      vymenKod,
      ziskejIdentitu: async () => IDENTITA,
      poPrihlaseni: async () => {},
    });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/microsoft/return?code=k&state=cokoliv",
    });
    expect(res.statusCode).toBe(401);
    expect(vymenKod).not.toHaveBeenCalled();
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
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });
});
