import { afterAll, beforeEach, expect, it } from "vitest";
import { closePool, getPool } from "../db/pool.js";
import { buildServer } from "../http/server.js";
import { getDiploZapas } from "./db.js";
import { ROB, klient, zapasOsmi } from "./testPomocnici.js";

const app = buildServer();

/** Sedm hráčů bez GM (h7 sedí na šedé) — mezi ně se rozdávají role. */
const HRACI = ["h1", "h2", "h3", "h4", "h5", "h6", "h8"];
const post = (url: string, sid: string, payload?: object) => app.inject({ method: "POST", url, cookies: { sid }, ...(payload ? { payload } : {}) });

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await app.close();
  await closePool();
});

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
