import { describe, expect, it } from "vitest";
import { CIVILIZACE, CIVILIZACE_CHRONICLES, patriDoSady } from "./civilizace.js";

describe("patriDoSady", () => {
  it("Age of Empires II (1) chronicleské civilizace nepustí", () => {
    expect(patriDoSady(1, 1)).toBe(true); // Britons
    expect(patriDoSady(47, 1)).toBe(false); // Athenians
    expect(patriDoSady(56, 1)).toBe(false); // Puru
  });

  it("Chronicles (2) pustí jenom je", () => {
    expect(patriDoSady(47, 2)).toBe(true);
    expect(patriDoSady(1, 2)).toBe(false);
  });

  it("All (0) i „je to jedno“ (null) pustí všechno", () => {
    for (const sada of [0, null]) {
      expect(patriDoSady(1, sada)).toBe(true);
      expect(patriDoSady(47, sada)).toBe(true);
    }
  });

  // Three Kingdoms přišly s vlastním DLC, ale v herních datech mají era "base",
  // takže patří do Age of Empires II — přesně tohle se dá snadno splést.
  it("Shu, Wu, Wei, Jurchens a Khitans patří do Age of Empires II", () => {
    for (const civ of [49, 50, 51, 52, 53]) expect(patriDoSady(civ, 1)).toBe(true);
  });

  it("každá chroniclesská civilizace je známá civilizace", () => {
    for (const civ of CIVILIZACE_CHRONICLES) expect(CIVILIZACE[civ]).toBeDefined();
  });
});
