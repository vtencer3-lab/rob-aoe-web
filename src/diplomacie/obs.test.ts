import { afterEach, describe, expect, it, vi } from "vitest";
import type { AkceStavPayload } from "../shared/types.js";

// Stav, jak ho staví server pro SSE — tady podvržený, ať test nesahá na databázi.
let stav: Partial<AkceStavPayload> = {};
vi.mock("../realtime/akceStav.js", () => ({ buildAkceStav: async () => stav }));

const KLIC = "zkusebni-klic-jen-pro-testy";
const zapas = (id: number, poradi: number, stavZapasu: string) => ({ id, poradi, stav: stavZapasu, ucastnici: [] });
const diplo = (zapasId: number) => ({ zapasId, gmHracId: "h7", stav: "rozeslano", nastupceHracId: "h1", scenarId: 3, role: [{ hracId: "h1", role: "nastupce", cilHracId: null }] });

async function server() {
  const { default: Fastify } = await import("fastify");
  const { registerObsRoutes } = await import("./obs.js");
  const { HttpError } = await import("../http/guards.js");
  const app = Fastify();
  app.setErrorHandler((err, _req, reply) => reply.status(err instanceof HttpError ? err.statusCode : 500).send({ chyba: (err as Error).message }));
  registerObsRoutes(app);
  return app;
}
const ziskej = async (klic?: string) => (await server()).inject({ method: "GET", url: `/api/diplo/obs${klic === undefined ? "" : `?klic=${encodeURIComponent(klic)}`}` });

// Overlay do OBS vidí běžící zápas očima GM — i role. Proto klíč z prostředí
// a bez něj routa vůbec neexistuje (uživatel 3. 10. 2026).
describe("routa GET /api/diplo/obs", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("bez OBS_KLIC v prostředí routa neexistuje", async () => {
    vi.stubEnv("OBS_KLIC", "");
    expect((await ziskej(KLIC)).statusCode).toBe(404);
  });

  it("bez klíče a se špatným klíčem 401", async () => {
    vi.stubEnv("OBS_KLIC", KLIC);
    for (const klic of [undefined, "", "spatny", `${KLIC}x`]) {
      const res = await ziskej(klic);
      expect(res.statusCode).toBe(401);
      expect(res.json().chyba).toBe("Chybí nebo nesedí klíč overlaye.");
    }
  });

  it("vrátí nejnovější běžící zápas Diplomacie i s rolemi; jinak nic", async () => {
    vi.stubEnv("OBS_KLIC", KLIC);
    stav = {
      zapasy: [zapas(10, 1, "bezi"), zapas(11, 2, "bezi"), zapas(12, 3, "dohrano")] as never,
      rezim: { id: "diplomacie", data: { aktivni: null, verze: {}, zapasy: [diplo(10), diplo(11), diplo(12)] } } as never,
    };
    const res = (await ziskej(KLIC)).json();
    expect(res.zapas.id).toBe(11);
    expect(res.data.zapasy).toEqual([diplo(11)]);
    stav = { zapasy: [zapas(12, 3, "dohrano")] as never, rezim: { id: "diplomacie", data: { aktivni: null, verze: {}, zapasy: [diplo(12)] } } as never };
    expect((await ziskej(KLIC)).json()).toEqual({ zapas: null, data: null });
    stav = { zapasy: [], rezim: undefined };
    expect((await ziskej(KLIC)).json()).toEqual({ zapas: null, data: null });
  });
});
