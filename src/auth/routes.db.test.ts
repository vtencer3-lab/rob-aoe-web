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

it("odmítne návrat se zdvojeným openid.assoc_handle bez volání overSteam", async () => {
  // request.query mangles repeated keys under Fastify 5's fast-querystring parser
  // (a repeated key becomes an array, which URLSearchParams then comma-joins into
  // one value) — build the raw query string by hand so the duplicate survives.
  const overSteam = vi.fn(async () => true);
  const app = buildServer({ overSteam, obnovStaty: async () => {} });

  const dotaz =
    `openid.mode=id_res` +
    `&openid.claimed_id=${encodeURIComponent(`https://steamcommunity.com/openid/id/${STEAM_ID}`)}` +
    `&openid.assoc_handle=aaa` +
    `&openid.assoc_handle=bbb` +
    `&openid.sig=xyz`;

  const res = await app.inject({ method: "GET", url: `/api/auth/steam/return?${dotaz}` });

  expect(res.statusCode).toBe(401);
  expect(overSteam).not.toHaveBeenCalled();
  expect(await getPlayer(STEAM_ID)).toBeNull();
  await app.close();
});

it("synchronní pád obnovStaty nezabrání přihlášení", async () => {
  const app = buildServer({
    overSteam: async () => true,
    // Nikoliv async: vyhodí dřív, než vznikne příslib — stejná past jako u
    // refreshPlayerStats.
    obnovStaty: () => {
      throw new Error("Worlds Edge mimo provoz (synchronně)");
    },
  });
  const res = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${NAVRAT.toString()}`,
  });
  expect(res.statusCode).toBe(302);
  expect(res.cookies.find((c) => c.name === "sid")?.httpOnly).toBe(true);
  expect(await getPlayer(STEAM_ID)).not.toBeNull();
  await app.close();
});
