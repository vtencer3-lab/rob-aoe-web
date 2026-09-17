import { describe, expect, it } from "vitest";
import {
  buildAuthUrlMicrosoft,
  buildTokenBody,
  navratovaUrlMicrosoft,
  vytvorPkce,
} from "./microsoftOAuth.js";

describe("navratovaUrlMicrosoft", () => {
  it("visí pod základní cestou webu a nezdvojí lomítko", () => {
    expect(navratovaUrlMicrosoft("https://jouki.cz/aoe/dev/")).toBe(
      "https://jouki.cz/aoe/dev/api/auth/microsoft/return",
    );
  });
});

describe("vytvorPkce", () => {
  it("challenge je base64url SHA-256 verifieru, bez výplně", () => {
    const { verifier, challenge } = vytvorPkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toContain("=");
    expect(challenge).not.toContain("+");
    expect(challenge).not.toContain("/");
  });

  it("pokaždé jiný", () => {
    expect(vytvorPkce().verifier).not.toBe(vytvorPkce().verifier);
  });
});

describe("buildAuthUrlMicrosoft", () => {
  const url = new URL(
    buildAuthUrlMicrosoft("https://jouki.cz/aoe", "klient-1", "stav-1", "vyzva-1"),
  );

  it("míří na spotřebitelský tenant", () => {
    expect(url.origin + url.pathname).toBe(
      "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
    );
  });

  it("žádá jen XboxLive.signin — nic víc web nepotřebuje", () => {
    expect(url.searchParams.get("scope")).toBe("XboxLive.signin");
  });

  it("posílá PKCE i state", () => {
    expect(url.searchParams.get("code_challenge")).toBe("vyzva-1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("stav-1");
  });

  it("návratová adresa je táž, kterou pak ověřuje výměna tokenu", () => {
    expect(url.searchParams.get("redirect_uri")).toBe(
      navratovaUrlMicrosoft("https://jouki.cz/aoe"),
    );
  });
});

describe("buildTokenBody", () => {
  it("obsahuje code_verifier a stejnou návratovou adresu", () => {
    const body = buildTokenBody(
      "https://jouki.cz/aoe",
      "klient-1",
      "tajemstvi",
      "kod-1",
      "overovatel-1",
    );
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("kod-1");
    expect(body.get("code_verifier")).toBe("overovatel-1");
    expect(body.get("redirect_uri")).toBe(navratovaUrlMicrosoft("https://jouki.cz/aoe"));
  });
});
