import { describe, expect, it } from "vitest";
import { buildAuthUrl, buildVerificationBody, extractSteamId, isVerified } from "./steamOpenId.js";

describe("buildAuthUrl", () => {
  const url = new URL(buildAuthUrl("https://hry.example.com"));

  it("míří na Steam", () => {
    expect(url.origin + url.pathname).toBe("https://steamcommunity.com/openid/login");
  });

  it("nese návratovou adresu odvozenou od základní URL", () => {
    expect(url.searchParams.get("openid.return_to")).toBe(
      "https://hry.example.com/api/auth/steam/return",
    );
    expect(url.searchParams.get("openid.realm")).toBe("https://hry.example.com");
  });

  it("žádá o identifikátor podle specifikace", () => {
    expect(url.searchParams.get("openid.mode")).toBe("checkid_setup");
    expect(url.searchParams.get("openid.identity")).toBe(
      "http://specs.openid.net/auth/2.0/identifier_select",
    );
  });

  it("nezdvojí lomítko, když základní URL končí lomítkem", () => {
    const s = new URL(buildAuthUrl("https://hry.example.com/"));
    expect(s.searchParams.get("openid.return_to")).toBe(
      "https://hry.example.com/api/auth/steam/return",
    );
  });
});

describe("extractSteamId", () => {
  it("vytáhne Steam ID z claimed_id", () => {
    const params = new URLSearchParams({
      "openid.claimed_id": "https://steamcommunity.com/openid/id/76561198000635167",
    });
    expect(extractSteamId(params)).toBe("76561198000635167");
  });

  it("odmítne cizí doménu", () => {
    const params = new URLSearchParams({
      "openid.claimed_id": "https://zlouni.example.com/openid/id/76561198000635167",
    });
    expect(extractSteamId(params)).toBeNull();
  });

  it("odmítne nečíselné ID a chybějící parametr", () => {
    expect(
      extractSteamId(new URLSearchParams({ "openid.claimed_id": "https://steamcommunity.com/openid/id/abc" })),
    ).toBeNull();
    expect(extractSteamId(new URLSearchParams())).toBeNull();
  });
});

describe("buildVerificationBody", () => {
  it("zopakuje parametry a přepne režim na ověření", () => {
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    const body = buildVerificationBody(params);
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.sig")).toBe("xyz");
  });
});

describe("isVerified", () => {
  it("pozná kladnou odpověď", () => {
    expect(isVerified("ns:http://specs.openid.net/auth/2.0\nis_valid:true\n")).toBe(true);
  });

  it("pozná zápornou odpověď", () => {
    expect(isVerified("ns:http://specs.openid.net/auth/2.0\nis_valid:false\n")).toBe(false);
    expect(isVerified("")).toBe(false);
  });
});
