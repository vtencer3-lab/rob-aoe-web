import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createZapas } from "../db/matches.js";
import { upsertPlayer } from "../db/players.js";
import { closePool, getPool } from "../db/pool.js";
import { buildServer } from "../http/server.js";
import { losujRole } from "../shared/diplomacie/los.js";
import { getDiploZapas, nastavNastupceZeHry, odvolejNastupceZeHry, ulozRole, ulozVerziScenare } from "./db.js";
import { hraZapasu, zapomenHry } from "./hraPamet.js";
import { ROB, VERZE, klient, zapasOsmi } from "./testPomocnici.js";

// Routa se registruje jen s tokenem v prostředí — musí být nastavený dřív,
// než se server postaví. Hodnota je zkušební, s ostrým tokenem nemá nic společného.
const TOKEN = "zkusebni-token-jen-pro-testy";
vi.stubEnv("MOST_TOKEN", TOKEN);
const app = buildServer();

beforeEach(async () => {
  zapomenHry();
  await getPool().query("TRUNCATE player, akce, diplo_scenar CASCADE");
  // Jméno pro hru je ROB_DIPLO_<pořadí>; od jedničky, ať ho testy znají předem.
  await getPool().query("ALTER SEQUENCE diplo_scenar_poradi_seq RESTART");
});

afterAll(async () => {
  vi.unstubAllEnvs();
  await app.close();
  await closePool();
});

/** Počitadlo zabití slotu jako u LLC: proměnné 15–21 pro sloty 1–6 a 8. */
const pocitadlo = (slot: number) => (slot === 8 ? 21 : 14 + slot);

/**
 * Tělo od mostu v herním čase `cas`: cíl mají všichni hráči kromě slotů
 * `bezCile`; GM (h7, šedá) sedí v lobby první, takže slot 7 je ve hře hráč 1
 * a slot 1 hráč 7.
 */
function telo(bezCile: number[], cas = 100, navic: { hodnoty?: Record<number, number>; odesilatel?: string; scenar?: string } = {}) {
  const promenne = new Array<number>(256).fill(0);
  for (const slot of [1, 2, 3, 4, 5, 6, 8]) if (!bezCile.includes(slot)) promenne[200 + slot] = pocitadlo(slot);
  for (const [promenna, hodnota] of Object.entries(navic.hodnoty ?? {})) promenne[Number(promenna)] = hodnota;
  return {
    v: 1,
    odesilatel: navic.odesilatel ?? "h7",
    scenar: navic.scenar ?? "ROB_DIPLO_1.aoe2scenario",
    cas,
    sloty: [7, 2, 3, 4, 5, 6, 1, 8],
    hraci: [1, 2, 3, 4, 5, 6, 7, 8].map((cislo) => ({ cislo, jmeno: `ve hře ${cislo}`, barva: "<BLUE>", relikvie: cislo === 7 ? 2 : 0, zije: cislo !== 3 })),
    diplomacie: Array.from({ length: 8 }, () => new Array<number>(8).fill(3)),
    promenne,
  };
}

const posli = (payload: object, token: string | null = TOKEN) => app.inject({ method: "POST", url: "/api/diplo/hra", headers: token === null ? {} : { authorization: `Bearer ${token}` }, payload });
/**
 * Odpovědi hry se věří až napodruhé (stejný hráč ve dvou snímcích aspoň
 * 4 herní sekundy po sobě) — tohle pošle oba a vrátí odpověď na druhý.
 */
const potvrd = async (bezCile: number[], cas: number, navic: Parameters<typeof telo>[2] = {}) => {
  await posli(telo(bezCile, cas, navic));
  return posli(telo(bezCile, cas + 4, navic));
};
const post = (url: string, sid: string, payload?: object) => app.inject({ method: "POST", url, cookies: { sid }, ...(payload ? { payload } : {}) });
/** Diplomacie zápasu tak, jak ji server pošle tomuhle divákovi (po redakci). */
const pohled = async (sid?: string) => (await app.inject({ method: "GET", url: "/api/akce", cookies: sid ? { sid } : {} })).json().rezim.data.zapasy[0];
const nastupceZeHry = async (zapasId: number) =>
  (await getPool().query<{ nastupce_ze_hry: string | null }>("SELECT nastupce_ze_hry FROM diplo_zapas WHERE zapas_id = $1", [zapasId])).rows[0]!.nastupce_ze_hry;

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

it("žádný běžící zápas je 404 s českou větou; nesmyslné tělo 400", async () => {
  const bezZapasu = await posli(telo([4]));
  expect(bezZapasu.statusCode).toBe(404);
  expect(bezZapasu.json().chyba).toBe("Na webu teď neběží žádný zápas Diplomacie.");

  await zapasOsmi("diplomacie");
  // Kdo nesedí na šedé, GM není; jako divák se zápas bez otištěného scénáře nepřiřadí.
  const bezScenare = await posli(telo([4], 100, { odesilatel: "h1" }));
  expect(bezScenare.statusCode).toBe(404);
  expect(bezScenare.json().chyba).toBe("h1 není GM běžícího zápasu Diplomacie a zápas nemá scénář — data diváka nejde přiřadit.");
  expect((await posli({ ...telo([4]), v: 2 })).statusCode).toBe(400);
  expect((await posli({ ...telo([4]), promenne: [1, 2, 3] })).json().chyba).toBe("Data ze hry: promenne má mít 256 položek.");
});

it("v přípravě nastaví Nástupce sám — jediného hráče bez cíle, až když to hra řekne podruhé", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  // Cíle se teprve rozdávají: dva hráči bez cíle jsou nejednoznační, nic se nenastaví.
  expect((await posli(telo([4, 6], 100))).json()).toEqual({ ok: true, zapasId: zapas.id, zdroj: "gm", nastupce: null });
  // První snímek s jediným hráčem bez cíle ještě nestačí.
  expect((await posli(telo([4], 102))).json()).toEqual({ ok: true, zapasId: zapas.id, zdroj: "gm", nastupce: null });
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();

  const res = await posli(telo([4], 106));
  expect(res.statusCode).toBe(200);
  expect(res.json()).toEqual({ ok: true, zapasId: zapas.id, zdroj: "gm", nastupce: "h4" });
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "priprava", nastupceHracId: "h4" });
  expect(await nastupceZeHry(zapas.id)).toBe("h4");
});

// Cíle se rozdávají postupně: šest ze sedmi vypadá jako Nástupce, i když
// sedmý hráč svůj cíl dostane o chvíli později.
it("šest cílů ze sedmi a pak sedm: špatný Nástupce nezůstane", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  // Sedmý cíl přišel dřív, než hra svou odpověď zopakovala — nic se nenastavilo.
  await posli(telo([4], 100));
  await posli(telo([], 102));
  await posli(telo([], 110));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();

  // Pomalejší rozdávání: hráč 4 stihl být potvrzen, pak cíl dostal taky.
  await potvrd([4], 120);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h4");
  expect((await posli(telo([], 130))).json().nastupce).toBeNull();
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
  expect(await nastupceZeHry(zapas.id)).toBeNull();
});

it("odvolání odpovědi nesahá na ruční volbu GM", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await potvrd([4], 100);
  expect((await post(`/api/diplo/zapas/${zapas.id}/nastupce`, gm, { hracId: "h2" })).statusCode).toBe(200);
  await posli(telo([], 110));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h2");
});

it("ruční volbu GM hra nepřepíše, dokud neurčí někoho jiného", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await potvrd([4], 100);
  expect((await post(`/api/diplo/zapas/${zapas.id}/nastupce`, gm, { hracId: "h2" })).statusCode).toBe(200);

  // Hra dál hlásí h4 — GM ho přepsal, zůstává h2.
  expect((await posli(telo([4], 110))).json().nastupce).toBe("h4");
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h2");

  // Hra určí někoho jiného (nová hra, jiné rozdání) — to už platí.
  await potvrd([5], 120);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h5");
});

// Poslední odpověď hry je v databázi (migrace 034), ne v paměti procesu:
// první snímky po restartu serveru volbu GM nepřepíšou.
it("restart serveru ruční volbu GM nepřepíše", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await potvrd([4], 100);
  expect((await post(`/api/diplo/zapas/${zapas.id}/nastupce`, gm, { hracId: "h2" })).statusCode).toBe(200);

  zapomenHry(); // restart: paměť snímků je prázdná
  expect((await potvrd([4], 200)).json().nastupce).toBe("h4");
  await posli(telo([4], 215));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h2");
  expect(await nastupceZeHry(zapas.id)).toBe("h4");
});

it("po rozdání rolí hra na Nástupce nesahá; po Zpět ho nastaví znovu", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  const gm = await klient("h7", false);
  await potvrd([4], 100);
  expect((await post(`/api/diplo/zapas/${zapas.id}/los`, gm)).statusCode).toBe(200);

  await potvrd([5], 110);
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "losovano", nastupceHracId: "h4" });
  expect((await post(`/api/diplo/zapas/${zapas.id}/rozeslat`, gm)).statusCode).toBe(200);
  await posli(telo([5], 120));
  // Ani odvolání odpovědi po rozdání rolí nic nemění.
  await posli(telo([], 122));
  const rozeslano = (await getDiploZapas(zapas.id))!;
  expect(rozeslano).toMatchObject({ stav: "rozeslano", nastupceHracId: "h4" });
  expect(rozeslano.role.find((r) => r.role === "nastupce")?.hracId).toBe("h4");

  // Zpět na výběr Nástupce ho vynuluje; hra hlásí h5 — nastaví se.
  expect((await post(`/api/diplo/zapas/${zapas.id}/zpet`, gm, { potvrzeno: true })).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
  await potvrd([5], 130);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h5");

  // A po dalším Zpět znovu téhož: zápas bez Nástupce ho dostane, i když
  // hra říká totéž co posledně.
  expect((await post(`/api/diplo/zapas/${zapas.id}/los`, gm)).statusCode).toBe(200);
  expect((await post(`/api/diplo/zapas/${zapas.id}/zpet`, gm)).statusCode).toBe(200);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
  await posli(telo([5], 140));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h5");
});

// Závod s GM: snímek přečte stav `priprava`, GM mezitím rozdá role a zápis
// Nástupce by mu pod rolemi vyměnil hráče. Oba zápisy jsou proto jeden
// podmíněný příkaz — po losu nezmění nic.
it("zápis Nástupce ze hry je podmíněný stavem: po losu GM se nic nezmění", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  expect(await nastavNastupceZeHry(zapas.id, "h4")).toBe(true);
  // Totéž podruhé nic nemění (a tedy se nic nerozesílá).
  expect(await nastavNastupceZeHry(zapas.id, "h4")).toBe(false);

  await ulozRole(zapas.id, losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h4", () => 0), "losovano");
  expect(await nastavNastupceZeHry(zapas.id, "h5")).toBe(false);
  expect(await odvolejNastupceZeHry(zapas.id)).toBe(false);
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "losovano", nastupceHracId: "h4" });
  expect(await nastupceZeHry(zapas.id)).toBe("h4");
});

it("data ze hry dostane jen GM — hráč, admin-ne-GM ani nepřihlášený je ve stavu nemají", async () => {
  await zapasOsmi("diplomacie");
  expect((await potvrd([4], 100)).statusCode).toBe(200);

  const hra = (await pohled(await klient("h7", false))).hra;
  expect(hra).toMatchObject({ cas: 104, rozdano: true, nastupceHracId: "h4" });
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

  const res = await posli(telo([4], 100, { hodnoty: { 16: 120 } }));
  // Scénář sedí a verze má výpis cílů — bez varování.
  expect(res.json()).not.toHaveProperty("varovani");
  const hra = (await pohled(await klient("h7", false))).hra;
  expect(hra).not.toHaveProperty("varovani");
  const hrac = (id: string) => hra.hraci.find((h: { hracId: string }) => h.hracId === id);
  expect(hrac("h2")).toEqual({ hracId: "h2", cil: { text: "zabito : {} /650 jednotek", limit: 650, hodnota: 120 }, relikvie: 0, zije: true });
  // Slot 1 je ve hře hráč 7 (dvě relikvie), slot 3 hráč 3 (vyřazen); slot 4 cíl nemá.
  expect(hrac("h1")).toMatchObject({ relikvie: 2, zije: true });
  expect(hrac("h3")).toMatchObject({ zije: false, cil: { text: null, limit: null, hodnota: 0 } });
  expect(hrac("h4")).toMatchObject({ cil: null });
});

// Starý soubor sondy nebo jiná hra téhož GM: data se v pultu ukážou
// s varováním, Nástupce se podle nich ale nenastaví.
it("jiný scénář ve hře, než zápas hraje: data s varováním, Nástupce se nenastaví", async () => {
  await klient("autor", false);
  await ulozVerziScenare({ ...VERZE, sonda: { cile: [], oznaceno: 0, chyba: null }, dataSonda: Buffer.from("y") });
  const { zapas } = await zapasOsmi("diplomacie");
  const varovani = "Hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „ROB_DIPLO_1.aoe2scenario“ — Nástupce se podle ní nenastavuje.";

  const jiny = await potvrd([4], 100, { scenar: "Jiny.aoe2scenario" });
  expect(jiny.statusCode).toBe(200);
  expect(jiny.json()).toEqual({ ok: true, zapasId: zapas.id, zdroj: "gm", nastupce: "h4", varovani });
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBeNull();
  expect(await nastupceZeHry(zapas.id)).toBeNull();
  expect((await pohled(await klient("h7", false))).hra).toMatchObject({ nastupceHracId: "h4", varovani });

  // Se správným scénářem se nastaví.
  await potvrd([4], 110);
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h4");
  // A cizí data ho pak ani neodvolají.
  await posli(telo([], 120, { scenar: "Jiny.aoe2scenario" }));
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h4");
});

it("verze bez sondy: Nástupce se pozná stejně, most se dozví, že postup cílů chybí", async () => {
  await klient("autor", false);
  await ulozVerziScenare(VERZE);
  const { zapas } = await zapasOsmi("diplomacie");
  const res = await potvrd([4], 100);
  expect(res.json()).toEqual({ ok: true, zapasId: zapas.id, zdroj: "gm", nastupce: "h4", varovani: "Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže." });
  expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h4");
});

it("z víc běžících zápasů téhož GM vezme nejnověji založený; dohraný a zrušený se nepočítá a jeho snímek se zahodí", async () => {
  const { akce, sestava, zapas: prvni } = await zapasOsmi("diplomacie");
  const druhy = await createZapas(akce.id, sestava);
  expect((await posli(telo([4]))).json().zapasId).toBe(druhy.id);
  expect((await getDiploZapas(prvni.id))!.nastupceHracId).toBeNull();
  expect(hraZapasu(druhy.id)).toBeDefined();

  await getPool().query("UPDATE zapas SET stav = 'zruseny' WHERE id = $1", [druhy.id]);
  expect((await posli(telo([4]))).json().zapasId).toBe(prvni.id);
  // Stav pro prohlížeče se staví znovu — snímek zrušeného zápasu při tom zmizí.
  await pohled(await klient("h7", false));
  expect(hraZapasu(druhy.id)).toBeUndefined();
  expect(hraZapasu(prvni.id)).toBeDefined();

  await getPool().query("UPDATE zapas SET stav = 'dohrano' WHERE id = $1", [prvni.id]);
  expect((await posli(telo([4]))).statusCode).toBe(404);
  await pohled(await klient("h7", false));
  expect(hraZapasu(prvni.id)).toBeUndefined();
});

it("GM z Microsoft účtu: most posílá XUID bez předpony xbox:", async () => {
  const { zapas } = await zapasOsmi("diplomacie");
  await upsertPlayer("xbox:2533274800000001", false);
  await getPool().query("UPDATE ucastnik SET hrac_id = 'xbox:2533274800000001' WHERE zapas_id = $1 AND barva = 7", [zapas.id]);
  expect((await potvrd([4], 100, { odesilatel: "2533274800000001" })).json()).toMatchObject({ zapasId: zapas.id, nastupce: "h4" });
});

// Sonda píše soubor na každém počítači ve hře; Rob může zápas jen sledovat
// jako divák a most pustit u sebe — jeho id GM zápasu není.
describe("snímky od diváka", () => {
  /** Aktivní verze LLC: zápas si ji otiskne a divák se podle jejího jména přiřadí. */
  const sLlc = async () => {
    await klient("autor", false);
    await ulozVerziScenare(VERZE);
  };

  it("jediný běžící zápas se stejným scénářem: snímek diváka se vezme se zdrojem divak", async () => {
    await sLlc();
    const { zapas } = await zapasOsmi("diplomacie");
    const res = await potvrd([4], 100, { odesilatel: "76561198000000099" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, zapasId: zapas.id, zdroj: "divak", nastupce: "h4" });
    // Automatický Nástupce platí pro oba zdroje.
    expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h4");
    expect((await pohled(await klient("h7", false))).hra).toMatchObject({ zdroj: "divak", cas: 104 });

    // Jiný scénář než ten, který zápas hraje: divák se nepřiřadí.
    const jiny = await posli(telo([4], 110, { odesilatel: "76561198000000099", scenar: "Jiny.aoe2scenario" }));
    expect(jiny.statusCode).toBe(404);
    expect(jiny.json().chyba).toBe(
      "76561198000000099 není GM běžícího zápasu Diplomacie a hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „ROB_DIPLO_1.aoe2scenario“ — data diváka nejde přiřadit.",
    );
  });

  it("dva běžící zápasy a odesílatel není GM ani jednoho: 404, GM se pořád najde", async () => {
    await sLlc();
    const { akce, sestava } = await zapasOsmi("diplomacie");
    const druhy = await createZapas(akce.id, sestava);
    const res = await posli(telo([4], 100, { odesilatel: "h1" }));
    expect(res.statusCode).toBe(404);
    expect(res.json().chyba).toBe("h1 není GM žádného běžícího zápasu Diplomacie a zápasů běží víc (2) — data diváka nejde přiřadit. Pusť most na PC GM.");
    expect((await posli(telo([4], 100))).json()).toMatchObject({ zapasId: druhy.id, zdroj: "gm" });
  });

  it("snímek GM vyhrává: divák se do 20 s od posledního snímku GM nepoužije", async () => {
    await sLlc();
    const { zapas } = await zapasOsmi("diplomacie");
    await potvrd([4], 100);
    // Divák je pozadu o zpoždění pro diváky a hlásí jiný stav.
    const divak = await posli(telo([4, 6], 40, { odesilatel: "76561198000000099" }));
    expect(divak.statusCode).toBe(200);
    // Odpověď nese poslední stav od GM (verze VERZE nemá výpis cílů — odtud varování).
    expect(divak.json()).toMatchObject({ ok: true, zapasId: zapas.id, zdroj: "divak", nastupce: "h4", pouzito: false });
    expect((await pohled(await klient("h7", false))).hra).toMatchObject({ zdroj: "gm", cas: 104, nastupceHracId: "h4" });
    expect((await getDiploZapas(zapas.id))!.nastupceHracId).toBe("h4");
  });
});
