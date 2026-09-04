import { describe, expect, it } from "vitest";
import { formatElo, formatHodiny, formatOdehrano } from "./format.js";

describe("formatHodiny", () => {
  it("ukáže hodiny s jednotkou", () => {
    expect(formatHodiny(1230)).toBe("1230 h");
  });

  it("skrytý profil se pozná od nuly", () => {
    expect(formatHodiny(null)).toBe("nezveřejněno");
    expect(formatHodiny(0)).toBe("0 h");
  });
});

describe("formatElo", () => {
  it("ukáže číslo", () => {
    expect(formatElo(1847)).toBe("1847");
  });

  it("hráč bez žebříčku má pomlčku, ne nulu", () => {
    expect(formatElo(null)).toBe("—");
  });
});

describe("formatOdehrano", () => {
  it("skloňuje česky", () => {
    expect(formatOdehrano(1)).toBe("1 hra");
    expect(formatOdehrano(3)).toBe("3 hry");
    expect(formatOdehrano(512)).toBe("512 her");
    expect(formatOdehrano(0)).toBe("0 her");
  });

  it("neznámý počet má pomlčku", () => {
    expect(formatOdehrano(null)).toBe("—");
  });
});
