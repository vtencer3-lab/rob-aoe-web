import { describe, expect, it, vi } from "vitest";
import { navratovaUrlMicrosoft } from "../auth/microsoftOAuth.js";
import { vymenKodZaToken } from "./microsoftToken.js";

const PARAMETRY = {
  baseUrl: "https://jouki.cz/aoe",
  clientId: "klient-1",
  clientSecret: "tajemstvi-ktere-nesmi-ven",
  kod: "kod-1",
  verifier: "overovatel-1",
};

/** Odpověď fetch v tom rozsahu, který modul používá: `ok`, `status`, `json()`. */
function odpoved(status: number, telo: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => telo,
  } as unknown as Response;
}

/** Odpověď, která není JSON — `json()` vyhodí, přesně jako u skutečného fetch. */
function neniJson(status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON at position 0");
    },
  } as unknown as Response;
}

describe("vymenKodZaToken", () => {
  it("pošle POST na spotřebitelský token endpoint s formulářovým tělem", async () => {
    const fetchImpl = vi.fn(async () => odpoved(200, { access_token: "ms-token" }));
    await vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(String(url)).toBe("https://login.microsoftonline.com/consumers/oauth2/v2.0/token");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/x-www-form-urlencoded",
    );
  });

  it("v těle je code_verifier, tajemství i táž návratová adresa jako v odchozím kroku", async () => {
    // Bez code_verifier Microsoft výměnu odmítne a hráč se nikdy nepřihlásí —
    // a bez shodné redirect_uri taky. Obojí bylo dřív jen v inline funkci ve
    // `vychoziDeps()`, kterou testy podstrkovaly celou, takže se nikdy neověřilo.
    const fetchImpl = vi.fn(async () => odpoved(200, { access_token: "ms-token" }));
    await vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const telo = new URLSearchParams(String(init.body));
    expect(telo.get("grant_type")).toBe("authorization_code");
    expect(telo.get("code")).toBe("kod-1");
    expect(telo.get("code_verifier")).toBe("overovatel-1");
    expect(telo.get("client_id")).toBe("klient-1");
    expect(telo.get("client_secret")).toBe("tajemstvi-ktere-nesmi-ven");
    expect(telo.get("redirect_uri")).toBe(navratovaUrlMicrosoft("https://jouki.cz/aoe"));
  });

  it("vrátí access_token z úspěšné odpovědi", async () => {
    const fetchImpl = vi.fn(async () => odpoved(200, { access_token: "ms-token", scope: "XboxLive.signin" }));
    await expect(vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch)).resolves.toBe(
      "ms-token",
    );
  });

  it("neúspěšnou odpověď odmítne, i když v ní token je", async () => {
    // Microsoft u chyby posílá `error` a `error_description`; kdyby se někdy
    // trefil i klíč access_token, stav 400 pořád znamená, že token neplatí.
    const fetchImpl = vi.fn(async () =>
      odpoved(400, { error: "invalid_grant", access_token: "nesmysl" }),
    );
    await expect(
      vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("Microsoft nevydal přihlašovací token.");
  });

  it("odpověď bez access_token odmítne", async () => {
    const fetchImpl = vi.fn(async () => odpoved(200, { token_type: "Bearer" }));
    await expect(
      vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("Microsoft nevydal přihlašovací token.");
  });

  it("odpověď, která není JSON, shodí výměnu česky, ne výjimkou parseru", async () => {
    // Proxy nebo rozvadeč mezi námi a Microsoftem umí vrátit HTML stránku se
    // stavem 200. Bez odchycení by hráč místo hlášky dostal SyntaxError.
    const fetchImpl = vi.fn(async () => neniJson(200));
    await expect(
      vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow("Microsoft nevydal přihlašovací token.");
  });

  it("client_secret se nedostane do textu vyhozené chyby", async () => {
    // Hláška z téhle cesty jde hráči do prohlížeče (microsoftRoutes.ts ji
    // posílá v těle 401), takže tajemství v ní by bylo prozrazené tajemství.
    const fetchImpl = vi.fn(async () => odpoved(401, { error_description: "AADSTS7000215" }));
    await expect(
      vymenKodZaToken(PARAMETRY, fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(
      expect.objectContaining({
        message: expect.not.stringContaining(PARAMETRY.clientSecret) as unknown as string,
      }),
    );
  });
});
