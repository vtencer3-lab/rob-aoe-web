import { describe, expect, it } from "vitest";
import {
  nazevStrany,
  popisFormatu,
  sdiliCivilizaci,
  stejnyVitez,
  stranaHrace,
  strany,
  titulekViteze,
  vetaOViteze,
  vitezVeVete,
  vyhralHrac,
  type ClenStrany,
} from "./strany.js";
import type { Barva, Tym } from "./types.js";

function c(hracId: string, tym: Tym, barva: Barva, poradi: number, alias: string | null = null): ClenStrany {
  return { hracId, tym, barva, poradi, alias: alias ?? hracId.toUpperCase(), platformaJmeno: null };
}

describe("strany", () => {
  it("týmy jdou podle čísla, sólo hráči za nimi podle slotů", () => {
    const s = strany([c("d", 0, 4, 3), c("a", 2, 2, 0), c("b", 1, 1, 1), c("e", 0, 5, 2)]);
    expect(s.map((x) => x.vitez)).toEqual([{ tym: 1 }, { tym: 2 }, { hracId: "e" }, { hracId: "d" }]);
  });

  it("členové týmu jsou v pořadí slotů", () => {
    const s = strany([c("b", 1, 1, 1), c("a", 1, 1, 0)]);
    expect(s[0]!.clenove.map((x) => x.hracId)).toEqual(["a", "b"]);
  });
});

describe("nazevStrany a titulekViteze", () => {
  it("jeden hráč jménem, sdílená barva barvou, pestrý tým číslem", () => {
    const [modry, dvojka, solo] = strany([
      c("a", 1, 1, 0, "TenceR"),
      c("b", 1, 1, 1, "Pepa"),
      c("x", 2, 2, 2, "Marek"),
      c("y", 2, 3, 3, "Lukas"),
      c("s", 0, 8, 4, "Solo"),
    ]);
    expect(nazevStrany(modry!)).toBe("modrý tým");
    expect(nazevStrany(dvojka!)).toBe("tým 2");
    expect(nazevStrany(solo!)).toBe("Solo");
    expect(titulekViteze(modry!)).toBe("Vyhrál modrý tým");
  });

  it("věta má malé písmeno a zná i vítěze, který v sestavě není", () => {
    const u = [c("a", 1, 1, 0, "TenceR"), c("b", 2, 2, 1, "Marek")];
    expect(vitezVeVete(u, { tym: 2 })).toBe("vyhrál Marek");
    expect(vitezVeVete(u, { tym: 4 })).toBe("vyhrál tým 4");
  });
});

describe("stejnyVitez a stranaHrace", () => {
  it("porovná tým s týmem a hráče s hráčem", () => {
    expect(stejnyVitez({ tym: 1 }, { tym: 1 })).toBe(true);
    expect(stejnyVitez({ tym: 1 }, { hracId: "a" })).toBe(false);
    expect(stejnyVitez({ hracId: "a" }, { hracId: "a" })).toBe(true);
    expect(stejnyVitez(null, null)).toBe(true);
    expect(stejnyVitez(null, { tym: 1 })).toBe(false);
  });

  it("hráč bez týmu je svoje vlastní strana", () => {
    const u = [c("a", 1, 1, 0), c("s", 0, 3, 1)];
    expect(stranaHrace(u, "a")).toEqual({ tym: 1 });
    expect(stranaHrace(u, "s")).toEqual({ hracId: "s" });
    expect(stranaHrace(u, "z")).toBeNull();
  });
});

// Aliance v Diplomacii i ve FFA vznikají až ve hře: v lobby hraje každý sám
// za sebe, ale vyhrát můžou dva nebo tři naráz. Třetí tvar vítěze je proto
// seznam hráčů, ne strana ze sestavy.
describe("vítěz s víc hráči", () => {
  const ffa = [c("a", 0, 1, 0, "Garda"), c("b", 0, 2, 1, "Nastupce"), c("d", 0, 3, 2, "Zoldak"), c("ai:1", 0, 4, 3, "AI")];
  const tymovy = [c("a", 1, 1, 0), c("b", 1, 1, 1), c("x", 2, 2, 2), c("s", 0, 3, 3)];

  it("stejnyVitez porovnává množinu hráčů bez ohledu na pořadí", () => {
    expect(stejnyVitez({ hraci: ["a", "b"] }, { hraci: ["b", "a"] })).toBe(true);
    expect(stejnyVitez({ hraci: ["a", "b"] }, { hraci: ["a", "d"] })).toBe(false);
    expect(stejnyVitez({ hraci: ["a", "b"] }, { hraci: ["a"] })).toBe(false);
    expect(stejnyVitez({ hraci: ["a"] }, { hracId: "a" })).toBe(false);
    expect(stejnyVitez({ hracId: "a" }, { hraci: ["a"] })).toBe(false);
    expect(stejnyVitez({ tym: 1 }, { hraci: ["a"] })).toBe(false);
  });

  it("vyhralHrac zná všechny tři tvary a bez výsledku nevyhrál nikdo", () => {
    expect(vyhralHrac(tymovy, { tym: 1 }, "b")).toBe(true);
    expect(vyhralHrac(tymovy, { tym: 1 }, "x")).toBe(false);
    expect(vyhralHrac(tymovy, { tym: 1 }, "cizi")).toBe(false);
    expect(vyhralHrac(tymovy, { hracId: "s" }, "s")).toBe(true);
    expect(vyhralHrac(tymovy, { hracId: "s" }, "a")).toBe(false);
    expect(vyhralHrac(ffa, { hraci: ["a", "d"] }, "d")).toBe(true);
    expect(vyhralHrac(ffa, { hraci: ["a", "d"] }, "b")).toBe(false);
    expect(vyhralHrac(ffa, null, "a")).toBe(false);
  });

  it("věta: jeden vyhrál, víc vyhráli, jména v pořadí slotů", () => {
    expect(vitezVeVete(ffa, { hraci: ["b"] })).toBe("vyhrál Nastupce");
    expect(vitezVeVete(ffa, { hraci: ["ai:1"] })).toBe("vyhrála AI");
    expect(vitezVeVete(ffa, { hraci: ["d", "a"] })).toBe("vyhráli Garda a Zoldak");
    expect(vitezVeVete(ffa, { hraci: ["d", "b", "a"] })).toBe("vyhráli Garda, Nastupce a Zoldak");
    expect(vitezVeVete(ffa, { hraci: ["zzz"] })).toBe("vyhrál zzz");
  });

  // Web ke jménům ve větě kreslí čtvereček barvy: části věty nesou barvu
  // hráče, u týmu jen když ji sdílí celý; neznámé id a tým s víc barvami ne.
  it("části věty nesou barvu jmenovaného", () => {
    expect(vetaOViteze(ffa, { hraci: ["d", "a"] })).toEqual({
      sloveso: "vyhráli",
      jmenovani: [
        { jmeno: "Garda", barva: 1 },
        { jmeno: "Zoldak", barva: 3 },
      ],
    });
    expect(vetaOViteze(ffa, { hraci: ["zzz"] })).toEqual({ sloveso: "vyhrál", jmenovani: [{ jmeno: "zzz", barva: null }] });
    expect(vetaOViteze(ffa, { hracId: "b" })).toEqual({ sloveso: "vyhrál", jmenovani: [{ jmeno: "Nastupce", barva: 2 }] });
    const tymy = [c("a", 1, 1, 0), c("b", 1, 1, 1), c("x", 2, 2, 2), c("y", 2, 3, 3)];
    expect(vetaOViteze(tymy, { tym: 1 })).toEqual({ sloveso: "vyhrál", jmenovani: [{ jmeno: "modrý tým", barva: 1 }] });
    expect(vetaOViteze(tymy, { tym: 2 })).toEqual({ sloveso: "vyhrál", jmenovani: [{ jmeno: "tým 2", barva: null }] });
  });
});

describe("sdiliCivilizaci a popisFormatu", () => {
  const coop = [c("a", 1, 1, 0), c("b", 1, 1, 1), c("x", 2, 2, 2), c("y", 2, 2, 3)];

  it("stejná barva = sdílená civilizace", () => {
    expect(sdiliCivilizaci(coop, "a").map((u) => u.hracId)).toEqual(["b"]);
    expect(sdiliCivilizaci([c("a", 1, 1, 0), c("b", 2, 2, 1)], "a")).toEqual([]);
  });

  it("formát se odvodí ze stran", () => {
    expect(popisFormatu(coop)).toBe("2v2 · Coop Kings");
    expect(popisFormatu([c("a", 1, 1, 0), c("b", 2, 2, 1)])).toBe("1v1");
    expect(popisFormatu([c("a", 0, 1, 0), c("b", 0, 2, 1), c("d", 0, 3, 2)])).toBe("1v1v1");
    expect(popisFormatu([c("a", 1, 1, 0), c("b", 1, 2, 1), c("d", 2, 3, 2)])).toBe("2v1");
    expect(popisFormatu([])).toBe("");
  });
});

// AI je v češtině rodu ženského: „Vyhrála AI“, ne „Vyhrál AI“. Týká se to
// jen strany o jednom členovi — tým je mužský rod pořád („vyhrál modrý tým“).
describe("rod vítěze", () => {
  it("u AI je vyhrála, u člověka vyhrál", () => {
    const sestava = [c("ai:1", 0, 1, 0, "AI"), c("76561198000000001", 0, 2, 1, "Pepa")];
    const [aiStrana, clovekStrana] = strany(sestava);
    expect(titulekViteze(aiStrana!)).toBe("Vyhrála AI");
    expect(titulekViteze(clovekStrana!)).toBe("Vyhrál Pepa");
  });

  it("tým s AI zůstává mužský", () => {
    const sestava = [c("ai:1", 1, 1, 0, "AI"), c("ai:2", 1, 2, 1, "AI"), c("76561198000000001", 2, 3, 2, "Pepa")];
    const [tym] = strany(sestava);
    expect(titulekViteze(tym!)).toBe("Vyhrál tým 1");
  });

  it("ve větě se rod drží taky", () => {
    const sestava = [c("ai:1", 0, 1, 0, "AI"), c("76561198000000001", 0, 2, 1, "Pepa")];
    expect(vitezVeVete(sestava, { hracId: "ai:1" })).toBe("vyhrála AI");
  });
});
