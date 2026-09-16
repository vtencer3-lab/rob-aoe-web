import { describe, expect, it } from "vitest";
import {
  parseGamerpic,
  parseHerniHistorii,
  parseXstsChybu,
  parseXstsIdentitu,
} from "./xboxLive.js";

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
  it("hra v historii znamená, že ji hráč má", () => {
    expect(
      parseHerniHistorii({
        titles: [{ titleId: "2064168993", name: "Age of Empires II: Definitive Edition" }],
      }),
    ).toBe("ma");
  });

  it("historie bez té hry znamená, že ji nemá", () => {
    expect(parseHerniHistorii({ titles: [{ titleId: "1", name: "Forza Horizon 5" }] })).toBe("nema");
  });

  it("jiná hra ze série se za ni nevydává", () => {
    // Sonda 16. 9. 2026 našla v téže historii i Age of Empires Online.
    // Porovnávání podle jména by na ni sedlo.
    expect(
      parseHerniHistorii({ titles: [{ titleId: "1297289123", name: "Age of Empires Online" }] }),
    ).toBe("nema");
  });

  it("skryté soukromí není totéž co chybějící hra", () => {
    // Xbox na skrytou historii odpoví bez pole titles. Kdyby se to sloučilo
    // s „nema“, ukázal by web vykřičník člověku, který hru má.
    expect(parseHerniHistorii({})).toBe("soukromy");
  });
});
