import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { getAktivniAkce } from "../db/events.js";
import { createZapas, setZapasStav } from "../db/matches.js";
import { closePool, getPool } from "../db/pool.js";
import { buildServer } from "../http/server.js";
import { ROZBOR } from "../shared/diplomacie/fixtures.js";
import type { RozborScenare } from "../shared/diplomacie/scenar.js";
import type { VysledekRozboru } from "./rozbor.js";
import { revizeSondy, type VysledekSondy } from "./sonda.js";
import { getSonduVerze, ulozVerziScenare } from "./db.js";
import { ROB, VERZE, klient, zapasOsmi } from "./testPomocnici.js";

/** Skutečný scénář (kopie v repu se souhlasem autora) — routa kontroluje jeho hlavičku. */
const LLC = readFileSync(join(import.meta.dirname, "fixtures", "LLC.aoe2scenario"));

// Rozbor běží přes Python a trvá sekundy; tady se zkouší routa, ne rozbor.
let podvrhSelze = false;
let rozborPodvrhu: RozborScenare = ROZBOR;
const RENDER = Buffer.from("RIFF0000WEBP");
const podvrh = async (): Promise<VysledekRozboru> => (podvrhSelze ? { ok: false, chyba: "ValueError: x" } : { ok: true, rozbor: rozborPodvrhu, minimapa: RENDER });

// Totéž přibalení sondy: kopie „se sondou“ je originál s přívěskem, ať jde
// poznat, kterou z nich stažení vrátilo.
let sondaSelze = false;
// Kopie nese otisk kódu sondy; jiný, než má web, znamená zastaralou sondu.
let revizePodvrhu: string | null = revizeSondy();
let varovaniPodvrhu: string[] = [];
const CILE = [{ promenna: 15, slot: 1, text: "zabito : {} /650 jednotek", limit: 650 }];
const seSondou = (data: Buffer) => Buffer.concat([data, Buffer.from("+sonda")]);
const podvrhSondy = async (data: Buffer): Promise<VysledekSondy> =>
  sondaSelze ? { ok: false, chyba: "ValueError: bez sondy" } : { ok: true, soubor: seSondou(data), sonda: { cile: CILE, oznaceno: 1, chyba: null, revize: revizePodvrhu, varovani: varovaniPodvrhu } };

// obnovStaty podstrčené: /api/me u čerstvého hráče čeká na jméno ze Steamu.
const app = buildServer({ rozeberScenar: podvrh, pribalSondu: podvrhSondy, obnovStaty: async () => {} });

vi.stubEnv("AUTORI_SCENARE", "jin");

beforeEach(async () => {
  podvrhSelze = false;
  rozborPodvrhu = ROZBOR;
  sondaSelze = false;
  revizePodvrhu = revizeSondy();
  varovaniPodvrhu = [];
  await getPool().query("TRUNCATE player, akce CASCADE");
  // Jméno pro hru je ROB_DIPLO_<pořadí>; od jedničky, ať ho testy znají předem.
  await getPool().query("ALTER SEQUENCE diplo_scenar_poradi_seq RESTART");
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

it("autor nahraje, první verze se aktivuje, stažení vrátí kopii se sondou pod jménem ROB_DIPLO_1", async () => {
  const jin = await klient("jin", false);
  const res = await nahraj(jin, LLC, "Diplomacie LLC v1.aoe2scenario", "první");
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ aktivni: true, chybaRozboru: null, chybaSondy: null });
  const id = res.json().id;
  const stazeni = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` });
  expect(stazeni.rawPayload.equals(seSondou(LLC))).toBe(true);
  // Jméno pro hru: kontrola lobby porovnává jméno a soubor sondy se jmenuje podle něj.
  expect(stazeni.headers["content-disposition"]).toBe("attachment; filename*=UTF-8''ROB_DIPLO_1_v10.aoe2scenario");
  // Originál si nechává jméno, pod kterým ho autor nahrál.
  const original = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor?original=1`, cookies: { sid: jin } });
  expect(original.headers["content-disposition"]).toBe(`attachment; filename*=UTF-8''${encodeURIComponent("Diplomacie LLC v1.aoe2scenario")}`);
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(seSondou(LLC))).toBe(true);
  const mapa = await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/minimapa.webp` });
  expect(mapa.headers["content-type"]).toBe("image/webp");
  expect(mapa.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
  const seznam = await app.inject({ method: "GET", url: "/api/diplo/scenar" });
  expect(seznam.json().verze).toMatchObject([{ id, jmenoSouboru: "Diplomacie LLC v1.aoe2scenario", jmenoHry: "ROB_DIPLO_1_v10.aoe2scenario", poznamka: "první", aktivni: true, sonda: { cilu: 1, oznaceno: 1, chyba: null, zastarala: false, varovani: [] } }]);
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
  expect((await verze()).sonda).toEqual({ cilu: 0, oznaceno: 0, chyba: "ValueError: bez sondy", zastarala: false, varovani: [] });
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(LLC)).toBe(true);

  // Dopočítat smí jen autor nebo admin; neznámá verze je 404.
  const sonda = (sid?: string, verzeId = id) => app.inject({ method: "POST", url: `/api/diplo/scenar/${verzeId}/sonda`, cookies: sid ? { sid } : {} });
  expect((await sonda()).statusCode).toBe(401);
  expect((await sonda(await klient("h1", false))).statusCode).toBe(403);
  expect((await sonda(jin, id + 1)).statusCode).toBe(404);

  // Pořád to nejde: 200 s důvodem, ne pád serveru.
  expect((await sonda(jin)).json()).toEqual({ ok: true, sonda: { cilu: 0, oznaceno: 0, chyba: "ValueError: bez sondy", zastarala: false, varovani: [] } });

  sondaSelze = false;
  // Prohlížeč dostane jen souhrn; výpis cílů zůstává serveru pro vyhodnocení hry.
  expect((await sonda(jin)).json()).toEqual({ ok: true, sonda: { cilu: 1, oznaceno: 1, chyba: null, zastarala: false, varovani: [] } });
  expect((await verze()).sonda).toEqual({ cilu: 1, oznaceno: 1, chyba: null, zastarala: false, varovani: [] });
  expect((await getSonduVerze(id))!.sonda).toEqual({ cile: CILE, oznaceno: 1, chyba: null, revize: revizeSondy(), varovani: [] });
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(seSondou(LLC))).toBe(true);
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor?original=1`, cookies: { sid: jin } })).rawPayload.equals(LLC)).toBe(true);
});

// Kopie se sondou z doby, kdy se soubor zapisoval u každého hráče (nebo
// s jakýmkoli jiným kódem sondy, než má web dnes), je ve správě vidět jako
// zastaralá; „Přibalit sondu“ ji vymění za dnešní.
it("sonda s jinou revizí je zastaralá, dokud se nepřibalí znovu; varování z přibalení se ukládá", async () => {
  const jin = await klient("jin", false);
  revizePodvrhu = "000000000000";
  varovaniPodvrhu = ["počet označených triggerů (41) nesedí na 7 hráčů bez GM"];
  const id = (await nahraj(jin, LLC)).json().id;
  const verze = async () => (await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0];
  expect((await verze()).sonda).toEqual({ cilu: 1, oznaceno: 1, chyba: null, zastarala: true, varovani: varovaniPodvrhu });

  // Stejně tak sonda uložená úplně bez revize (přibalená před opravou).
  await getPool().query("UPDATE diplo_scenar SET sonda = sonda - 'revize' - 'varovani' WHERE id = $1", [id]);
  expect((await verze()).sonda).toEqual({ cilu: 1, oznaceno: 1, chyba: null, zastarala: true, varovani: [] });

  revizePodvrhu = revizeSondy();
  varovaniPodvrhu = [];
  expect((await app.inject({ method: "POST", url: `/api/diplo/scenar/${id}/sonda`, cookies: { sid: jin } })).json().sonda).toMatchObject({ zastarala: false, varovani: [] });
  expect((await verze()).sonda).toMatchObject({ zastarala: false });
});

// Na webu jsou jen hotové verze (3. 10. 2026): stažení verze bez sondy nebo
// se zastaralou sondou ji nejdřív přebalí; originál přes ?original=1 nic nemění.
it("stažení verze bez sondy nebo se zastaralou ji přebalí; originál ne", async () => {
  await klient("autor", false);
  const jin = await klient("jin", false);
  const { id } = await ulozVerziScenare({ ...VERZE, data: LLC });
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0].sonda).toBeNull();
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor?original=1`, cookies: { sid: jin } })).rawPayload.equals(LLC)).toBe(true);
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0].sonda).toBeNull();
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(seSondou(LLC))).toBe(true);
  expect((await getSonduVerze(id))!.sonda?.revize).toBe(revizeSondy());
  // Zastaralá revize: znovu přebalí.
  await getPool().query("UPDATE diplo_scenar SET sonda = jsonb_set(sonda, '{revize}', '\"000000000000\"') WHERE id = $1", [id]);
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0].sonda).toMatchObject({ zastarala: true });
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/soubor` })).rawPayload.equals(seSondou(LLC))).toBe(true);
  expect((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze[0].sonda).toMatchObject({ zastarala: false });
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
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "ROB_DIPLO_1_v10.aoe2scenario" });
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2}/aktivni`, cookies: { sid: jin } });
  // S jménem se propíše i velikost mapy z rozboru (podvrh vrací ROZBOR: 220).
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "ROB_DIPLO_2_v10.aoe2scenario", scenarStarsi: ["ROB_DIPLO_1_v10.aoe2scenario"], rezim: 3, velikost: 220 });
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

// --- vlastní minimapa (obrázek ze hry) ---

const OBRAZEK = Buffer.from("RIFF1111WEBP-ze-hry");
// Středy kosočtverců z obrázku: o 0,03 na ose vedle startů z rozboru (ROZBOR má 0,5/0,5).
const STARTY_OBRAZKU = ROZBOR.starty.map((s) => ({ ...s, x: 0.53, y: 0.47 }));
/** Jako ruční zápis u verze 1 na /aoe/diplo (2. 10. 2026): obrázek, příznak a starty z obrázku. */
const dejVlastniMinimapu = (id: number) =>
  getPool().query("UPDATE diplo_scenar SET minimapa = $2, minimapa_otisk = left(encode(sha256($2), 'hex'), 16), minimapa_vlastni = true, rozbor = jsonb_set(rozbor, '{starty}', $3::jsonb) WHERE id = $1", [
    id,
    OBRAZEK,
    JSON.stringify(STARTY_OBRAZKU),
  ]);
const verzeId = async (id: number) => ((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze as { id: number }[]).find((v) => v.id === id) as Record<string, any>;
const minimapa = async (id: number) => (await app.inject({ method: "GET", url: `/api/diplo/scenar/${id}/minimapa.webp` })).rawPayload;
const prevzit = (sid: string | undefined, id: number, zdrojId: number) => app.inject({ method: "POST", url: `/api/diplo/scenar/${id}/minimapa-z/${zdrojId}`, cookies: sid ? { sid } : {} });

it("nová verze téže mapy převezme vlastní minimapu poslední verze, která ji má; Přibalit sondu na ni nesáhne", async () => {
  const jin = await klient("jin", false);
  const v1 = (await nahraj(jin, LLC, "LLC.aoe2scenario")).json();
  // Bez vlastní minimapy nikde není co převzít.
  expect(v1.vlastniMinimapa).toBeNull();
  await dejVlastniMinimapu(v1.id);
  const otisk = (await verzeId(v1.id)).minimapaOtisk;

  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC_2.aoe2scenario")).json();
  expect(v2.vlastniMinimapa).toEqual({ zdrojId: v1.id, prevzata: true });
  expect(await verzeId(v2.id)).toMatchObject({ minimapaVlastni: true, minimapaOtisk: otisk, rozbor: { ...ROZBOR, starty: STARTY_OBRAZKU } });
  expect((await minimapa(v2.id)).equals(OBRAZEK)).toBe(true);

  // Znovu přibalená sonda mění jen sondu.
  expect((await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2.id}/sonda`, cookies: { sid: jin } })).statusCode).toBe(200);
  expect(await verzeId(v2.id)).toMatchObject({ minimapaVlastni: true, minimapaOtisk: otisk, rozbor: { starty: STARTY_OBRAZKU } });
  expect((await minimapa(v2.id)).equals(OBRAZEK)).toBe(true);

  // Další verze bere od nejnovější verze s obrázkem.
  const v3 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("3")]), "LLC_3.aoe2scenario")).json();
  expect(v3.vlastniMinimapa).toEqual({ zdrojId: v2.id, prevzata: true });
});

it("jiná mapa vlastní minimapu nepřevezme a ruční převzetí je 409; nečitelná verze se o to ani nepokusí", async () => {
  const jin = await klient("jin", false);
  const v1 = (await nahraj(jin, LLC, "LLC.aoe2scenario")).json();
  await dejVlastniMinimapu(v1.id);

  rozborPodvrhu = { ...ROZBOR, starty: ROZBOR.starty.map((s) => (s.barva === 2 ? { ...s, x: 0.6 } : s)) };
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC_2.aoe2scenario")).json();
  expect(v2.vlastniMinimapa).toEqual({ zdrojId: v1.id, prevzata: false });
  expect(await verzeId(v2.id)).toMatchObject({ minimapaVlastni: false, rozbor: rozborPodvrhu });
  expect((await minimapa(v2.id)).equals(RENDER)).toBe(true);
  const odmitnuto = await prevzit(jin, v2.id, v1.id);
  expect(odmitnuto.statusCode).toBe(409);
  expect(odmitnuto.json().chyba).toBe(`Vlastní minimapu z verze ${v1.id} nejde převzít — mapa se změnila. Start barvy 2 je jinde než na vlastní minimapě.`);
  expect((await verzeId(v2.id)).minimapaVlastni).toBe(false);

  rozborPodvrhu = { ...ROZBOR, velikostMapy: 240 };
  expect((await nahraj(jin, Buffer.concat([LLC, Buffer.from("3")]), "LLC_3.aoe2scenario")).json().vlastniMinimapa).toEqual({ zdrojId: v1.id, prevzata: false });

  podvrhSelze = true;
  expect((await nahraj(jin, Buffer.concat([LLC, Buffer.from("4")]), "LLC_4.aoe2scenario")).json().vlastniMinimapa).toBeNull();
});

it("ruční převzetí vlastní minimapy: jen autor nebo admin, zdroj ji musí mít", async () => {
  const jin = await klient("jin", false);
  // Obě verze nahrané dřív, než první dostala obrázek — druhá ho nepřevzala.
  const v1 = (await nahraj(jin, LLC, "LLC.aoe2scenario")).json().id;
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC_2.aoe2scenario")).json().id;
  expect((await prevzit(jin, v2, v1)).json().chyba).toBe(`Verze ${v1} vlastní minimapu nemá.`);
  await dejVlastniMinimapu(v1);

  expect((await prevzit(undefined, v2, v1)).statusCode).toBe(401);
  expect((await prevzit(await klient("h1", false), v2, v1)).statusCode).toBe(403);
  expect((await prevzit(jin, v2 + 1, v1)).statusCode).toBe(404);
  expect((await prevzit(jin, v1, v1)).statusCode).toBe(409);

  expect((await prevzit(await klient(ROB, true), v2, v1)).json()).toEqual({ ok: true });
  expect(await verzeId(v2)).toMatchObject({ minimapaVlastni: true, minimapaOtisk: (await verzeId(v1)).minimapaOtisk, rozbor: { starty: STARTY_OBRAZKU } });
  expect((await minimapa(v2)).equals(OBRAZEK)).toBe(true);
});

// --- smazání verze a jméno pro hru ---

const smaz = (sid: string | undefined, id: number) => app.inject({ method: "DELETE", url: `/api/diplo/scenar/${id}`, cookies: sid ? { sid } : {} });
const jmenaVerzi = async () => ((await app.inject({ method: "GET", url: "/api/diplo/scenar" })).json().verze as { jmenoHry: string }[]).map((v) => v.jmenoHry);

const scenarZapasu = async (zapasId: number) =>
  (await getPool().query<{ scenar_id: number | null }>("SELECT scenar_id FROM diplo_zapas WHERE zapas_id = $1", [zapasId])).rows[0]!.scenar_id;

it("smazat nejde aktivní verzi; číslo smazané verze se znovu nepoužije", async () => {
  const jin = await klient("jin", false);
  const rob = await klient(ROB, true);
  const v1 = (await nahraj(jin, LLC, "LLC.aoe2scenario")).json().id;
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC.aoe2scenario")).json().id;
  const v3 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("3")]), "LLC.aoe2scenario")).json().id;
  // Nejnovější nahoře; stejné jméno originálu nevadí, pro hru se liší.
  expect(await jmenaVerzi()).toEqual(["ROB_DIPLO_3_v10.aoe2scenario", "ROB_DIPLO_2_v10.aoe2scenario", "ROB_DIPLO_1_v10.aoe2scenario"]);

  expect((await smaz(undefined, v3)).statusCode).toBe(401);
  expect((await smaz(await klient("h1", false), v3)).statusCode).toBe(403);
  expect((await smaz(jin, v3 + 100)).statusCode).toBe(404);

  const aktivni = await smaz(jin, v1);
  expect(aktivni.statusCode).toBe(409);
  expect(aktivni.json().chyba).toBe("Aktivní verzi nejde smazat — nejdřív nastav jinou jako aktivní.");

  expect((await smaz(rob, v2)).json()).toEqual({ ok: true });
  expect(await jmenaVerzi()).toEqual(["ROB_DIPLO_3_v10.aoe2scenario", "ROB_DIPLO_1_v10.aoe2scenario"]);
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${v2}/soubor` })).statusCode).toBe(404);
  const v4 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("4")]), "LLC.aoe2scenario")).json().id;
  expect((await app.inject({ method: "GET", url: `/api/diplo/scenar/${v4}/soubor` })).headers["content-disposition"]).toBe("attachment; filename*=UTF-8''ROB_DIPLO_4_v10.aoe2scenario");
});

// Uživatel 2. 10. 2026: verze ze zkoušek drží staré dohrané zápasy a smazat
// nešly. Blokuje jen běžící zápas otevřené akce; dohraným a zrušeným se
// otisk v téže transakci vynuluje.
it("verzi hranou jen dohranými a zrušenými zápasy jde smazat, běžící zápas ji drží", async () => {
  const jin = await klient("jin", false);
  await nahraj(jin, LLC, "LLC.aoe2scenario");
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC.aoe2scenario")).json().id;
  const v3 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("3")]), "LLC.aoe2scenario")).json().id;
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2}/aktivni`, cookies: { sid: jin } });
  const { akce, sestava, zapas: prvni } = await zapasOsmi("diplomacie");
  // Zápas Diplomacie si otisk aktivní verze založí sám (háček poVytvoreniZapasu).
  const druhy = await createZapas(akce.id, sestava);
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v3}/aktivni`, cookies: { sid: jin } });

  const obaBezi = await smaz(jin, v2);
  expect(await scenarZapasu(prvni.id)).toBe(v2);
  expect(obaBezi.statusCode).toBe(409);
  expect(obaBezi.json().chyba).toBe(`ROB_DIPLO_2_v10.aoe2scenario hraje běžící zápasy #${prvni.poradi}, #${druhy.poradi} — smazat ji půjde, až budou dohrané nebo zrušené.`);

  await setZapasStav(prvni.id, "dohrano");
  const jedenBezi = await smaz(jin, v2);
  expect(jedenBezi.statusCode).toBe(409);
  expect(jedenBezi.json().chyba).toBe(`ROB_DIPLO_2_v10.aoe2scenario hraje běžící zápas #${druhy.poradi} — smazat ji půjde, až bude dohraný nebo zrušený.`);
  // Odmítnutí nic nezměnilo.
  expect(await scenarZapasu(prvni.id)).toBe(v2);

  await setZapasStav(druhy.id, "zruseny");
  expect((await smaz(jin, v2)).json()).toEqual({ ok: true });
  expect(await scenarZapasu(prvni.id)).toBeNull();
  expect(await scenarZapasu(druhy.id)).toBeNull();
  expect(await jmenaVerzi()).toEqual(["ROB_DIPLO_3_v10.aoe2scenario", "ROB_DIPLO_1_v10.aoe2scenario"]);
});

it("verzi běžícího zápasu uzavřené akce jde smazat", async () => {
  const jin = await klient("jin", false);
  const v1 = (await nahraj(jin, LLC, "LLC.aoe2scenario")).json().id;
  const { akce, zapas } = await zapasOsmi("diplomacie");
  await getPool().query("UPDATE akce SET stav = 'konec' WHERE id = $1", [akce.id]);
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC.aoe2scenario")).json().id;
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2}/aktivni`, cookies: { sid: jin } });
  expect((await smaz(jin, v1)).statusCode).toBe(200);
  expect(await scenarZapasu(zapas.id)).toBeNull();
});

it("smazání verze ji vyřadí ze starších jmen kontroly lobby běžící akce", async () => {
  const jin = await klient("jin", false);
  const rob = await klient(ROB, true);
  const v1 = (await nahraj(jin, LLC)).json().id;
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid: rob }, payload: { nazev: "D", rezim: "diplomacie" } });
  const v2 = (await nahraj(jin, Buffer.concat([LLC, Buffer.from("2")]), "LLC v2.aoe2scenario")).json().id;
  await app.inject({ method: "POST", url: `/api/diplo/scenar/${v2}/aktivni`, cookies: { sid: jin } });
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "ROB_DIPLO_2_v10.aoe2scenario", scenarStarsi: ["ROB_DIPLO_1_v10.aoe2scenario"] });
  expect((await smaz(jin, v1)).statusCode).toBe(200);
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ scenar: "ROB_DIPLO_2_v10.aoe2scenario", scenarStarsi: [] });
});

// GM běžícího zápasu Diplomacie smí scénář spravovat (uživatel 5. 10. 2026);
// hráč téhož zápasu ne, a GM dohraného zápasu už taky ne.
it("GM běžícího zápasu Diplomacie smí nahrát scénář, hráč ne", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  expect((await nahraj(await klient("h1", false), LLC)).statusCode).toBe(403);
  expect((await nahraj(await klient("h7", false), LLC)).statusCode).toBe(200);
  await setZapasStav(zapas.id, "dohrano");
  expect((await nahraj(await klient("h7", false), LLC, "jina.aoe2scenario")).statusCode).toBe(403);
});
