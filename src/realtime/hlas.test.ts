import { describe, expect, it } from "vitest";
import { smiSlyset } from "./hlas.js";
import type { HlasUdalost } from "../shared/types.js";

const udalost: HlasUdalost = { zapasId: 1, kdo: "admin", jmeno: "Rob", sezeni: "s1", poradi: 0, konec: false, data: "AAAA", prijemci: ["a", "b"] };

// Hlas admina slyší účastníci zápasu a ostatní admini; anonym, divák mimo
// zápas a mluvčí sám ne.
describe("smiSlyset", () => {
  it("účastník ano, cizí hráč a anonym ne", () => {
    expect(smiSlyset({ hracId: "a", jeAdmin: false }, udalost)).toBe(true);
    expect(smiSlyset({ hracId: "x", jeAdmin: false }, udalost)).toBe(false);
    expect(smiSlyset({ hracId: null, jeAdmin: false }, udalost)).toBe(false);
  });

  it("jiný admin ano, mluvčí sám ne", () => {
    expect(smiSlyset({ hracId: "jiny-admin", jeAdmin: true }, udalost)).toBe(true);
    expect(smiSlyset({ hracId: "admin", jeAdmin: true }, udalost)).toBe(false);
  });
});
