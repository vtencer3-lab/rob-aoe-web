import { VERZE } from "../shared/verze.js";
import { describe, expect, it } from "vitest";
import { buildServer } from "./server.js";

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
