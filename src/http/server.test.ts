import { VERZE } from "../shared/verze.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildServer } from "./server.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

// Příznak musí být v odpovědi i pro nepřihlášeného — právě ten vidí přihlašovací
// tlačítko a podle příznaku se rozhoduje, jestli má otevřít okno s volbou
// platformy, nebo vést rovnou na Steam. Nepřihlášená větev `/api/me` se do
// databáze nedívá, takže se dá ověřit tady, v hermetické sadě.
describe("/api/me — příznak Microsoft cesty", () => {
  it("bez MS_CLIENT_ID a MS_CLIENT_SECRET hlásí, že Microsoft cesta není", async () => {
    vi.stubEnv("MS_CLIENT_ID", undefined);
    vi.stubEnv("MS_CLIENT_SECRET", undefined);
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.json()).toEqual({ hrac: null, maMicrosoft: false });
    await app.close();
  });

  it("s oběma proměnnými hlásí, že Microsoft cesta je", async () => {
    vi.stubEnv("MS_CLIENT_ID", "test-client-id");
    vi.stubEnv("MS_CLIENT_SECRET", "test-client-secret");
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/me" });
    expect(res.json()).toEqual({ hrac: null, maMicrosoft: true });
    await app.close();
  });
});

describe("server", () => {
  it("odpovídá na /api/health", async () => {
    const app = buildServer();
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, verze: VERZE });
    await app.close();
  });

  // Vadné tělo požadavku je chyba klienta, ne serveru. Než se tohle rozlišilo,
  // vracel se na rozbitý JSON kód 500 s hláškou „Něco se pokazilo na serveru.“
  // — tedy přesně opačná informace, než jaká je pravda.
  it("chybu klienta neschová za 500", async () => {
    const app = buildServer();
    const res = await app.inject({
      method: "POST",
      url: "/api/akce",
      headers: { "content-type": "application/json" },
      payload: "{tohle není JSON",
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().chyba).not.toBe("Něco se pokazilo na serveru.");
    await app.close();
  });
});
