import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, getAktivniAkce, signUp } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { upsertPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";
import { losujRole } from "../shared/diplomacie/los.js";
import { VYCHOZI_NASTAVENI } from "../shared/lobbyKontrola.js";
import { aktivujVerzi, setNastupce, ulozRole, ulozVerziScenare } from "./db.js";
import { ROB, VERZE, klient, zapasOsmi } from "./testPomocnici.js";

const app = buildServer();

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  // Jméno pro hru je JIN_DIPLO_<pořadí>; od jedničky, ať ho testy znají předem.
  await getPool().query("ALTER SEQUENCE diplo_scenar_poradi_seq RESTART");
});

afterAll(async () => {
  await app.close();
  await closePool();
});

it("akce Diplomacie dostane nastavení scénáře z aktivní verze", async () => {
  await upsertPlayer("autor", false);
  const v1 = await ulozVerziScenare({ ...VERZE, jmenoSouboru: "LLC v1.aoe2scenario", sha256: "1" });
  const v2 = await ulozVerziScenare({ ...VERZE, jmenoSouboru: "LLC v2.aoe2scenario", sha256: "2" });
  await aktivujVerzi(v2.id);
  const sid = await klient(ROB, true);
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "D", rezim: "diplomacie" } });
  const n = (await getAktivniAkce())!.nastaveniLobby;
  // Velikost mapy bere z rozboru aktivní verze (fixtura ROZBOR: 220) — v
  // Custom Scenario ji hra v lobby nenabízí, posílá tu ze scénáře.
  expect(n).toMatchObject({ rezim: 3, scenar: "JIN_DIPLO_2.aoe2scenario", scenarStarsi: ["JIN_DIPLO_1.aoe2scenario"], mapaId: null, velikost: 220, populace: 200, lockTeams: false, sharedExploration: false, cheaty: false, povolitDivaky: true, maxHracu: 8 });
  expect(v1.aktivovana).toBe(true);
});

it("akce Diplomacie bez nahrané verze má scénář i velikost null", async () => {
  const sid = await klient(ROB, true);
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "D", rezim: "diplomacie" } });
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ rezim: 3, scenar: null, scenarStarsi: null, velikost: null });
});

// „Reset nastavení“ nasadí výchozí hodnoty módu, ne klasický základ — ten by
// u Diplomacie dal Random Map, scénář null a Lock Teams zapnuté, a kontrola
// lobby by hostovi vyčítala správně založenou scénářovou lobby. Klasická akce
// dostane základ jádra jako dřív. Snímek nese totéž, ať panel srovnává stejně.
it("reset nastavení dá akci Diplomacie výchozí hodnoty módu, klasické akci základ jádra", async () => {
  await upsertPlayer("autor", false);
  await ulozVerziScenare({ ...VERZE, jmenoSouboru: "LLC v1.aoe2scenario", sha256: "1" });
  const sid = await klient(ROB, true);
  const zaloz = (rezim: string) => app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "D", rezim } });
  const rozhas = (id: number) => app.inject({ method: "POST", url: `/api/akce/${id}/nastaveni-lobby`, cookies: { sid }, payload: { ...VYCHOZI_NASTAVENI, lockTeams: true, maxHracu: 2 } });
  const reset = (id: number) => app.inject({ method: "POST", url: `/api/akce/${id}/nastaveni-lobby/vychozi`, cookies: { sid } });

  const diplo = (await zaloz("diplomacie")).json().akce.id;
  await rozhas(diplo);
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ lockTeams: true, maxHracu: 2 });
  expect((await reset(diplo)).statusCode).toBe(200);
  const ocekavane = { rezim: 3, scenar: "JIN_DIPLO_1.aoe2scenario", velikost: 220, lockTeams: false, sharedExploration: false, maxHracu: 8, populace: 200 };
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject(ocekavane);
  expect((await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } })).json().akce.vychoziNastaveniLobby).toMatchObject(ocekavane);
  await app.inject({ method: "POST", url: `/api/akce/${diplo}/stav`, cookies: { sid }, payload: { stav: "konec" } });

  const klasicka = (await zaloz("klasicky")).json().akce.id;
  await rozhas(klasicka);
  expect((await reset(klasicka)).statusCode).toBe(200);
  expect((await getAktivniAkce())!.nastaveniLobby).toEqual(VYCHOZI_NASTAVENI);
  expect((await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } })).json().akce.vychoziNastaveniLobby).toEqual(VYCHOZI_NASTAVENI);
  // Nepřihlášený ani hráč reset nespustí.
  expect((await app.inject({ method: "POST", url: `/api/akce/${klasicka}/nastaveni-lobby/vychozi` })).statusCode).toBe(401);
  expect((await app.inject({ method: "POST", url: `/api/akce/${klasicka}/nastaveni-lobby/vychozi`, cookies: { sid: await klient("h1", false) } })).statusCode).toBe(403);
});

it("vytvoření zápasu Diplomacie založí diplo zápas s GM na šedé; stav ho nese, klasická akce ne", async () => {
  const { akce, zapas } = await zapasOsmi("diplomacie");
  const sid = await klient("h7", false);
  const res = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } });
  expect(res.json().rezim).toMatchObject({ id: "diplomacie", data: { zapasy: [{ zapasId: zapas.id, gmHracId: "h7", stav: "priprava" }] } });
  // Žádná verze scénáře ještě nahraná není — stav to unese (Review Focus 4).
  expect(res.json().rezim.data.aktivni).toBeNull();
  expect(akce.rezim).toBe("diplomacie");
});

it("sestava bez GM na šedé neprojde přes API, klasická akce ji vezme", async () => {
  const sid = await klient(ROB, true);
  const akce = await createAkce("D", "diplomacie");
  for (const h of ["a", "b"]) {
    await upsertPlayer(h, false);
    await signUp(akce.id, h);
  }
  const sestava = [
    { hracId: "a", barva: 1, tym: 0 },
    { hracId: "b", barva: 2, tym: 0 },
  ];
  const res = await app.inject({ method: "POST", url: `/api/akce/${akce.id}/zapas`, cookies: { sid }, payload: { sestava } });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/přesně 8/);
});

it("admin, který není GM, nedostane cizí role ani v GET /api/akce", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  await setNastupce(zapas.id, "h1");
  await ulozRole(zapas.id, losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h1", () => 0), "rozeslano");
  const sid = await klient(ROB, true);
  const telo = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid } })).json();
  expect(telo.rezim.data.zapasy[0].role).toEqual([]);
  expect(telo.rezim.data.zapasy[0].nastupceHracId).toBe("h1");
});
