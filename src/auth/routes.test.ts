import cookie from "@fastify/cookie";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../config.js";

// Hermetický test (bez DB): db/sessions.js a realtime/pritomnost.js jsou
// podstrčené, takže se dá ověřit propojení bez skutečné databáze — na tu
// mají svoje odhlašovací chování už routes.db.test.ts a pritomnost.test.ts.
vi.mock("../db/sessions.js", () => ({
  createSession: vi.fn(),
  deleteSession: vi.fn(),
  getSessionUser: vi.fn(),
  SESSION_TTL_MS: 1000,
}));
vi.mock("../realtime/pritomnost.js", () => ({ odhlasZAkce: vi.fn() }));

import { deleteSession, getSessionUser } from "../db/sessions.js";
import { odhlasZAkce } from "../realtime/pritomnost.js";
import { registerAuthRoutes } from "./routes.js";

const HRAC = "76561198000000099";
const SID = "sid-testovaci";

function buildApp() {
  const app = Fastify();
  app.register(cookie);
  registerAuthRoutes(app, { overSteam: async () => true, obnovStaty: async () => {} });
  return app;
}

beforeEach(() => {
  vi.mocked(getSessionUser).mockReset();
  vi.mocked(deleteSession).mockReset();
  vi.mocked(odhlasZAkce).mockReset();
});

afterEach(async () => {
  vi.clearAllMocks();
});

describe("POST /api/auth/logout", () => {
  // Přihláška do akce je slib „dnes hraju“ — kdo se vědomě odhlásí z webu,
  // ten slib ruší stejně jako tlačítkem „Odhlásit se z akce“. Obojí musí jít
  // přes tutéž cestu (odhlasZAkce), jinak se odhlašování z akce rozejde do
  // dvou implementací.
  it("odhlásí hráče i z akce, tou samou cestou jako tlačítko v tabulce", async () => {
    const app = buildApp();
    vi.mocked(getSessionUser).mockResolvedValue(HRAC);

    await app.inject({ method: "POST", url: "/api/auth/logout", cookies: { [config.cookieNazev]: SID } });

    expect(odhlasZAkce).toHaveBeenCalledWith(HRAC);
    expect(deleteSession).toHaveBeenCalledWith(SID);
    await app.close();
  });

  // Kdo do akce přihlášený není (nebo žádná neběží), odhlášení z webu tím
  // nesmí spadnout ani nic rozbít — odhlasZAkce sama ošetřuje obojí.
  it("bez cookie se z akce neodhlašuje a nespadne", async () => {
    const app = buildApp();

    const res = await app.inject({ method: "POST", url: "/api/auth/logout" });

    expect(res.statusCode).toBe(200);
    expect(getSessionUser).not.toHaveBeenCalled();
    expect(odhlasZAkce).not.toHaveBeenCalled();
    expect(deleteSession).not.toHaveBeenCalled();
    await app.close();
  });

  // Cookie bez platného sezení (expirovalo, nebo je podvržené) nemá hráče,
  // kterého by šlo z akce odhlásit — jen se smaže (dle sid, i kdyby neexistoval).
  it("s neplatnou cookie se z akce neodhlašuje, sezení se přesto smaže", async () => {
    const app = buildApp();
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const res = await app.inject({ method: "POST", url: "/api/auth/logout", cookies: { [config.cookieNazev]: SID } });

    expect(res.statusCode).toBe(200);
    expect(odhlasZAkce).not.toHaveBeenCalled();
    expect(deleteSession).toHaveBeenCalledWith(SID);
    await app.close();
  });
});
