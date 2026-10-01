import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, getAktivniAkce, signUp } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { upsertPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";
import { losujRole } from "../shared/diplomacie/los.js";
import { aktivujVerzi, setNastupce, ulozRole, ulozVerziScenare } from "./db.js";
import { ROB, VERZE, klient, zapasOsmi } from "./testPomocnici.js";

const app = buildServer();

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
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
  expect(n).toMatchObject({ rezim: 3, scenar: "LLC v2.aoe2scenario", scenarStarsi: ["LLC v1.aoe2scenario"], mapaId: null, velikost: 220, populace: 200, lockTeams: false, sharedExploration: false, cheaty: false, povolitDivaky: true, maxHracu: 8 });
  expect(v1.aktivovana).toBe(true);
});

it("akce Diplomacie bez nahrané verze má scénář i velikost null", async () => {
  const sid = await klient(ROB, true);
  await app.inject({ method: "POST", url: "/api/akce", cookies: { sid }, payload: { nazev: "D", rezim: "diplomacie" } });
  expect((await getAktivniAkce())!.nastaveniLobby).toMatchObject({ rezim: 3, scenar: null, scenarStarsi: null, velikost: null });
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
