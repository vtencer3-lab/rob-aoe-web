import { describe, expect, it } from "vitest";
import { dalsiVerze, napis, rozeber, verzePoMergi } from "./verze.js";

describe("rozeber", () => {
  it("pozná obyčejnou i pokusnou verzi", () => {
    expect(rozeber("0.16.3")).toEqual({ zaklad: [0, 16, 3], pokus: null });
    expect(rozeber("0.16.3-17.9")).toEqual({ zaklad: [0, 16, 3], pokus: [17, 9] });
    expect(napis(rozeber("0.16.3-17.9"))).toBe("0.16.3-17.9");
  });

  it("odmítne nesmysl", () => {
    expect(() => rozeber("0.16")).toThrow();
    expect(() => rozeber("0.16.3-17")).toThrow();
  });
});

describe("dalsiVerze mimo pokusnou větev", () => {
  it("zvedá čísla jako dřív", () => {
    expect(dalsiVerze("0.16.3", "patch")).toBe("0.16.4");
    expect(dalsiVerze("0.16.3", "minor")).toBe("0.17.0");
    expect(dalsiVerze("0.16.3", "major")).toBe("1.0.0");
    expect(dalsiVerze("0.16.3", "1.2.3")).toBe("1.2.3");
  });
});

// Pokusná verze je zdvojení: před pomlčkou zůstane verze devu, ze které se
// vyšlo, za pomlčkou se hýbe vlastní dvojčíslí pokusu.
describe("dalsiVerze na pokusné větvi", () => {
  it("zakládá pokus zdvojením verze devu", () => {
    expect(dalsiVerze("0.16.3", "experiment")).toBe("0.16.3-16.3");
    expect(dalsiVerze("0.19.0", "experiment")).toBe("0.19.0-19.0");
  });

  it("hýbe jen dvojčíslím za pomlčkou", () => {
    expect(dalsiVerze("0.16.3-16.3", "patch")).toBe("0.16.3-16.4");
    expect(dalsiVerze("0.16.3-16.28", "patch")).toBe("0.16.3-16.29");
    expect(dalsiVerze("0.16.3-16.28", "minor")).toBe("0.16.3-17.0");
  });

  it("první číslo nemění, to smí jen release z devu", () => {
    expect(() => dalsiVerze("0.16.3-16.28", "major")).toThrow(/první číslo/);
  });

  it("základem pokusu je vždycky verze devu, ne jiný pokus", () => {
    expect(() => dalsiVerze("0.16.3-16.28", "experiment")).toThrow(/základ/);
  });
});

// Po mergi do devu rozhoduje jediná otázka: zvedl pokus svoje první číslo
// proti základu, ze kterého vyšel? Počítá se přitom z aktuální verze devu,
// protože ten mohl mezitím ujet dopředu.
describe("verzePoMergi", () => {
  it("pokus bez velké změny přičte devu poslední číslo", () => {
    expect(verzePoMergi("0.16.3", "0.16.3-16.28")).toBe("0.16.4");
    expect(verzePoMergi("0.18.1", "0.16.3-16.28")).toBe("0.18.2");
  });

  it("pokus s velkou změnou zvedne devu prostřední číslo", () => {
    expect(verzePoMergi("0.16.3", "0.16.3-17.9")).toBe("0.17.0");
    expect(verzePoMergi("0.18.1", "0.16.3-17.9")).toBe("0.19.0");
  });

  it("odmítne verzi, která pokusná není", () => {
    expect(() => verzePoMergi("0.16.3", "0.16.4")).toThrow(/není pokusná/);
    expect(() => verzePoMergi("0.16.3-16.4", "0.16.3-17.0")).toThrow(/pokusná/);
  });
});
