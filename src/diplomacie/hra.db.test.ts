import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createZapas } from "../db/matches.js";
import { upsertPlayer } from "../db/players.js";
import { closePool, getPool } from "../db/pool.js";
import { buildServer } from "../http/server.js";
import { getDiploZapas, ulozVerziScenare } from "./db.js";
import { zapomenHry } from "./hraPamet.js";
import { ROB, VERZE, klient, zapasOsmi } from "./testPomocnici.js";

// Routa se registruje jen s tokenem v prostředí — musí být nastavený dřív,
// než se server postaví. Hodnota je zkušební, s ostrým tokenem nemá nic společného.
const TOKEN = "zkusebni-token-jen-pro-testy";
vi.stubEnv("MOST_TOKEN", TOKEN);
const app = buildServer();

beforeEach(async () => {
  zapomenHry();
  await getPool().query("TRUNCATE player, akce, diplo_scenar CASCADE");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await app.close();
  await closePool();
});

/** Počitadlo zabití slotu jako u LLC: proměnné 15–21 pro sloty 1–6 a 8. */
const pocitadlo = (slot: number) => (slot === 8 ? 21 : 14 + slot);

/**
 * Tělo od mostu: cíl mají všichni hráči kromě slotů `bezCile`; GM (h7, šedá)
 * sedí v lobby první, takže slot 7 je ve hře hráč 1 a slot 1 hráč 7.
 */
function telo(bezCile: number[], hodnoty: Record<number, number> = {}, gm = "h7") {
  const promenne = new Array<number>(256).fill(0);
  for (const slot of [1, 2, 3, 4, 5, 6, 8]) if (!bezCile.includes(slot)) promenne[200 + slot] = pocitadlo(slot);
  for (const [promenna, hodnota] of Object.entries(hodnoty)) promenne[Number(promenna)] = hodnota;
  return {
    v: 1,
    gm,
    scenar: "LLC.aoe2scenario",
    cas: 95,
    sloty: [7, 2, 3, 4, 5, 6, 1, 8],
    hraci: [1, 2, 3, 4, 5, 6, 7, 8].map((cislo) => ({ cislo, jmeno: `ve hře ${cislo}`, barva: "<BLUE>", relikvie: cislo === 7 ? 2 : 0, zije: cislo !== 3 })),
    diplomacie: Array.from({ length: 8 }, () => new Array<number>(8).fill(3)),
    promenne,
  };
}

const posli = (payload: object, token: string | null = TOKEN) => app.inject({ method: "POST", url: "/api/diplo/hra", headers: token === null ? {} : { authorization: `Bearer ${token}` }, payload });
const post = (url: string, sid: string, payload?: object) => app.inject({ method: "POST", url, cookies: { sid }, ...(payload ? { payload } : {}) });
/** Diplomacie zápasu tak, jak ji server pošle tomuhle divákovi (po redakci). */
const pohled = async (sid?: string) => (await app.inject({ method: "GET", url: "/api/akce", cookies: sid ? { sid } : {} })).json().rezim.data.zapasy[0];

it("bez tokenu a se špatným tokenem 401 — dřív, než se čte tělo", async () => {
  await zapasOsmi("diplomacie");
  for (const token of [null, "", "spatny", `${TOKEN}x`]) {
    const res = await posli(telo([4]), token);
    expect(res.statusCode).toBe(401);
    expect(res.json().chyba).toBe("Chybí nebo nesedí token mostu.");
  }
  // Ani jiné schéma než Bearer neprojde.
  expect((await app.inject({ method: "POST", url: "/api/diplo/hra", headers: { authorization: `Basic ${TOKEN}` }, payload: telo([4]) })).statusCode).toBe(401);
});

it("žádný běžící zápas tohohle GM je 404 s českou větou; nesmyslné tělo 400", async () => {
  const bezZapasu = await posli(telo([4]));
  expect(bezZapasu.statusCode).toBe(404);
  expect(bezZapasu.json().chyba).toBe("Pro GM h7 teď na webu neběží žádný zápas Diplomacie.");

  await zapasOsmi("diplomacie");
  // Hráč zápasu, který nesedí na šedé, GM není.
  expect((await posli(telo([4], {}, "h1"))).statusCode).toBe(404);
  expect((await posli({ ...telo([4]), v: 2 })).statusCode).toBe(400);
  expect((await posli({ ...telo([4]), promenne: [1, 2, 3] })).json().chyba).toBe("Data ze hry: promenne má mít 256 položek.");
});

it("v přípravě nastaví Nástupce sám — jediného hráče bez cíle", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  // Cíle se teprve rozdávají: dva hráči bez cíle jsou nejednoznační, nic se nenastaví.
  expect((await posli(telo([4, 6]))).json()).toEqual({ ok: true, zapasId: zapas.id, nastupce: null });
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();

  const res = await posli(telo([4]));
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true, zapasId: zapas.id, nastupce: "h4" });
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "priprava", nastupceHracId: "h4" });
});

it("ruční volbu GM hra nepřepíše, dokud neurčí někoho jiného", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await posli(telo([4]));
  expect((await post(`/api/diplo/zapas/${zapas.id}/nastupce`, gm, { hracId: "h2" })).statusCode).toBe(200);

  // Hra dál hlásí h4 — GM ho přepsal, zůstává h2.
  expect((await posli(telo([4]))).json().nastupce).toBe("h4");
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h2");

  // Hra určí někoho jiného (nová hra, jiné rozdání) — to už platí.
  await posli(telo([5]));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h5");
});

it("po rozdání rolí hra na Nástupce nesahá; po Zpět ho nastaví znovu", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await posli(telo([4]));
  expect((await post(`/api/diplo/zapas/${zapas.id}/los`, gm)).statusCode).toBe(200);

  await posli(telo([5]));
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "losovano", nastupceHracId: "h4" });
  expect((await post(`/api/diplo/zapas/${zapas.id}/rozeslat`, gm)).statusCode).toBe(200);
  await posli(telo([5]));
  const rozeslano = (await getDiploZapas(zapas.id))!;
  expect(rozeslano).toMatchObject({ stav: "rozeslano", nastupceHracId: "h4" });
  expect(rozeslano.role.find((r) => r.role === "nastupce")?.hracId).toBe("h4");

  // Zpět na výběr Nástupce ho vynuluje; hra pořád hlásí téhož — nastaví se zase.
  expect((await post(`/api/diplo/zapas/${zapas.id}/zpet`, gm, { potvrzeno: true })).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
  await posli(telo([5]));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h5");
});

it("data ze hry dostane jen GM — hráč, admin-ne-GM ani nepřihlášený je ve stavu nemají", async () => {
  await zapasOsmi("diplomacie");
  expect((await posli(telo([4]))).statusCode).toBe(200);

  const hra = (await pohled(await klient("h7", false))).hra;
  expect(hra).toMatchObject({ cas: 95, rozdano: true, nastupceHracId: "h4" });
  expect(Date.parse(hra.prijato)).not.toBeNaN();
  expect(hra.hraci.map((h: { hracId: string }) => h.hracId).sort()).toEqual(["h1", "h2", "h3", "h4", "h5", "h6", "h8"]);

  for (const sid of [await klient(ROB, true), await klient("h1", false), await klient("h4", false), undefined]) {
    const z = await pohled(sid);
    expect("hra" in z).toBe(false);
    // V přípravě nikdo jiný neví ani to, koho hra určila.
    expect(z.nastupceHracId).toBeNull();
  }
});

it("postup cílů bere text a limit z verze scénáře, kterou zápas hraje; relikvie a žije přes sloty", async () => {
  await klient("autor", false);
  const cile = [
    { promenna: 16, slot: 2, text: "zabito : {} /650 jednotek", limit: 650 },
    { promenna: 15, slot: 1, text: "zabito : {} /650 jednotek", limit: 650 },
  ];
  await ulozVerziScenare({ ...VERZE, sonda: { cile, oznaceno: 2, chyba: null }, dataSonda: Buffer.from("y") });
  await zapasOsmi("diplomacie");

  const res = await posli(telo([4], { 16: 120 }));
  // Scénář sedí a verze má výpis cílů — bez varování.
  expect(res.json()).not.toHaveProperty("varovani");
  const hra = (await pohled(await klient("h7", false))).hra;
  const hrac = (id: string) => hra.hraci.find((h: { hracId: string }) => h.hracId === id);
  expect(hrac("h2")).toEqual({ hracId: "h2", cil: { text: "zabito : {} /650 jednotek", limit: 650, hodnota: 120 }, relikvie: 0, zije: true });
  // Slot 1 je ve hře hráč 7 (dvě relikvie), slot 3 hráč 3 (vyřazen); slot 4 cíl nemá.
  expect(hrac("h1")).toMatchObject({ relikvie: 2, zije: true });
  expect(hrac("h3")).toMatchObject({ zije: false, cil: { text: null, limit: null, hodnota: 0 } });
  expect(hrac("h4")).toMatchObject({ cil: null });

  // Jiný scénář ve hře, než hraje zápas: data se vezmou, most dostane varování.
  const jiny = await posli({ ...telo([4]), scenar: "Jiny.aoe2scenario" });
  expect(jiny.statusCode).toBe(200);
  expect(jiny.json().varovani).toBe("Hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „LLC.aoe2scenario“.");
});

it("verze bez sondy: Nástupce se pozná stejně, most se dozví, že postup cílů chybí", async () => {
  await klient("autor", false);
  await ulozVerziScenare(VERZE);
  const { zapas } = await zapasOsmi("diplomacie");
  const res = await posli(telo([4]));
  expect(res.json()).toEqual({ ok: true, zapasId: zapas.id, nastupce: "h4", varovani: "Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže." });
});

it("z víc běžících zápasů téhož GM vezme nejnověji založený; dohraný a zrušený se nepočítá", async () => {
  const { akce, sestava, zapas: prvni } = await zapasOsmi("diplomacie");
  const druhy = await createZapas(akce.id, sestava);
  expect((await posli(telo([4]))).json().zapasId).toBe(druhy.id);
  expect((await getDiploZapas(prvni.id))!.nastupceHracId).toBeNull();

  await getPool().query("UPDATE zapas SET stav = 'zruseny' WHERE id = $1", [druhy.id]);
  expect((await posli(telo([4]))).json().zapasId).toBe(prvni.id);
  await getPool().query("UPDATE zapas SET stav = 'dohrano' WHERE id = $1", [prvni.id]);
  expect((await posli(telo([4]))).statusCode).toBe(404);
});

it("GM z Microsoft účtu: most posílá XUID bez předpony xbox:", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  await upsertPlayer("xbox:2533274800000001", false);
  await getPool().query("UPDATE ucastnik SET hrac_id = 'xbox:2533274800000001' WHERE zapas_id = $1 AND barva = 7", [zapas.id]);
  expect((await posli(telo([4], {}, "2533274800000001"))).json()).toMatchObject({ zapasId: zapas.id, nastupce: "h4" });
});
