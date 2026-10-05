import { describe, expect, it } from "vitest";
import { vitezDoTextu, vitezZTextu } from "./matches.js";

describe("vítěz jako text ve sloupci zapas.vitez", () => {
  it("tým a jeden hráč jdou tam a zpátky jako dřív", () => {
    expect(vitezDoTextu({ tym: 2 })).toBe("tym:2");
    expect(vitezZTextu("tym:2")).toEqual({ tym: 2 });
    expect(vitezDoTextu({ hracId: "xbox:2533274800000000" })).toBe("hrac:xbox:2533274800000000");
    expect(vitezZTextu("hrac:xbox:2533274800000000")).toEqual({ hracId: "xbox:2533274800000000" });
  });

  // hracId může mít dvojtečku (xbox:<xuid>), proto JSON pole a ne seznam
  // oddělený dvojtečkami nebo čárkami.
  it("víc vítězů je JSON pole za hraci: a přežije dvojtečku v ID", () => {
    const vitez = { hraci: ["76561198000000001", "xbox:2533274800000000"] };
    expect(vitezDoTextu(vitez)).toBe('hraci:["76561198000000001","xbox:2533274800000000"]');
    expect(vitezZTextu(vitezDoTextu(vitez))).toEqual(vitez);
  });

  it("nesmysl je null", () => {
    expect(vitezZTextu(null)).toBeNull();
    expect(vitezZTextu("hraci:nejson")).toBeNull();
    expect(vitezZTextu("hraci:[]")).toBeNull();
    expect(vitezZTextu('hraci:[1, "a"]')).toBeNull();
    expect(vitezZTextu('hraci:["a", ""]')).toBeNull();
    expect(vitezZTextu('hraci:{"a":1}')).toBeNull();
    expect(vitezZTextu("tym:9")).toBeNull();
    expect(vitezZTextu("blabla")).toBeNull();
  });
});
