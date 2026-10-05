import { afterAll, beforeEach, expect, it } from "vitest";
import { setNastaveniLobby, signUp } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { getZapas, setZapasStav } from "../db/matches.js";
import { upsertPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";
import { hlasHub } from "../realtime/hlas.js";
import { KANAL_AKCE } from "../realtime/hub.js";
import type { HlasUdalost } from "../shared/types.js";
import { getDiploZapas, getVerze, pridejDoplatky, pridejPripominky, setNastupce, ulozVerziScenare } from "./db.js";
import { ROB, VERZE, klient, zapasOsmi } from "./testPomocnici.js";

const app = buildServer();

/** Sedm hráčů bez GM (h7 sedí na šedé) — mezi ně se rozdávají role. */
const HRACI = ["h1", "h2", "h3", "h4", "h5", "h6", "h8"];
const post = (url: string, sid: string, payload?: object) => app.inject({ method: "POST", url, cookies: { sid }, ...(payload ? { payload } : {}) });

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce, diplo_scenar CASCADE");
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

it("celý průchod: Nástupce → los → úprava → rozeslání → úprava odmítnuta → zpět", async () => {
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
  expect((await getDiploZapas(zapas.id))!.role.find((r) => r.hracId === sasek)).toMatchObject({ role: "kat" });

  expect((await post(`${u}/rozeslat`, gm)).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.stav).toBe("rozeslano");

  // Po rozeslání se role nemění (pravidlo z 2. 10. 2026): úprava role
  // i cíle je 409 s větou pro GM — ani `potvrzeno` ji nepustí — a role
  // zůstanou přesně tak, jak byly rozeslány.
  const rozeslane = (await getDiploZapas(zapas.id))!.role;
  const kat = rozeslane.find((r) => r.hracId === sasek)!;
  for (const payload of [{ role: "sasek" }, { role: "sasek", potvrzeno: true }, { cilHracId: kat.cilHracId === "h1" ? "h2" : "h1", potvrzeno: true }]) {
    const pokus = await app.inject({ method: "PUT", url: `${u}/role/${sasek}`, cookies: { sid: gm }, payload });
    expect(pokus.statusCode).toBe(409);
    expect(pokus.json().chyba).toBe("Role jsou rozeslané — změnit je jde jen přes Zpět na výběr Nástupce.");
  }
  expect((await getDiploZapas(zapas.id))!.role).toEqual(rozeslane);

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

// Push-to-talk (uživatel 2. 10. 2026): GM „svolává všechny“ — do svého zápasu
// mluví jako admin z režie, i když admin není. Jádro se ptá háčku módu.
it("kousek hlasu do zápasu Diplomacie smí poslat GM a admin, hráč-ne-GM 403", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const kousek = { sezeni: "s1", poradi: 0, data: "AAAA", mime: "audio/webm;codecs=opus" };
  const slysel: HlasUdalost[] = [];
  const odhlas = hlasHub.subscribe(KANAL_AKCE, (u) => slysel.push(u));
  try {
    expect((await post(`/api/zapas/${zapas.id}/hlas`, await klient("h7", false), kousek)).statusCode).toBe(200);
    expect((await post(`/api/zapas/${zapas.id}/hlas`, await klient("h1", false), kousek)).statusCode).toBe(403);
    expect((await post(`/api/zapas/${zapas.id}/hlas`, await klient(ROB, true), kousek)).statusCode).toBe(200);
  } finally {
    odhlas();
  }
  // Slyší stejný okruh jako u admina: účastníci zápasu (a admini přes smiSlyset).
  expect(slysel.map((u) => [u.kdo, u.jeAdmin])).toEqual([["h7", false], [ROB, true]]);
  expect(slysel[0]!.prijemci).toEqual(["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"]);
});

it("do dohraného zápasu GM mluvit nesmí, admin ano", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  await setZapasStav(zapas.id, "dohrano");
  const kousek = { sezeni: "s1", poradi: 0, data: "AAAA", mime: "audio/webm;codecs=opus" };
  expect((await post(`/api/zapas/${zapas.id}/hlas`, await klient("h7", false), kousek)).statusCode).toBe(403);
  expect((await post(`/api/zapas/${zapas.id}/hlas`, await klient(ROB, true), kousek)).statusCode).toBe(200);
});

it("v klasickém zápase hráč na šedé mluvit nesmí", async () => {
  const { zapas } = await zapasOsmi("klasicky");
  const res = await post(`/api/zapas/${zapas.id}/hlas`, await klient("h7", false), { sezeni: "s1", poradi: 0, data: "AAAA" });
  expect(res.statusCode).toBe(403);
});

// Přepínače pod mapou pultu (migrace 038): výchozí obojí zapnuté, GM mění
// každé zvlášť; hráč zápasu ani admin-ne-GM nesmí, nesmysl je 400.
it("zobrazení mapy: výchozí zapnuté, mění jen GM, každé zvlášť", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const hrac = await klient("h1", false);
  expect((await getDiploZapas(zapas.id))!.mapa).toEqual({ kralove: true, relikvie: true });
  expect((await post(`/api/diplo/zapas/${zapas.id}/mapa`, hrac, { kralove: false })).statusCode).toBe(403);
  expect((await post(`/api/diplo/zapas/${zapas.id}/mapa`, gm, { kralove: "ne" })).statusCode).toBe(400);
  expect((await post(`/api/diplo/zapas/${zapas.id}/mapa`, gm, { kralove: false })).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.mapa).toEqual({ kralove: false, relikvie: true });
  expect((await post(`/api/diplo/zapas/${zapas.id}/mapa`, gm, { relikvie: false })).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.mapa).toEqual({ kralove: false, relikvie: false });
});

// Ping na mapě: jen GM, místo 0–1, adresát všichni nebo hráč zápasu.
it("ping: GM 200, hráč 403, mimo mapu a cizí adresát 400", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const hrac = await klient("h1", false);
  const u = `/api/diplo/zapas/${zapas.id}/ping`;
  expect((await post(u, hrac, { x: 0.5, y: 0.5, komu: null })).statusCode).toBe(403);
  expect((await post(u, gm, { x: 1.5, y: 0.5, komu: null })).statusCode).toBe(400);
  expect((await post(u, gm, { x: 0.5, y: 0.5, komu: ["cizi"] })).statusCode).toBe(400);
  expect((await post(u, gm, { x: 0.5, y: 0.5, komu: ["h2", "h7"] })).statusCode).toBe(400);
  expect((await post(u, gm, { x: 0.5, y: 0.5, komu: "h2" })).statusCode).toBe(400);
  expect((await post(u, gm, { x: 0.5, y: 0.5, komu: null })).statusCode).toBe(200);
  expect((await post(u, gm, { x: 0.2, y: 0.8, komu: ["h2", "h3"] })).statusCode).toBe(200);
});

// Schopnosti rolí (uživatel 3. 10. 2026): hráč žádá, GM potvrzuje; Šašek
// se po pádu Gardy (ručně GM) stává Gardou a informace už žádat nesmí.
it("schopnosti: Sabotáž Nájezdníka, potvrzení GM, proměna Šaška", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const u = `/api/diplo/zapas/${zapas.id}`;
  expect((await post(`${u}/nastupce`, gm, { hracId: "h3" })).statusCode).toBe(200);
  expect((await post(`${u}/los`, gm)).statusCode).toBe(200);
  const role = (await getDiploZapas(zapas.id))!.role;
  const kdo = (r: string) => role.find((x) => x.role === r)!.hracId;
  const najezdnik = await klient(kdo("najezdnik"), false);
  const sasek = await klient(kdo("sasek"), false);

  // Před rozesláním nic.
  expect((await post(`${u}/schopnost`, najezdnik, { druh: "sabotaz", cilHracId: "h3" })).statusCode).toBe(409);
  expect((await post(`${u}/rozeslat`, gm)).statusCode).toBe(200);
  expect((await post(`${u}/schopnost`, najezdnik, { druh: "hokus" })).statusCode).toBe(400);
  expect((await post(`${u}/schopnost`, sasek, { druh: "sabotaz", cilHracId: "h3" })).statusCode).toBe(409);
  expect((await post(`${u}/schopnost`, najezdnik, { druh: "sabotaz", cilHracId: "h3" })).statusCode).toBe(200);
  expect((await post(`${u}/schopnost`, najezdnik, { druh: "sabotaz", cilHracId: "h1" })).statusCode).toBe(409);
  const zadost = (await getDiploZapas(zapas.id))!.schopnosti![0]!;
  expect(zadost).toMatchObject({ hracId: kdo("najezdnik"), druh: "sabotaz", cilHracId: "h3", stav: "ceka" });
  expect((await post(`${u}/schopnost/${zadost.id}`, najezdnik, { stav: "potvrzeno" })).statusCode).toBe(403);
  expect((await post(`${u}/schopnost/${zadost.id}`, gm, { stav: "potvrzeno" })).statusCode).toBe(200);
  expect((await post(`${u}/schopnost/${zadost.id}`, gm, { stav: "zamitnuto" })).statusCode).toBe(409);

  // Šašek žádá informaci, pak padne Garda: žádost propadne a Šašek je Gardou.
  expect((await post(`${u}/schopnost`, sasek, { druh: "informace" })).statusCode).toBe(200);
  expect((await post(`${u}/garda-padla`, gm)).statusCode).toBe(200);
  expect((await post(`${u}/garda-padla`, gm)).statusCode).toBe(409);
  const po = (await getDiploZapas(zapas.id))!;
  expect(po.role.find((r) => r.hracId === kdo("sasek"))).toMatchObject({ role: "garda", puvodniRole: "sasek", promenaVidena: false });
  expect(po.schopnosti!.find((s) => s.druh === "informace")!.stav).toBe("zamitnuto");
  expect((await post(`${u}/schopnost`, sasek, { druh: "informace" })).statusCode).toBe(409);
  expect((await post(`${u}/promena`, sasek)).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.role.find((r) => r.hracId === kdo("sasek"))!.promenaVidena).toBe(true);
});

// Připomínky ze hry chodí každou sekundu znovu — v databázi každá jen jednou.
it("doplatky Žoldákovi a připomínky ze hry se nezdvojí", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  expect(await pridejDoplatky(zapas.id, "h2", 2)).toBe(true);
  expect(await pridejDoplatky(zapas.id, "h2", 2)).toBe(false);
  expect(await pridejDoplatky(zapas.id, "h2", 3)).toBe(true);
  const p = [{ druh: "kat_odmena" as const, hracId: "h3", cilHracId: "h4" }];
  expect(await pridejPripominky(zapas.id, p)).toBe(true);
  expect(await pridejPripominky(zapas.id, p)).toBe(false);
  const s = (await getDiploZapas(zapas.id))!.schopnosti!;
  expect(s.filter((x) => x.druh === "doplatek")).toHaveLength(3);
  expect(s.filter((x) => x.druh === "kat_odmena")).toHaveLength(1);
});

// Osobní most přes Streamer.bot (uživatel 5. 10. 2026): klíč si vygeneruje
// kdokoli, data se přijmou jen od GM běžícího zápasu Diplomacie.
it("osobní klíč mostu: cizí klíč 401, ne-GM 403, GM pošle soubor sondy", async () => {
  const { readFile } = await import("node:fs/promises");
  const soubor = (await readFile(new URL("./fixtures/ROB_DIPLO_3.xsdat", import.meta.url))).toString("base64");
  await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const hrac = await klient("h1", false);
  const klicGm = (await post("/api/diplo/most/klic", gm)).json().klic as string;
  const klicHrace = (await post("/api/diplo/most/klic", hrac)).json().klic as string;
  const posli = (klic: string) => app.inject({ method: "POST", url: "/api/diplo/hra-soubor", headers: { authorization: `Bearer ${klic}` }, payload: { jmeno: "ROB_DIPLO_3.xsdat", soubor } });
  expect((await posli("spatny")).statusCode).toBe(401);
  expect((await posli(klicHrace)).statusCode).toBe(403);
  const ok = await posli(klicGm);
  expect(ok.statusCode).toBe(200);
  expect(ok.json()).toMatchObject({ ok: true, zdroj: "gm" });
  expect((await app.inject({ method: "GET", url: "/api/diplo/most/klic", cookies: { sid: gm } })).json().klic.naposledy).not.toBeNull();
  // Nový klíč starý zneplatní, zrušený neplatí vůbec.
  const novy = (await post("/api/diplo/most/klic", gm)).json().klic as string;
  expect((await posli(klicGm)).statusCode).toBe(401);
  expect((await app.inject({ method: "DELETE", url: "/api/diplo/most/klic", cookies: { sid: gm } })).statusCode).toBe(200);
  expect((await posli(novy)).statusCode).toBe(401);
});

it("verze scénáře zápasu: vybírá admin v přípravě, přepíše i nastavení lobby zápasu", async () => {
  await upsertPlayer("autor", false);
  const prvni = await ulozVerziScenare({ ...VERZE, sha256: "s1" });
  const druha = await ulozVerziScenare({ ...VERZE, sha256: "s2" });
  const bezRozboru = await ulozVerziScenare({ ...VERZE, sha256: "s3", rozbor: null, chybaRozboru: "x" });
  const { akce, zapas } = await zapasOsmi("diplomacie");
  // Zápas bez vlastního nastavení vychází z nastavení akce.
  await setNastaveniLobby(akce.id, { rezim: 99, populace: 200 });
  const u = `/api/diplo/zapas/${zapas.id}/scenar`;
  const admin = await klient(ROB, true);
  expect((await post(u, await klient("h7", false), { scenarId: prvni.id })).statusCode).toBe(403);
  expect((await post(u, admin, { scenarId: 999999 })).statusCode).toBe(404);
  expect((await post(u, admin, { scenarId: bezRozboru.id })).statusCode).toBe(409);

  const vyber = await post(u, admin, { scenarId: prvni.id });
  expect(vyber.statusCode).toBe(200);
  const jmeno = (await getVerze(prvni.id))!.jmenoHry;
  expect(vyber.json().nastaveni.scenar).toBe(jmeno);
  expect((await getDiploZapas(zapas.id))?.scenarId).toBe(prvni.id);
  const z = await getZapas(zapas.id);
  expect(z?.zapas.nastaveni).toMatchObject({ scenar: jmeno, rezim: 99, populace: 200 });
  expect(z?.zapas.nastaveni["scenarStarsi"]).toContain((await getVerze(druha.id))!.jmenoHry);

  // Po rozdání rolí už verze stojí.
  await getPool().query("UPDATE diplo_zapas SET stav = 'losovano' WHERE zapas_id = $1", [zapas.id]);
  expect((await post(u, admin, { scenarId: druha.id })).statusCode).toBe(409);
  expect((await getDiploZapas(zapas.id))?.scenarId).toBe(prvni.id);
});

// Uživatel 5. 10. 2026: GM upravuje konfiguraci zápasu jako admin; když
// v sestavě dá šedou jinému, po uložení práva ztratí a má je nový GM.
it("GM upravuje zápas; předáním šedé práva přejdou na nového GM", async () => {
  const { zapas, sestava } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  const hrac = await klient("h1", false);
  const put = (sid: string, co: string, payload: object) => app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/${co}`, cookies: { sid }, payload });
  expect((await put(hrac, "nastaveni", { populace: 150 })).statusCode).toBe(403);
  expect((await put(gm, "nastaveni", { populace: 150 })).statusCode).toBe(200);
  expect((await put(gm, "nazev-lobby", { nazevLobby: "GM lobby" })).statusCode).toBe(200);
  const predano = sestava.map((s) => (s.hracId === "h1" ? { ...s, hracId: "h7" } : s.hracId === "h7" ? { ...s, hracId: "h1" } : s));
  expect((await put(gm, "sestava", { sestava: predano })).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.gmHracId).toBe("h1");
  expect((await put(gm, "nastaveni", { populace: 200 })).statusCode).toBe(403);
  expect((await put(hrac, "nastaveni", { populace: 200 })).statusCode).toBe(200);
});
