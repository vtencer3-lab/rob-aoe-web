import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { getAktivniAkce } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { buildServer } from "../http/server.js";
import { ROZBOR } from "../shared/diplomacie/fixtures.js";
import type { VysledekRozboru } from "./rozbor.js";
import type { VysledekSondy } from "./sonda.js";
import { ulozVerziScenare } from "./db.js";
import { ROB, VERZE, klient } from "./testPomocnici.js";

/** Skutečný scénář (kopie v repu se souhlasem autora) — routa kontroluje jeho hlavičku. */
const LLC = readFileSync(join(import.meta.dirname, "fixtures", "LLC.aoe2scenario"));

// Rozbor běží přes Python a trvá sekundy; tady se zkouší routa, ne rozbor.
let podvrhSelze = false;
const podvrh = async (): Promise<VysledekRozboru> =>
  podvrhSelze ? { ok: false, chyba: "ValueError: x" } : { ok: true, rozbor: ROZBOR, minimapa: Buffer.from("RIFF0000WEBP") };

// Totéž přibalení sondy: kopie „se sondou“ je originál s přívěskem, ať jde
// poznat, kterou z nich stažení vrátilo.
let sondaSelze = false;
const CILE = [{ promenna: 15, slot: 1, text: "zabito : {} /650 jednotek", limit: 650 }];
const seSondou = (data: Buffer) => Buffer.concat([data, Buffer.from("+sonda")]);
const podvrhSondy = async (data: Buffer): Promise<VysledekSondy> =>
  sondaSelze ? { ok: false, chyba: "ValueError: bez sondy" } : { ok: true, soubor: seSondou(data), sonda: { cile: CILE, oznaceno: 1, chyba: null } };

// obnovStaty podstrčené: /api/me u čerstvého hráče čeká na jméno ze Steamu.
const app = buildServer({ rozeberScenar: podvrh, pribalSondu: podvrhSondy, obnovStaty: async () => {} });

vi.stubEnv("AUTORI_SCENARE", "jin");

beforeEach(async () => {
  podvrhSelze = false;
  sondaSelze = false;
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

it("autor nahraje, první verze se aktivuje, stažení vrátí kopii se sondou pod stejným jménem", async () => {
  const jin = await klient("jin", false);
  const res = await nahraj(jin, LLC, "Diplomacie LLC v1.aoe2scenario", "první");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ aktivni: true, chybaRozboru: null, chybaSondy: null });
  const id = res.json().id;
  const stazeni = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` });
  expect(stazeni.rawPayload.equals(seSondou(LLC))).toBe(true);
  // Jméno se nemění: kontrola lobby porovnává jméno a soubor sondy se jmenuje podle něj.
  expect(stazeni.headers["content-disposition"]).toBe(`attachment; filename*=UTF-8''${encodeURIComponent("Diplomacie LLC v1.aoe2scenario")}`);
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar/aktivni/soubor" })).rawPayload.equals(seSondou(LLC))).toBe(true);
  const mapa = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/minimapa.webp` });
  expect(mapa.headers["content-type"]).toBe("image/webp");
  expect(mapa.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  const seznam = await app.inject({ method: "GET", url: "/api/diplo/scenar" });
  expect(seznam.json().verze).toMatchObject([{ id, jmenoSouboru: "Diplomacie LLC v1.aoe2scenario", poznamka: "první", aktivni: true, sonda: { cile: CILE, oznaceno: 1, chyba: null } }]);
});

it("originál bez sondy dostane jen autor a admin přes ?original=1", async () => {
  const jin = await klient("jin", false);
  const id = (await nahraj(jin, LLC)).json().id;
  for (const url of [`/api/diplo/scenar/${id}/soubor?original=1`, "/api/diplo/scenar/aktivni/soubor?original=1"]) {
    expect((await app.inject({ method: "GET", url, cookies: { sid: jin } })).rawPayload.equals(LLC)).toBe(true);
    expect((await app.inject({ method: "GET", url, cookies: { sid: await klient(ROB, true) } })).rawPayload.equals(LLC)).toBe(true);
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url, cookies: { sid: await klient("h1", false) } })).statusCode).toBe(403);
  }
});

it("když se sonda nepřibalí, verze se uloží s důvodem a stahuje se originál; Přibalit sondu ji dopočítá", async () => {
  const jin = await klient("jin", false);
  sondaSelze = true;
  const res = await nahraj(jin, LLC);
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ aktivni: true, chybaRozboru: null, chybaSondy: "ValueError: bez sondy" });
  const id = res.json().id;
  const verze = async () => (await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0];
  expect((await verze()).sonda).toEqual({ cile: [], oznaceno: 0, chyba: "ValueError: bez sondy" });
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(LLC)).toBe(true);

  // Dopočítat smí jen autor nebo admin; neznámá verze je 404.
  const sonda = (sid?: string, verzeId = id) => app.inject({ method: "POST", url: `/api/diplo/scenar/${verzeId}/sonda`, cookies: sid ? { sid } : {} });
  expect((await sonda()).statusCode).toBe(401);
  expect((await sonda(await klient("h1", false))).statusCode).toBe(403);
  expect((await sonda(jin, id + 1)).statusCode).toBe(404);

  // Pořád to nejde: 200 s důvodem, ne pád serveru.
  expect((await sonda(jin)).json()).toEqual({ ok: true, sonda: { cile: [], oznaceno: 0, chyba: "ValueError: bez sondy" } });

  sondaSelze = false;
  expect((await sonda(jin)).json()).toEqual({ ok: true, sonda: { cile: CILE, oznaceno: 1, chyba: null } });
  expect((await verze()).sonda).toEqual({ cile: CILE, oznaceno: 1, chyba: null });
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(seSondou(LLC))).toBe(true);
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor?original=1`, cookies: { sid: jin } })).rawPayload.equals(LLC)).toBe(true);
});

it("verze uložená bez údajů o sondě (nahraná dřív) má sonda null a stahuje se originál", async () => {
  await klient("autor", false);
  const { id } = await ulozVerziScenare({ ...VERZE, data: LLC });
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0].sonda).toBeNull();
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(LLC)).toBe(true);
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

// Parser `application/octet-stream` je zapouzdřený u routy nahrání: ostatní
// routy binární tělo odmítnou (415) jako dřív, i od admina. A poznámka má
// strop 500 znaků — hlavička bez stropu by šla celá do paměti i do databáze.
it("octet-stream berou jen routy nahrání; poznámka přes 500 znaků je 400", async () => {
  const rob = await klient(ROB, true);
  const cizi = await app.inject({ method: "POST", url: "/api/akce", cookies: { sid: rob }, headers: { "content-type": "application/octet-stream" }, payload: Buffer.from("x") });
  expect(cizi.statusCode).toBe(415);
  const jin = await klient("jin", false);
  const dlouha = await nahraj(jin, LLC, "LLC.aoe2scenario", "ř".repeat(501));
  expect(dlouha.statusCode).toBe(400);
  expect(dlouha.json().chyba).toBe("Poznámka má nejvýš 500 znaků.");
  expect((await nahraj(jin, LLC, "LLC.aoe2scenario", "ř".repeat(500))).statusCode).toBe(200);
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
