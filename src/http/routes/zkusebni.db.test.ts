import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAkce, listSignups } from "../../db/events.js";
import { closePool, getPool } from "../../db/pool.js";
import { upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { buildServer } from "../server.js";

const ROB = "76561198000000070";
const HRAC = "76561198000000071";
let akceId: number;
let robSid: string;
let hracSid: string;

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;
  await upsertPlayer(ROB, true);
  robSid = await createSession(ROB);
  await upsertPlayer(HRAC, false);
  hracSid = await createSession(HRAC);
  vi.stubEnv("ZKUSEBNI_HRACI", "true");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closePool();
});

it("nastavení prozradí, že zkušební hráči jsou zapnutí", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/nastaveni" });
  expect(res.json()).toMatchObject({ zkusebniHraci: true });
  await app.close();
});

it("Rob přidá zkušební hráče po jednom, pořád jiné, se statistikami", async () => {
  const app = buildServer();
  const prvni = await app.inject({ method: "POST", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: robSid } });
  const druhy = await app.inject({ method: "POST", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: robSid } });
  expect(prvni.json()).toEqual({ pridan: "Pepa" });
  expect(druhy.json()).toEqual({ pridan: "Jana" });

  const prihlaseni = await listSignups(akceId);
  expect(prihlaseni.map((h) => h.alias)).toEqual(["Pepa", "Jana"]);
  expect(prihlaseni[0]!.elo1v1).toBe(1180);
  await app.close();
});

it("odebrání odhlásí jen zkušební, skuteční hráči zůstanou", async () => {
  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akceId}/prihlaska`, cookies: { sid: hracSid } });
  await app.inject({ method: "POST", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: robSid } });
  await app.inject({ method: "POST", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: robSid } });

  const res = await app.inject({ method: "DELETE", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: robSid } });
  expect(res.json()).toEqual({ odebrano: 2 });
  expect((await listSignups(akceId)).map((h) => h.steamId)).toEqual([HRAC]);
  await app.close();
});

it("běžný hráč zkušební hráče přidat nesmí", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "POST", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: hracSid } });
  expect(res.statusCode).toBe(403);
  await app.close();
});

// Ostrá verze proměnnou nemá: routy se tváří, že neexistují, a frontend
// podle /api/nastaveni tlačítka vůbec nekreslí.
it("bez ZKUSEBNI_HRACI je to 404 a nastavení říká vypnuto", async () => {
  vi.stubEnv("ZKUSEBNI_HRACI", "");
  const app = buildServer();
  const res = await app.inject({ method: "POST", url: `/api/akce/${akceId}/zkusebni-hraci`, cookies: { sid: robSid } });
  expect(res.statusCode).toBe(404);
  const nastaveni = await app.inject({ method: "GET", url: "/api/nastaveni" });
  expect(nastaveni.json()).toMatchObject({ zkusebniHraci: false });
  await app.close();
});
