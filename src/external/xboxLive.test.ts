import { describe, expect, it, vi } from "vitest";
import {
  nactiGamerpic,
  nactiVlastnictvi,
  parseGamerpic,
  parseHerniHistorii,
  parseXstsChybu,
  parseXstsIdentitu,
  ziskejXboxIdentitu,
} from "./xboxLive.js";
import type { XboxIdentita } from "./xboxLive.js";

/** Odpověď fetch, jak ji potřebuje `postJson`/`fetchImpl` — jen `ok`, `status` a `json()`. */
function odpoved(status: number, telo: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => telo } as unknown as Response;
}

describe("parseXstsIdentitu", () => {
  it("vytáhne XUID, gamertag a uhs", () => {
    expect(
      parseXstsIdentitu({
        Token: "xsts-token",
        DisplayClaims: { xui: [{ uhs: "123456", xid: "2535412345678901", gtg: "Jouki in Rage" }] },
      }),
    ).toEqual({ xuid: "2535412345678901", gamertag: "Jouki in Rage", uhs: "123456" });
  });

  it("chybějící claim je null, ne prázdný řetězec", () => {
    expect(parseXstsIdentitu({ DisplayClaims: { xui: [{ uhs: "1" }] } })).toBeNull();
  });

  it("nespadne na odpovědi, která není objekt", () => {
    expect(parseXstsIdentitu("ne")).toBeNull();
    expect(parseXstsIdentitu({ DisplayClaims: { xui: "ne" } })).toBeNull();
  });
});

describe("parseXstsChybu", () => {
  it("účet bez Xbox profilu dostane návod, ne kód", () => {
    expect(parseXstsChybu({ XErr: 2148916233 })).toContain("nemá Xbox profil");
  });

  it("dětský účet taky", () => {
    expect(parseXstsChybu({ XErr: 2148916238 })).toContain("rodiny");
  });

  it("neznámý kód se přeloží obecně, ale nezamlčí se", () => {
    expect(parseXstsChybu({ XErr: 1 })).toContain("1");
  });

  it("odpověď bez XErr chybou není", () => {
    expect(parseXstsChybu({ Token: "t" })).toBeNull();
  });
});

describe("parseGamerpic", () => {
  it("vytáhne adresu obrázku ze settings", () => {
    expect(
      parseGamerpic({
        profileUsers: [
          { settings: [{ id: "GameDisplayPicRaw", value: "https://images-eds.xboxlive.com/x" }] },
        ],
      }),
    ).toBe("https://images-eds.xboxlive.com/x");
  });

  it("chybějící nastavení je null", () => {
    expect(parseGamerpic({ profileUsers: [{ settings: [] }] })).toBeNull();
  });
});

describe("parseHerniHistorii", () => {
  it("hra v historii znamená, že ji hráč má, a nese datum posledního spuštění", () => {
    // Hodnota naměřená sondou 16. 9. 2026 na živém účtu.
    expect(
      parseHerniHistorii({
        titles: [
          {
            titleId: "2064168993",
            name: "Age of Empires II: Definitive Edition",
            titleHistory: { lastTimePlayed: "2026-09-14T23:05:11.6856768Z" },
          },
        ],
      }),
    ).toEqual({ stav: "ma", hranoV: new Date("2026-09-14T23:05:11.6856768Z") });
  });

  it("hra bez titleHistory má stav ma, ale datum null — nesmí spadnout", () => {
    expect(
      parseHerniHistorii({ titles: [{ titleId: "2064168993", name: "AoE2 DE" }] }),
    ).toEqual({ stav: "ma", hranoV: null });
  });

  it("historie bez té hry znamená, že ji nemá, a datum je null", () => {
    expect(parseHerniHistorii({ titles: [{ titleId: "1", name: "Forza Horizon 5" }] })).toEqual({
      stav: "nema",
      hranoV: null,
    });
  });

  it("jiná hra ze série se za ni nevydává", () => {
    // Sonda 16. 9. 2026 našla v téže historii i Age of Empires Online.
    // Porovnávání podle jména by na ni sedlo.
    expect(
      parseHerniHistorii({ titles: [{ titleId: "1297289123", name: "Age of Empires Online" }] }),
    ).toEqual({ stav: "nema", hranoV: null });
  });

  it("skryté soukromí není totéž co chybějící hra", () => {
    // Xbox na skrytou historii odpoví bez pole titles. Kdyby se to sloučilo
    // s „nema“, ukázal by web vykřičník člověku, který hru má.
    expect(parseHerniHistorii({})).toEqual({ stav: "soukromy", hranoV: null });
  });

  it("nesmyslné datum se nepoužije, ale hru to nesebere", () => {
    expect(
      parseHerniHistorii({
        titles: [{ titleId: "2064168993", titleHistory: { lastTimePlayed: "neplatne-datum" } }],
      }),
    ).toEqual({ stav: "ma", hranoV: null });
  });
});

describe("ziskejXboxIdentitu", () => {
  it("posílá RpsTicket s prefixem d= a správné RelyingParty u obou kroků", async () => {
    const volani: Array<{ url: string; telo: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const telo = JSON.parse(String(init?.body)) as Record<string, unknown>;
      volani.push({ url: String(url), telo });
      if (String(url).includes("user.auth.xboxlive.com")) {
        return odpoved(200, { Token: "xbl-token", DisplayClaims: { xui: [{ uhs: "docasny-uhs" }] } });
      }
      return odpoved(200, {
        Token: "xsts-token",
        DisplayClaims: { xui: [{ uhs: "spravny-uhs", xid: "2533274952064423", gtg: "Jouki3645" }] },
      });
    });

    await ziskejXboxIdentitu("puvodni-access-token", fetchImpl as unknown as typeof fetch);

    expect(volani).toHaveLength(2);
    const xbl = volani[0]!.telo as { Properties: { RpsTicket: string }; RelyingParty: string };
    expect(xbl.Properties.RpsTicket).toBe("d=puvodni-access-token");
    expect(xbl.RelyingParty).toBe("http://auth.xboxlive.com");
    const xsts = volani[1]!.telo as { RelyingParty: string };
    expect(xsts.RelyingParty).toBe("http://xboxlive.com");
  });

  it("identitu čte z odpovědi XSTS, ne XBL", async () => {
    // XBL ve skutečnosti vrací v xui[0] jen uhs (ověřeno sondou 16. 9. 2026), ale
    // fixtura tu úmyslně podstrčí i gtg/xid se ŠPATNÝMI hodnotami, aby test
    // chytil i budoucí záměnu kroků, ne jen dnešní tvar odpovědi.
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("user.auth.xboxlive.com")) {
        return odpoved(200, {
          Token: "xbl-token",
          DisplayClaims: { xui: [{ uhs: "spatny-uhs", xid: "999", gtg: "SPATNY_GAMERTAG" }] },
        });
      }
      return odpoved(200, {
        Token: "xsts-token",
        DisplayClaims: { xui: [{ uhs: "spravny-uhs", xid: "2533274952064423", gtg: "Jouki3645" }] },
      });
    });

    const identita = await ziskejXboxIdentitu("access-token", fetchImpl as unknown as typeof fetch);

    expect(identita).toEqual({
      uhs: "spravny-uhs",
      xuid: "2533274952064423",
      gamertag: "Jouki3645",
      token: "xsts-token",
    });
  });

  it("XSTS chyba 2148916233 vyhodí českou hlášku bez tokenu a uhs", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("user.auth.xboxlive.com")) {
        return odpoved(200, { Token: "xbl-token-tajny", DisplayClaims: { xui: [{ uhs: "uhs-tajny" }] } });
      }
      return odpoved(401, { XErr: 2148916233 });
    });

    let chyba: Error | null = null;
    try {
      await ziskejXboxIdentitu("access-token-tajny", fetchImpl as unknown as typeof fetch);
    } catch (e) {
      chyba = e as Error;
    }

    expect(chyba).not.toBeNull();
    expect(chyba?.message).toContain("nemá Xbox profil");
    expect(chyba?.message).not.toContain("access-token-tajny");
    expect(chyba?.message).not.toContain("xbl-token-tajny");
    expect(chyba?.message).not.toContain("uhs-tajny");
  });
});

describe("nactiGamerpic", () => {
  const id: XboxIdentita = {
    xuid: "2533274952064423",
    gamertag: "Jouki3645",
    uhs: "uhs-hodnota",
    token: "xsts-token-hodnota",
  };

  it("posílá hlavičku Authorization ve tvaru XBL3.0 x=<uhs>;<token> a vrátí adresu obrázku", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const hlavicky = init?.headers as Record<string, string>;
      expect(hlavicky["Authorization"]).toBe("XBL3.0 x=uhs-hodnota;xsts-token-hodnota");
      return odpoved(200, {
        profileUsers: [
          {
            settings: [
              {
                id: "GameDisplayPicRaw",
                value: "https://images-eds-ssl.xboxlive.com/image?url=x&format=png",
              },
            ],
          },
        ],
      });
    });

    await expect(nactiGamerpic(id, fetchImpl as unknown as typeof fetch)).resolves.toBe(
      "https://images-eds-ssl.xboxlive.com/image?url=x&format=png",
    );
  });
});

describe("nactiVlastnictvi", () => {
  const id: XboxIdentita = {
    xuid: "2533274952064423",
    gamertag: "Jouki3645",
    uhs: "uhs-hodnota",
    token: "xsts-token-hodnota",
  };

  it("HTTP 403 znamená skryté soukromí", async () => {
    const fetchImpl = vi.fn(async () => odpoved(403, {}));
    await expect(nactiVlastnictvi(id, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      stav: "soukromy",
      hranoV: null,
    });
  });

  it("jiná chyba HTTP je undefined, ne soukromy — nepovedlo se zeptat, DB se nesahá", async () => {
    const fetchImpl = vi.fn(async () => odpoved(500, {}));
    await expect(nactiVlastnictvi(id, fetchImpl as unknown as typeof fetch)).resolves.toBeUndefined();
  });

  it("posílá hlavičku Authorization ve tvaru XBL3.0 x=<uhs>;<token>", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const hlavicky = init?.headers as Record<string, string>;
      expect(hlavicky["Authorization"]).toBe("XBL3.0 x=uhs-hodnota;xsts-token-hodnota");
      return odpoved(200, { titles: [] });
    });

    await expect(nactiVlastnictvi(id, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      stav: "nema",
      hranoV: null,
    });
  });

  it("úspěšná odpověď protáhne i datum posledního spuštění", async () => {
    const fetchImpl = vi.fn(async () =>
      odpoved(200, {
        titles: [
          { titleId: "2064168993", titleHistory: { lastTimePlayed: "2026-09-14T23:05:11.6856768Z" } },
        ],
      }),
    );

    await expect(nactiVlastnictvi(id, fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      stav: "ma",
      hranoV: new Date("2026-09-14T23:05:11.6856768Z"),
    });
  });
});
