import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { config } from "../config.js";
import { closePool, getPool } from "../db/pool.js";
import { getPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";
import { navratovaUrl } from "./steamOpenId.js";

const STEAM_ID = "76561198000000020";

// Podepsaná pole v pořadí, v jakém je Steam skutečně posílá.
const PODEPSANO = "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle";

const NAVRAT = new URLSearchParams({
  "openid.mode": "id_res",
  "openid.claimed_id": `https://steamcommunity.com/openid/id/${STEAM_ID}`,
  "openid.signed": PODEPSANO,
  "openid.return_to": navratovaUrl(config.baseUrl),
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

// OpenID 2.0 §11.1 (MUSÍ): ve stateless režimu Steam ověří podpis, ale netuší,
// který web se ptá. Bez porovnání return_to by assertion, kterou oběť
// vygenerovala na libovolném jiném webu s „Sign in with Steam", prošla i tady a
// založila relaci jako oběť — a kdyby tou obětí byl Rob, rovnou jako admin.
it("odmítne návrat vystavený pro jiný web, bez volání overSteam", async () => {
  const overSteam = vi.fn(async () => true);
  const app = buildServer({ overSteam, obnovStaty: async () => {} });

  const cizi = new URLSearchParams(NAVRAT);
  cizi.set("openid.return_to", "https://skiny.example.net/api/auth/steam/return");

  const res = await app.inject({ method: "GET", url: `/api/auth/steam/return?${cizi.toString()}` });

  expect(res.statusCode).toBe(401);
  expect(res.json().chyba).toMatch(/nepatří tomuhle webu/i);
  expect(overSteam).not.toHaveBeenCalled();
  expect(await getPlayer(STEAM_ID)).toBeNull();
  await app.close();
});

it("odmítne návrat úplně bez return_to, bez volání overSteam", async () => {
  const overSteam = vi.fn(async () => true);
  const app = buildServer({ overSteam, obnovStaty: async () => {} });

  const bez = new URLSearchParams(NAVRAT);
  bez.delete("openid.return_to");

  const res = await app.inject({ method: "GET", url: `/api/auth/steam/return?${bez.toString()}` });

  expect(res.statusCode).toBe(401);
  expect(overSteam).not.toHaveBeenCalled();
  expect(await getPlayer(STEAM_ID)).toBeNull();
  await app.close();
});

it("odmítne návrat, kde claimed_id není mezi podepsanými poli", async () => {
  const overSteam = vi.fn(async () => true);
  const app = buildServer({ overSteam, obnovStaty: async () => {} });

  const nepodepsane = new URLSearchParams(NAVRAT);
  nepodepsane.set("openid.signed", PODEPSANO.replace("claimed_id,", ""));

  const res = await app.inject({
    method: "GET",
    url: `/api/auth/steam/return?${nepodepsane.toString()}`,
  });

  expect(res.statusCode).toBe(401);
  expect(res.json().chyba).toMatch(/podpis identity/i);
  expect(overSteam).not.toHaveBeenCalled();
  expect(await getPlayer(STEAM_ID)).toBeNull();
  await app.close();
});

// --- nouzový režim ADMIN_BOOTSTRAP ---
//
// Rob nemusí být po ruce, když se web rozjíždí. Bez ADMIN_STEAM_ID by se ale
// nikdo do režie nedostal, tak se adminem stane první přihlášený — ale jen
// dokud žádný admin neexistuje, jinak by režii uzmul kdokoliv další.

function navratPro(steamId: string): string {
  const p = new URLSearchParams(NAVRAT);
  p.set("openid.claimed_id", `https://steamcommunity.com/openid/id/${steamId}`);
  return p.toString();
}

async function prihlas(steamId: string): Promise<void> {
  const app = buildServer({ overSteam: async () => true, obnovStaty: async () => {} });
  const res = await app.inject({ method: "GET", url: `/api/auth/steam/return?${navratPro(steamId)}` });
  expect(res.statusCode).toBe(302);
  await app.close();
}

const PRVNI = "76561198000000021";
const DRUHY = "76561198000000022";

it("v nouzovém režimu se první přihlášený stane adminem", async () => {
  vi.stubEnv("ADMIN_STEAM_ID", "");
  vi.stubEnv("ADMIN_BOOTSTRAP", "true");

  await prihlas(PRVNI);

  expect((await getPlayer(PRVNI))?.jeAdmin).toBe(true);
  vi.unstubAllEnvs();
});

it("druhý přihlášený už adminem není", async () => {
  vi.stubEnv("ADMIN_STEAM_ID", "");
  vi.stubEnv("ADMIN_BOOTSTRAP", "true");

  await prihlas(PRVNI);
  await prihlas(DRUHY);

  expect((await getPlayer(PRVNI))?.jeAdmin).toBe(true);
  expect((await getPlayer(DRUHY))?.jeAdmin).toBe(false);
  vi.unstubAllEnvs();
});

it("dočasnému adminovi se práva při dalším přihlášení neodeberou", async () => {
  // Tohle je ta past: upsertPlayer původně psal je_admin = (steamId === ADMIN_STEAM_ID),
  // takže s prázdnou proměnnou by si dočasný admin druhým přihlášením sám sebe
  // degradoval a režie by zmizela bez hlášky.
  vi.stubEnv("ADMIN_STEAM_ID", "");
  vi.stubEnv("ADMIN_BOOTSTRAP", "true");

  await prihlas(PRVNI);
  await prihlas(PRVNI);

  expect((await getPlayer(PRVNI))?.jeAdmin).toBe(true);
  vi.unstubAllEnvs();
});

it("bez nouzového režimu nikoho nepovýší", async () => {
  vi.stubEnv("ADMIN_STEAM_ID", "");
  vi.stubEnv("ADMIN_BOOTSTRAP", "");

  await prihlas(PRVNI);

  expect((await getPlayer(PRVNI))?.jeAdmin).toBe(false);
  vi.unstubAllEnvs();
});

it("nastavené ADMIN_STEAM_ID dočasnému adminovi práva zase odebere", async () => {
  vi.stubEnv("ADMIN_STEAM_ID", "");
  vi.stubEnv("ADMIN_BOOTSTRAP", "true");
  await prihlas(PRVNI);
  expect((await getPlayer(PRVNI))?.jeAdmin).toBe(true);

  // Rob se vrátil a zapsal se do prostředí.
  vi.stubEnv("ADMIN_STEAM_ID", DRUHY);
  await prihlas(PRVNI);
  await prihlas(DRUHY);

  expect((await getPlayer(PRVNI))?.jeAdmin).toBe(false);
  expect((await getPlayer(DRUHY))?.jeAdmin).toBe(true);
  vi.unstubAllEnvs();
});
