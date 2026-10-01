import { afterAll, beforeEach, expect, it } from "vitest";
import { signUp } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { upsertPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";
import { getDiploZapas, setNastupce } from "./db.js";
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

// Všech pět rout GM, pro admina-ne-GM i pro hráče zápasu: admin výjimku nemá
// (spec §6.3), hráč tím spíš. Odmítnutí přijde dřív než kontrola stavu.
it("všech pět rout GM odmítne admina-ne-GM i hráče zápasu 403", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const u = `/api/diplo/zapas/${zapas.id}`;
  for (const sid of [await klient(ROB, true), await klient("h1", false)]) {
    expect((await post(`${u}/nastupce`, sid, { hracId: "h1" })).statusCode).toBe(403);
    expect((await post(`${u}/los`, sid)).statusCode).toBe(403);
    expect((await app.inject({ method: "PUT", url: `${u}/role/h1`, cookies: { sid }, payload: { role: "kat" } })).statusCode).toBe(403);
    expect((await post(`${u}/rozeslat`, sid)).statusCode).toBe(403);
    expect((await post(`${u}/zpet`, sid)).statusCode).toBe(403);
  }
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

it("nepovolený cíl, neznámá role a změna role Nástupce jsou 400", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const u = `/api/diplo/zapas/${zapas.id}`;
  await post(`${u}/nastupce`, gm, { hracId: "h1" });
  await post(`${u}/los`, gm);
  const kat = (await getDiploZapas(zapas.id))!.role.find((r) => r.role === "kat")!.hracId;
  expect((await app.inject({ method: "PUT", url: `${u}/role/${kat}`, cookies: { sid: gm }, payload: { cilHracId: "h1" } })).statusCode).toBe(400);
  expect((await app.inject({ method: "PUT", url: `${u}/role/${kat}`, cookies: { sid: gm }, payload: { role: "cisar" } })).statusCode).toBe(400);
  // Nástupce se mění dlaždicí v přípravě, ne roletkou (pravidlo z los.ts, na úrovni routy 400).
  const nastupce = await app.inject({ method: "PUT", url: `${u}/role/h1`, cookies: { sid: gm }, payload: { role: "kat" } });
  expect(nastupce.statusCode).toBe(400);
  expect(nastupce.json().chyba).toBe("Nástupce se mění výběrem Nástupce, ne rolí.");
  expect((await getDiploZapas(zapas.id))!.role.find((r) => r.hracId === "h1")?.role).toBe("nastupce");
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

// Nástupce je hráč zápasu: když ho admin v přípravě vymění (nebo posadí na
// šedou), volba zmizí a GM vybírá znovu; výměna kohokoliv jiného ji nechá.
it("změna sestavy vynuluje Nástupce, který v ní už není; jiná výměna ho nechá", async () => {
  const { akce, zapas, sestava } = await zapasOsmi("diplomacie");
  const rob = await klient(ROB, true);
  const gm = await klient("h7", false);
  await upsertPlayer("h9", false);
  await signUp(akce.id, "h9");
  const put = (s: typeof sestava) => app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/sestava`, cookies: { sid: rob }, payload: { sestava: s } });
  const u = `/api/diplo/zapas/${zapas.id}`;

  await post(`${u}/nastupce`, gm, { hracId: "h1" });
  expect((await put(sestava.map((s) => (s.hracId === "h3" ? { ...s, hracId: "h9" } : s)))).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h1");
  expect((await put(sestava.map((s) => (s.hracId === "h1" ? { ...s, hracId: "h9" } : s)))).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
  // Nástupce přesazený na šedou je GM, ne hráč.
  await post(`${u}/nastupce`, gm, { hracId: "h2" });
  expect((await put(sestava.map((s) => (s.hracId === "h2" ? { ...s, hracId: "h7" } : s.hracId === "h7" ? { ...s, hracId: "h2" } : s)))).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
});

// Souběh: GM klikl na „Rozdat role“ dřív, než mu dorazil stav po změně sestavy.
it("los s Nástupcem mimo zápas je 409 s pokynem vybrat znovu", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await upsertPlayer("h9", false);
  await setNastupce(zapas.id, "h9");
  const res = await post(`/api/diplo/zapas/${zapas.id}/los`, gm);
  expect(res.statusCode).toBe(409);
  expect(res.json().chyba).toBe("Nástupce už v zápase není — vyber ho znovu.");
});

it("zápas mimo Diplomacii je 404", async () => {
  const { zapas } = await zapasOsmi("klasicky");
  const gm = await klient("h7", false);
  expect((await post(`/api/diplo/zapas/${zapas.id}/los`, gm)).statusCode).toBe(404);
});
