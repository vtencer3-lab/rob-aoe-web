import { describe, expect, it } from "vitest";
import type { Barva, SestavaVstup, Tym } from "../shared/types.js";
import { generatePassword, lobbyName, sestavSedadla } from "./composition.js";

const h = (steamId: string, tym: Tym, barva: Barva): SestavaVstup => ({ steamId, tym, barva });
const her = (zaznamy: Record<string, number | null>) => new Map(Object.entries(zaznamy));

describe("sestavSedadla", () => {
  it("zachová pořadí, tým i barvu a očísluje sloty od nuly", () => {
    const seats = sestavSedadla([h("A", 1, 1), h("B", 1, 1), h("C", 2, 2), h("D", 2, 3)], her({}));
    expect(seats.map((s) => [s.steamId, s.tym, s.barva, s.poradi])).toEqual([
      ["A", 1, 1, 0],
      ["B", 1, 1, 1],
      ["C", 2, 2, 2],
      ["D", 2, 3, 3],
    ]);
  });

  it("hostem je hráč s nejvíc odehranými hrami", () => {
    const seats = sestavSedadla([h("A", 1, 1), h("B", 1, 3), h("C", 2, 2), h("D", 2, 4)], her({ A: 10, B: 900, C: 30, D: 40 }));
    expect(seats.filter((s) => s.jeHost).map((s) => s.steamId)).toEqual(["B"]);
  });

  it("při shodě vybere dřívější slot, neznámý počet her je nula", () => {
    expect(sestavSedadla([h("A", 1, 1), h("B", 2, 2)], her({ A: 5, B: 5 })).find((s) => s.jeHost)!.steamId).toBe("A");
    expect(sestavSedadla([h("A", 1, 1), h("B", 2, 2)], her({ A: null, B: 1 })).find((s) => s.jeHost)!.steamId).toBe("B");
  });

  it("host je vždy právě jeden", () => {
    const seats = sestavSedadla([h("A", 0, 1), h("B", 0, 2), h("C", 0, 3)], her({}));
    expect(seats.filter((s) => s.jeHost)).toHaveLength(1);
  });

  it("neplatnou sestavu odmítne českou větou", () => {
    expect(() => sestavSedadla([h("A", 1, 1)], her({}))).toThrow(/aspoň 2/);
    expect(() => sestavSedadla([h("A", 1, 1), h("A", 2, 2)], her({}))).toThrow(/dvakrát/);
    expect(() => sestavSedadla([h("A", 1, 1), h("B", 2, 1)], her({}))).toThrow(/stejném týmu/);
  });
});

describe("lobbyName", () => {
  it("doplní nulu na dvě číslice", () => {
    expect(lobbyName(7)).toBe("ROB-07");
    expect(lobbyName(12)).toBe("ROB-12");
    expect(lobbyName(103)).toBe("ROB-103");
  });
});

describe("generatePassword", () => {
  it("je čtyřmístný číselný PIN", () => {
    for (let i = 0; i < 100; i++) expect(generatePassword()).toMatch(/^\d{4}$/);
  });

  it("je deterministický při daném generátoru a snese hraniční hodnoty", () => {
    expect(generatePassword(() => 0)).toBe("0000");
    expect(generatePassword(() => 1)).toBe("9999");
    expect(generatePassword(() => 0.5)).toBe("5555");
  });
});
