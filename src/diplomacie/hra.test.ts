import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DiploZapas, ScenarVerze, StavDiplo } from "../shared/diplomacie/typy.js";
import type { SnimekHry } from "../shared/diplomacie/hra.js";
import type { Barva } from "../shared/types.js";

// Databáze a rozesílání stavu jsou podvržené: zkouší se rozhodování nad
// snímkem (kdy server Nástupce nastaví a kdy ne) a zámky routy. Totéž proti
// skutečné databázi má hra.db.test.ts.
const db = vi.hoisted(() => ({
  zapasId: 12 as number | null,
  stav: "priprava" as StavDiplo,
  nastupce: null as string | null,
  verze: null as ScenarVerze | null,
  setNastupce: vi.fn(),
  broadcastAkce: vi.fn(async () => {}),
}));

vi.mock("./db.js", () => ({
  najdiBeziciZapasGm: async (ids: string[]) => (ids.includes("h7") ? db.zapasId : null),
  getDiploZapas: async (zapasId: number): Promise<DiploZapas> => ({ zapasId, gmHracId: "h7", stav: db.stav, nastupceHracId: db.nastupce, scenarId: db.verze ? db.verze.id : null, role: [] }),
  getVerze: async () => db.verze,
  setNastupce: async (zapasId: number, hracId: string) => {
    db.setNastupce(zapasId, hracId);
    db.nastupce = hracId;
  },
}));
vi.mock("../db/matches.js", () => ({
  getZapas: async () => ({ zapas: {}, ucastnici: ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva })) }),
}));
vi.mock("../realtime/akceStav.js", () => ({ broadcastAkce: db.broadcastAkce }));

const { prijmiSnimek } = await import("./hra.js");
const { hraZapasu, zapomenHry } = await import("./hraPamet.js");

/** Snímek, kde cíl mají všichni hráči kromě slotů `bezCile`. */
function snimek(bezCile: number[], scenar = "LLC.aoe2scenario"): SnimekHry {
  const promenne = new Array<number>(256).fill(0);
  for (const slot of [1, 2, 3, 4, 5, 6, 8]) if (!bezCile.includes(slot)) promenne[200 + slot] = 14 + slot;
  return { gm: "h7", scenar, cas: 95, sloty: [1, 2, 3, 4, 5, 6, 7, 8], hraci: [], diplomacie: [], promenne };
}
const T0 = Date.parse("2026-10-02T20:00:00.000Z");
const v = (sekund: number) => new Date(T0 + sekund * 1000);

beforeEach(() => {
  zapomenHry();
  Object.assign(db, { zapasId: 12, stav: "priprava", nastupce: null, verze: null });
  vi.clearAllMocks();
});

describe("automatický Nástupce", () => {
  it("v přípravě ho nastaví, jakmile ho hra určí, a stav hned rozešle", async () => {
    expect(await prijmiSnimek(snimek([4, 6]), v(0))).toEqual({ zapasId: 12, nastupce: null });
    expect(db.setNastupce).not.toHaveBeenCalled();
    expect(await prijmiSnimek(snimek([4]), v(2))).toEqual({ zapasId: 12, nastupce: "h4" });
    expect(db.setNastupce).toHaveBeenCalledWith(12, "h4");
    // První snímek a změna Nástupce — obojí se rozesílá bez čekání.
    expect(db.broadcastAkce).toHaveBeenCalledTimes(2);
    expect(hraZapasu(12)).toMatchObject({ nastupceHracId: "h4", prijato: v(2).toISOString() });
  });

  it("ruční volbu GM nepřepíše, dokud neurčí někoho jiného", async () => {
    await prijmiSnimek(snimek([4]), v(0));
    db.nastupce = "h2"; // GM klikl na jinou dlaždici
    await prijmiSnimek(snimek([4]), v(2));
    expect(db.nastupce).toBe("h2");
    await prijmiSnimek(snimek([5]), v(4));
    expect(db.nastupce).toBe("h5");
    expect(db.setNastupce.mock.calls).toEqual([
      [12, "h4"],
      [12, "h5"],
    ]);
  });

  it("zápas bez Nástupce (po Zpět) ho dostane znovu, i když hra hlásí téhož", async () => {
    await prijmiSnimek(snimek([4]), v(0));
    db.nastupce = null;
    await prijmiSnimek(snimek([4]), v(2));
    expect(db.nastupce).toBe("h4");
    expect(db.setNastupce).toHaveBeenCalledTimes(2);
  });

  it("po rozdání a rozeslání rolí na Nástupce nesahá, data pro pult ale drží", async () => {
    for (const stav of ["losovano", "rozeslano"] as const) {
      Object.assign(db, { stav, nastupce: "h2" });
      expect(await prijmiSnimek(snimek([4]), v(0))).toMatchObject({ nastupce: "h4" });
      expect(db.nastupce).toBe("h2");
    }
    expect(db.setNastupce).not.toHaveBeenCalled();
    expect(hraZapasu(12)).toMatchObject({ nastupceHracId: "h4" });
  });

  it("týž Nástupce, kterého GM vybral sám, se podruhé nezapisuje", async () => {
    db.nastupce = "h4";
    await prijmiSnimek(snimek([4]), v(0));
    expect(db.setNastupce).not.toHaveBeenCalled();
  });
});

describe("rozesílání stavu a odpověď mostu", () => {
  it("průběžné snímky rozesílá nejvýš jednou za 5 s", async () => {
    await prijmiSnimek(snimek([4, 6]), v(0));
    await prijmiSnimek(snimek([4, 6]), v(2));
    await prijmiSnimek(snimek([4, 6]), v(4));
    expect(db.broadcastAkce).toHaveBeenCalledTimes(1);
    await prijmiSnimek(snimek([4, 6]), v(6));
    expect(db.broadcastAkce).toHaveBeenCalledTimes(2);
    // Paměť nese vždy poslední snímek, i ten nerozeslaný.
    await prijmiSnimek({ ...snimek([4, 6]), cas: 200 }, v(7));
    expect(db.broadcastAkce).toHaveBeenCalledTimes(2);
    expect(hraZapasu(12)).toMatchObject({ cas: 200 });
  });

  it("žádný běžící zápas GM = null (routa z toho udělá 404) a nic se neukládá", async () => {
    db.zapasId = null;
    expect(await prijmiSnimek(snimek([4]), v(0))).toBeNull();
    expect(await prijmiSnimek({ ...snimek([4]), gm: "cizi" }, v(0))).toBeNull();
    expect(db.broadcastAkce).not.toHaveBeenCalled();
    expect(hraZapasu(12)).toBeUndefined();
  });

  it("varuje, když hra hlásí jiný scénář nebo verze nemá výpis cílů", async () => {
    const verze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", sonda: { cile: [], oznaceno: 42, chyba: null } } as unknown as ScenarVerze;
    db.verze = verze;
    expect(await prijmiSnimek(snimek([4]), v(0))).toEqual({ zapasId: 12, nastupce: "h4" });
    // Jméno souboru sondy nese jméno scénáře bez přípony a hra ho může psát jinou velikostí písmen.
    expect(await prijmiSnimek(snimek([4], "llc.aoe2scenario"), v(1))).not.toHaveProperty("varovani");
    expect((await prijmiSnimek(snimek([4], "Jiny.aoe2scenario"), v(2)))!.varovani).toBe("Hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „LLC.aoe2scenario“.");
    db.verze = { ...verze, sonda: null };
    expect((await prijmiSnimek(snimek([4]), v(3)))!.varovani).toBe("Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže.");
  });
});

describe("routa POST /api/diplo/hra", () => {
  const TOKEN = "zkusebni-token-jen-pro-testy";
  const telo = () => ({ v: 1, ...snimek([4]), hraci: [], diplomacie: Array.from({ length: 8 }, () => new Array<number>(8).fill(3)) });

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
  const posli = (app: Awaited<ReturnType<typeof server>>, payload: object, authorization?: string) =>
    app.inject({ method: "POST", url: "/api/diplo/hra", headers: authorization ? { authorization } : {}, payload });

  it("bez MOST_TOKEN v prostředí routa neexistuje", async () => {
    vi.stubEnv("MOST_TOKEN", "");
    const app = await server();
    expect((await posli(app, telo(), `Bearer ${TOKEN}`)).statusCode).toBe(404);
    expect((await posli(app, telo(), "Bearer ")).statusCode).toBe(404);
  });

  it("bez tokenu, se špatným tokenem a s jiným schématem 401", async () => {
    vi.stubEnv("MOST_TOKEN", TOKEN);
    const app = await server();
    for (const hlavicka of [undefined, "Bearer spatny", `Bearer ${TOKEN}x`, `Basic ${TOKEN}`, TOKEN]) {
      const res = await posli(app, telo(), hlavicka);
      expect(res.statusCode).toBe(401);
      expect(res.json().chyba).toBe("Chybí nebo nesedí token mostu.");
    }
    expect(db.broadcastAkce).not.toHaveBeenCalled();
  });

  it("se správným tokenem přijme snímek, nesmyslné tělo 400, cizí GM 404, balast nad 64 kB 413", async () => {
    vi.stubEnv("MOST_TOKEN", TOKEN);
    const app = await server();
    const ok = await posli(app, telo(), `Bearer ${TOKEN}`);
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true, zapasId: 12, nastupce: "h4" });

    const spatne = await posli(app, { ...telo(), promenne: [1] }, `Bearer ${TOKEN}`);
    expect(spatne.statusCode).toBe(400);
    expect(spatne.json().chyba).toBe("Data ze hry: promenne má mít 256 položek.");

    const cizi = await posli(app, { ...telo(), gm: "76561198000000099" }, `Bearer ${TOKEN}`);
    expect(cizi.statusCode).toBe(404);
    expect(cizi.json().chyba).toBe("Pro GM 76561198000000099 teď na webu neběží žádný zápas Diplomacie.");

    expect((await posli(app, { ...telo(), balast: "x".repeat(70_000) }, `Bearer ${TOKEN}`)).statusCode).toBe(413);
  });
});
