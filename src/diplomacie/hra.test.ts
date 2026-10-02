import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiploZapas, StavDiplo } from "../shared/diplomacie/typy.js";
import type { SnimekHry, SondaScenare } from "../shared/diplomacie/hra.js";
import type { Barva } from "../shared/types.js";

// Databáze a rozesílání stavu jsou podvržené: zkouší se rozhodování nad
// snímkem (kdy server Nástupce nastaví, kdy ho odvolá a kdy ne) a zámky
// routy. Podvrh databáze drží tytéž podmínky jako skutečné příkazy v db.ts
// (stav `priprava`, poslední odpověď hry); proti skutečné databázi totéž
// zkouší hra.db.test.ts.
const db = vi.hoisted(() => ({
  zapasId: 12 as number | null,
  stav: "priprava" as StavDiplo,
  nastupce: null as string | null,
  /** Sloupec `diplo_zapas.nastupce_ze_hry` — přežívá restart serveru. */
  zeHry: null as string | null,
  verze: null as { jmenoSouboru: string; sonda: SondaScenare | null } | null,
  zapisy: [] as string[],
  broadcastAkce: vi.fn(async () => {}),
}));

vi.mock("./db.js", () => ({
  najdiBeziciZapasGm: async (ids: string[]) => (ids.includes("h7") ? db.zapasId : null),
  getDiploZapas: async (zapasId: number): Promise<DiploZapas> => ({ zapasId, gmHracId: "h7", stav: db.stav, nastupceHracId: db.nastupce, scenarId: db.verze ? 3 : null, role: [] }),
  getSonduVerze: async () => db.verze,
  nastavNastupceZeHry: async (_zapasId: number, hracId: string) => {
    if (db.stav !== "priprava" || (db.zeHry === hracId && db.nastupce !== null)) return false;
    db.zapisy.push(`nastav ${hracId}`);
    db.nastupce = hracId;
    db.zeHry = hracId;
    return true;
  },
  odvolejNastupceZeHry: async () => {
    if (db.stav !== "priprava" || db.zeHry === null || db.nastupce !== db.zeHry) return false;
    db.zapisy.push("odvolej");
    db.nastupce = null;
    db.zeHry = null;
    return true;
  },
}));
vi.mock("../db/matches.js", () => ({
  getZapas: async () => ({ zapas: {}, ucastnici: ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva })) }),
}));
vi.mock("../realtime/akceStav.js", () => ({ broadcastAkce: db.broadcastAkce }));

const { prijmiSnimek } = await import("./hra.js");
const { hraZapasu, pametHer, ponechHry, zapomenHry } = await import("./hraPamet.js");

/** Snímek v herním čase `cas`, kde cíl mají všichni hráči kromě slotů `bezCile`. */
function snimek(bezCile: number[], cas: number, scenar = "LLC.aoe2scenario"): SnimekHry {
  const promenne = new Array<number>(256).fill(0);
  for (const slot of [1, 2, 3, 4, 5, 6, 8]) if (!bezCile.includes(slot)) promenne[200 + slot] = 14 + slot;
  return { gm: "h7", scenar, cas, sloty: [1, 2, 3, 4, 5, 6, 7, 8], hraci: [], diplomacie: [], promenne };
}
const T0 = Date.parse("2026-10-02T20:00:00.000Z");
/** Skutečný čas přijetí: herní čas běží stejně, jen od T0. */
const v = (sekund: number) => new Date(T0 + sekund * 1000);
const posli = (bezCile: number[], cas: number, scenar?: string) => prijmiSnimek(snimek(bezCile, cas, scenar), v(cas));
/** Hra jmenuje téhož hráče ve dvou snímcích 4 herní sekundy po sobě — tím je odpověď potvrzená. */
const potvrd = async (bezCile: number[], cas: number) => {
  await posli(bezCile, cas);
  return posli(bezCile, cas + 4);
};

beforeEach(() => {
  zapomenHry();
  Object.assign(db, { zapasId: 12, stav: "priprava", nastupce: null, zeHry: null, verze: null, zapisy: [] });
  vi.clearAllMocks();
});

describe("automatický Nástupce", () => {
  it("odpovědi hry věří až napodruhé: stejný hráč ve dvou snímcích aspoň 4 herní sekundy po sobě", async () => {
    expect(await posli([4, 6], 100)).toEqual({ zapasId: 12, nastupce: null });
    expect(await posli([4], 102)).toEqual({ zapasId: 12, nastupce: null });
    // O dvě sekundy později je to pořád málo.
    expect(await posli([4], 104)).toEqual({ zapasId: 12, nastupce: null });
    expect(db.zapisy).toEqual([]);
    expect(await posli([4], 106)).toEqual({ zapasId: 12, nastupce: "h4" });
    expect(db.zapisy).toEqual(["nastav h4"]);
    expect(db.nastupce).toBe("h4");
    expect(hraZapasu(12)).toMatchObject({ nastupceHracId: "h4", prijato: v(106).toISOString() });
  });

  // Cíle se rozdávají postupně: šest ze sedmi vypadá jako Nástupce, i když
  // sedmý hráč svůj cíl dostane o pár sekund později.
  it("šest cílů ze sedmi a hned nato sedm: žádný Nástupce se nenastaví", async () => {
    await posli([4, 6], 100);
    await posli([4], 102);
    expect(await posli([], 104)).toEqual({ zapasId: 12, nastupce: null });
    await posli([], 110);
    expect(db.zapisy).toEqual([]);
    expect(db.nastupce).toBeNull();
  });

  it("když sedmý cíl přijde až po potvrzení, hra svou odpověď vezme zpět a Nástupce se vynuluje", async () => {
    await potvrd([4], 100);
    expect(db.nastupce).toBe("h4");
    expect(await posli([], 108)).toEqual({ zapasId: 12, nastupce: null });
    expect(db.zapisy).toEqual(["nastav h4", "odvolej"]);
    expect(db).toMatchObject({ nastupce: null, zeHry: null });
    expect(hraZapasu(12)).toMatchObject({ nastupceHracId: null });
  });

  it("odvolání nesahá na ruční volbu GM; nejednoznačná odpověď se bere stejně jako žádná", async () => {
    await potvrd([4], 100);
    db.nastupce = "h2"; // GM klikl na jinou dlaždici
    await posli([4, 6], 108);
    expect(db).toMatchObject({ nastupce: "h2", zeHry: "h4" });
    expect(db.zapisy).toEqual(["nastav h4"]);
  });

  it("jméno se během čekání změní: počítá se znovu od nového hráče", async () => {
    await posli([4], 100);
    await posli([5], 104);
    expect(db.zapisy).toEqual([]);
    await posli([5], 108);
    expect(db.zapisy).toEqual(["nastav h5"]);
  });

  it("ruční volbu GM nepřepíše, dokud neurčí někoho jiného", async () => {
    await potvrd([4], 100);
    db.nastupce = "h2";
    await posli([4], 106);
    await posli([4], 120);
    expect(db.nastupce).toBe("h2");
    await potvrd([5], 130);
    expect(db.nastupce).toBe("h5");
    expect(db.zapisy).toEqual(["nastav h4", "nastav h5"]);
  });

  // Dřív držela poslední odpověď hry jen paměť procesu a první snímek po
  // restartu serveru volbu GM přepsal.
  it("restart serveru ruční volbu GM nepřepíše — poslední odpověď hry drží databáze", async () => {
    await potvrd([4], 100);
    db.nastupce = "h2";
    zapomenHry(); // restart: paměť snímků je pryč, sloupec nastupce_ze_hry zůstal
    await potvrd([4], 200);
    await posli([4], 220);
    expect(db).toMatchObject({ nastupce: "h2", zeHry: "h4" });
    expect(db.zapisy).toEqual(["nastav h4"]);
    // Po restartu se odpověď potvrzuje znovu dvěma snímky.
    expect(hraZapasu(12)).toMatchObject({ nastupceHracId: "h4" });
  });

  it("zápas bez Nástupce (po Zpět) ho dostane znovu, i když hra hlásí téhož", async () => {
    await potvrd([4], 100);
    db.nastupce = null;
    await posli([4], 106);
    expect(db.nastupce).toBe("h4");
    expect(db.zapisy).toEqual(["nastav h4", "nastav h4"]);
  });

  it("po rozdání a rozeslání rolí na Nástupce nesahá, data pro pult ale drží", async () => {
    for (const stav of ["losovano", "rozeslano"] as const) {
      zapomenHry();
      Object.assign(db, { stav, nastupce: "h2", zeHry: "h2" });
      expect(await potvrd([4], 100)).toMatchObject({ nastupce: "h4" });
      // Ani odvolání: hra odpověď vzala zpět, role už jsou ale rozdané.
      await posli([], 110);
      expect(db.nastupce).toBe("h2");
    }
    expect(db.zapisy).toEqual([]);
  });

  // Starý soubor sondy nebo jiná hra téhož GM: data se ukážou, Nástupce ne.
  it("když hra hlásí jiný scénář, než zápas hraje, Nástupce nenastaví ani neodvolá", async () => {
    db.verze = { jmenoSouboru: "LLC.aoe2scenario", sonda: { cile: [], oznaceno: 42, chyba: null } };
    await posli([4], 100, "Jiny.aoe2scenario");
    const res = await posli([4], 104, "Jiny.aoe2scenario");
    expect(res).toEqual({ zapasId: 12, nastupce: "h4", varovani: "Hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „LLC.aoe2scenario“ — Nástupce se podle ní nenastavuje." });
    expect(db.zapisy).toEqual([]);
    expect(db.nastupce).toBeNull();
    // Pult data dostane i s varováním.
    expect(hraZapasu(12)).toMatchObject({ nastupceHracId: "h4", varovani: res!.varovani });

    // A už nastaveného Nástupce cizí data neodvolají.
    Object.assign(db, { nastupce: "h4", zeHry: "h4" });
    await posli([], 110, "Jiny.aoe2scenario");
    expect(db.nastupce).toBe("h4");
    // Správný scénář (i jinou velikostí písmen) projde bez varování.
    expect(await posli([4], 120, "llc.aoe2scenario")).not.toHaveProperty("varovani");
  });
});

describe("pořadí snímků a paměť", () => {
  it("snímek se starším herním časem se zahodí; pokles o víc než 30 s je nová hra", async () => {
    await potvrd([4], 100);
    // Přeházené doručení: starší snímek nic nezmění, most dostane poslední stav.
    expect(await posli([4, 6], 99)).toEqual({ zapasId: 12, nastupce: "h4" });
    expect(hraZapasu(12)).toMatchObject({ cas: 104, nastupceHracId: "h4" });
    expect(db.zapisy).toEqual(["nastav h4"]);

    // Nová hra v témže zápase: čas spadl na začátek, cíle ještě nejsou.
    expect(await posli([1, 2, 3, 4, 5, 6, 8], 3)).toEqual({ zapasId: 12, nastupce: null });
    expect(hraZapasu(12)).toMatchObject({ cas: 3, rozdano: false });
    // Dřívější Nástupce byl z minulé hry — nová ho teprve určí.
    expect(db.zapisy).toEqual(["nastav h4", "odvolej"]);
    await posli([5], 20);
    expect(db.nastupce).toBeNull();
    await posli([5], 24);
    expect(db.nastupce).toBe("h5");
  });

  it("průběžné snímky rozesílá nejvýš jednou za 5 s, změnu Nástupce hned", async () => {
    await posli([4], 100);
    await posli([4], 102);
    expect(db.broadcastAkce).toHaveBeenCalledTimes(1);
    // Potvrzení a zápis Nástupce se rozešle hned, i když od posledního
    // rozeslání uběhly jen 4 s.
    await posli([4], 104);
    expect(db.zapisy).toEqual(["nastav h4"]);
    expect(db.broadcastAkce).toHaveBeenCalledTimes(2);
    await posli([4], 106);
    await posli([4], 108);
    expect(db.broadcastAkce).toHaveBeenCalledTimes(2);
    // Paměť nese vždy poslední snímek, i ten nerozeslaný.
    expect(hraZapasu(12)).toMatchObject({ cas: 108 });
    await posli([4], 109);
    expect(db.broadcastAkce).toHaveBeenCalledTimes(3);
  });

  it("žádný běžící zápas GM = null (routa z toho udělá 404) a nic se neukládá", async () => {
    db.zapasId = null;
    expect(await posli([4], 100)).toBeNull();
    expect(await prijmiSnimek({ ...snimek([4], 100), gm: "cizi" }, v(100))).toBeNull();
    expect(db.broadcastAkce).not.toHaveBeenCalled();
    expect(hraZapasu(12)).toBeUndefined();
  });

  it("snímky zápasů, které už neběží, se zahazují", async () => {
    await posli([4], 100);
    db.zapasId = 13;
    await posli([4], 100);
    expect([...pametHer.keys()]).toEqual([12, 13]);
    ponechHry([13]);
    expect([...pametHer.keys()]).toEqual([13]);
    ponechHry([]);
    expect(pametHer.size).toBe(0);
  });

  it("verze bez výpisu cílů: Nástupce se nastaví, most i pult se dozví, že postup cílů chybí", async () => {
    db.verze = { jmenoSouboru: "LLC.aoe2scenario", sonda: null };
    const res = await potvrd([4], 100);
    expect(res).toEqual({ zapasId: 12, nastupce: "h4", varovani: "Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže." });
    expect(db.nastupce).toBe("h4");
  });
});

describe("routa POST /api/diplo/hra", () => {
  const TOKEN = "zkusebni-token-jen-pro-testy";
  const telo = (cas = 100) => ({ v: 1, ...snimek([4], cas), hraci: [], diplomacie: Array.from({ length: 8 }, () => new Array<number>(8).fill(3)) });

  afterEach(() => vi.unstubAllEnvs());

  async function server() {
    const { default: Fastify } = await import("fastify");
    const { registerHraRoutes } = await import("./hra.js");
    const { HttpError } = await import("../http/guards.js");
    const app = Fastify();
    // Stejný překlad chyb jako ve skutečném serveru: HttpError → { chyba }.
    app.setErrorHandler((err, _req, reply) => {
      const e = err as { statusCode?: number; message: string };
      return reply.status(err instanceof HttpError ? err.statusCode : (e.statusCode ?? 500)).send({ chyba: e.message });
    });
    registerHraRoutes(app);
    return app;
  }
  const posliNa = (app: Awaited<ReturnType<typeof server>>, payload: object, authorization?: string) =>
    app.inject({ method: "POST", url: "/api/diplo/hra", headers: authorization ? { authorization } : {}, payload });

  it("bez MOST_TOKEN v prostředí routa neexistuje", async () => {
    vi.stubEnv("MOST_TOKEN", "");
    const app = await server();
    expect((await posliNa(app, telo(), `Bearer ${TOKEN}`)).statusCode).toBe(404);
    expect((await posliNa(app, telo(), "Bearer ")).statusCode).toBe(404);
  });

  it("bez tokenu, se špatným tokenem a s jiným schématem 401", async () => {
    vi.stubEnv("MOST_TOKEN", TOKEN);
    const app = await server();
    for (const hlavicka of [undefined, "Bearer spatny", `Bearer ${TOKEN}x`, `Basic ${TOKEN}`, TOKEN]) {
      const res = await posliNa(app, telo(), hlavicka);
      expect(res.statusCode).toBe(401);
      expect(res.json().chyba).toBe("Chybí nebo nesedí token mostu.");
    }
    expect(db.broadcastAkce).not.toHaveBeenCalled();
  });

  it("se správným tokenem přijme snímek, nesmyslné tělo 400, cizí GM 404, balast nad 64 kB 413", async () => {
    vi.stubEnv("MOST_TOKEN", TOKEN);
    const app = await server();
    const prvni = await posliNa(app, telo(100), `Bearer ${TOKEN}`);
    expect(prvni.statusCode).toBe(200);
    expect(prvni.json()).toEqual({ ok: true, zapasId: 12, nastupce: null });
    expect((await posliNa(app, telo(104), `Bearer ${TOKEN}`)).json()).toEqual({ ok: true, zapasId: 12, nastupce: "h4" });

    const spatne = await posliNa(app, { ...telo(), promenne: [1] }, `Bearer ${TOKEN}`);
    expect(spatne.statusCode).toBe(400);
    expect(spatne.json().chyba).toBe("Data ze hry: promenne má mít 256 položek.");

    const cizi = await posliNa(app, { ...telo(), gm: "76561198000000099" }, `Bearer ${TOKEN}`);
    expect(cizi.statusCode).toBe(404);
    expect(cizi.json().chyba).toBe("Pro GM 76561198000000099 teď na webu neběží žádný zápas Diplomacie.");

    expect((await posliNa(app, { ...telo(), balast: "x".repeat(70_000) }, `Bearer ${TOKEN}`)).statusCode).toBe(413);
  });
});
