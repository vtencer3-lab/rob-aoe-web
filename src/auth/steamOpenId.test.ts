import { describe, expect, it, vi } from "vitest";
import {
  buildAuthUrl,
  buildVerificationBody,
  extractSteamId,
  isVerified,
  verifyWithSteam,
} from "./steamOpenId.js";

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

  it("odmítne zdvojený claimed_id (protašované cizí ID)", () => {
    const params = new URLSearchParams();
    params.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000001");
    params.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000002");
    expect(extractSteamId(params)).toBeNull();
  });
});

describe("buildVerificationBody", () => {
  it("zopakuje parametry a přepne režim na ověření", () => {
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    const body = buildVerificationBody(params);
    expect(body.get("openid.mode")).toBe("check_authentication");
    expect(body.get("openid.sig")).toBe("xyz");
  });

  it("nemutuje vstupní parametry volajícího", () => {
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    buildVerificationBody(params);
    expect(params.get("openid.mode")).toBe("id_res");
  });

  it("zachová i neuvedená podepsaná pole", () => {
    const params = new URLSearchParams({
      "openid.mode": "id_res",
      "openid.sig": "xyz",
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.signed": "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
      "openid.op_endpoint": "https://steamcommunity.com/openid/login",
    });
    const body = buildVerificationBody(params);
    expect(body.get("openid.ns")).toBe("http://specs.openid.net/auth/2.0");
    expect(body.get("openid.signed")).toBe(
      "signed,op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    );
    expect(body.get("openid.op_endpoint")).toBe("https://steamcommunity.com/openid/login");
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

  it("odmítne vloženou (podvrženou) kladnou řádku vedle skutečné záporné odpovědi", () => {
    expect(
      isVerified("ns:…\ninvalidate_handle:X\nis_valid:true\nis_valid:false\n"),
    ).toBe(false);
  });

  it("nepřipustí, aby \\s v regexu překlenulo konec řádku", () => {
    expect(isVerified("is_valid\n:\ntrue\nis_valid:false\n")).toBe(false);
  });
});

describe("verifyWithSteam", () => {
  function stubFetch(response: { ok: boolean; status?: number; text?: () => Promise<string> }) {
    return vi.fn(async () => ({
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      text: response.text ?? (async () => ""),
    })) as unknown as typeof fetch;
  }

  it("kladná textová odpověď vede k true", async () => {
    const fetchImpl = stubFetch({ ok: true, text: async () => "ns:…\nis_valid:true\n" });
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    expect(await verifyWithSteam(params, fetchImpl)).toBe(true);
  });

  it("chybová HTTP odpověď vede k false a text() se nevolá", async () => {
    const text = vi.fn(async () => "ns:…\nis_valid:true\n");
    const fetchImpl = stubFetch({ ok: false, status: 500, text });
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    expect(await verifyWithSteam(params, fetchImpl)).toBe(false);
    expect(text).not.toHaveBeenCalled();
  });

  it("odeslané tělo nese check_authentication a zachová openid.sig", async () => {
    const fetchImpl = stubFetch({ ok: true, text: async () => "is_valid:true\n" });
    const params = new URLSearchParams({ "openid.mode": "id_res", "openid.sig": "xyz" });
    await verifyWithSteam(params, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { body: string },
    ];
    const sentBody = new URLSearchParams(call[1].body);
    expect(sentBody.get("openid.mode")).toBe("check_authentication");
    expect(sentBody.get("openid.sig")).toBe("xyz");
  });

  it("zdvojený openid.* parametr vede k false bez volání fetch", async () => {
    const fetchImpl = stubFetch({ ok: true, text: async () => "is_valid:true\n" });
    const params = new URLSearchParams();
    params.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000001");
    params.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000002");
    params.append("openid.sig", "xyz");

    expect(await verifyWithSteam(params, fetchImpl)).toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
