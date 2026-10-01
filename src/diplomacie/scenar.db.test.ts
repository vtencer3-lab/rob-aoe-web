import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { getAktivniAkce } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { buildServer } from "../http/server.js";
import { ROZBOR } from "../shared/diplomacie/fixtures.js";
import type { VysledekRozboru } from "./rozbor.js";
import { ROB, klient } from "./testPomocnici.js";

/** Skutečný scénář (kopie v repu se souhlasem autora) — routa kontroluje jeho hlavičku. */
const LLC = readFileSync(join(import.meta.dirname, "fixtures", "LLC.aoe2scenario"));

// Rozbor běží přes Python a trvá sekundy; tady se zkouší routa, ne rozbor.
let podvrhSelze = false;
const podvrh = async (): Promise<VysledekRozboru> =>
  podvrhSelze ? { ok: false, chyba: "ValueError: x" } : { ok: true, rozbor: ROZBOR, minimapa: Buffer.from("RIFF0000WEBP") };

// obnovStaty podstrčené: /api/me u čerstvého hráče čeká na jméno ze Steamu.
const app = buildServer({ rozeberScenar: podvrh, obnovStaty: async () => {} });

vi.stubEnv("AUTORI_SCENARE", "jin");

beforeEach(async () => {
  podvrhSelze = false;
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await app.close();
  await closePool();
});

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
  const seznam = await app.inject({ method: "GET", url: "/api/diplo/scenar" });
  expect(seznam.json().verze).toMatchObject([{ id, jmenoSouboru: "Diplomacie LLC v1.aoe2scenario", poznamka: "první", aktivni: true }]);
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
  // Bez rozboru není minimapa; stáhnout ji ale jde.
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${res.json().id}/minimapa.webp` })).statusCode).toBe(404);
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${res.json().id}/soubor` })).statusCode).toBe(200);
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar/aktivni/soubor" })).statusCode).toBe(404);
});

it("aktivace přepíše scénář v nastavení běžící akce Diplomacie", async () => {
  const jin = await klient("jin", false);
  const rob = await klient(ROB, true);
  const v1 = (await nahraj(jin, LLC, "LLC v1.aoe2scenario")).json().id;
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid: rob }, payload: { nazev: "D", rezim: "diplomacie" } });
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("x")]), "LLC v2.aoe2scenario")).json().id;
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "LLC v1.aoe2scenario" });
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2}/aktivni`, cookies: { sid: jin } });
  // S jménem se propíše i velikost mapy z rozboru (podvrh vrací ROZBOR: 220).
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "LLC v2.aoe2scenario", scenarStarsi: ["LLC v1.aoe2scenario"], rezim: 3, velikost: 220 });
  expect(v1).toBeLessThan(v2);
});

it("aktivovat smí jen autor; neexistující verze je 404", async () => {
  const jin = await klient("jin", false);
  const hrac = await klient("h1", false);
  const id = (await nahraj(jin, LLC)).json().id;
  expect((await app.inject({ method: "POST", url: `/api/diplo/scenar/${id}/aktivni`, cookies: { sid: hrac } })).statusCode).toBe(403);
  expect((await app.inject({ method: "POST", url: `/api/diplo/scenar/${id + 1}/aktivni`, cookies: { sid: jin } })).statusCode).toBe(404);
});

it("/api/me řekne, kdo smí nahrávat", async () => {
  expect((await app.inject({ method: "GET", url: "/api/me", cookies: { sid: await klient("jin", false) } })).json().smiNahratScenar).toBe(true);
  expect((await app.inject({ method: "GET", url: "/api/me", cookies: { sid: await klient("h1", false) } })).json().smiNahratScenar).toBe(false);
  expect((await app.inject({ method: "GET", url: "/api/me", cookies: { sid: await klient(ROB, true) } })).json().smiNahratScenar).toBe(true);
  expect((await app.inject({ method: "GET", url: "/api/me" })).json().smiNahratScenar).toBe(false);
});
