import { describe, expect, it } from "vitest";
import {
  nazevStrany,
  popisFormatu,
  sdiliCivilizaci,
  stejnyVitez,
  stranaHrace,
  strany,
  titulekViteze,
  vitezVeVete,
  type ClenStrany,
} from "./strany.js";
import type { Barva, Tym } from "./types.js";

function c(steamId: string, tym: Tym, barva: Barva, poradi: number, alias: string | null = null): ClenStrany {
  return { steamId, tym, barva, poradi, alias: alias ?? steamId.toUpperCase(), steamName: null };
}

describe("strany", () => {
  it("týmy jdou podle čísla, sólo hráči za nimi podle slotů", () => {
    const s = strany([c("d", 0, 4, 3), c("a", 2, 2, 0), c("b", 1, 1, 1), c("e", 0, 5, 2)]);
    expect(s.map((x) => x.vitez)).toEqual([{ tym: 1 }, { tym: 2 }, { steamId: "e" }, { steamId: "d" }]);
  });

  it("členové týmu jsou v pořadí slotů", () => {
    const s = strany([c("b", 1, 1, 1), c("a", 1, 1, 0)]);
    expect(s[0]!.clenove.map((x) => x.steamId)).toEqual(["a", "b"]);
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
    expect(stejnyVitez({ tym: 1 }, { steamId: "a" })).toBe(false);
    expect(stejnyVitez({ steamId: "a" }, { steamId: "a" })).toBe(true);
    expect(stejnyVitez(null, null)).toBe(true);
    expect(stejnyVitez(null, { tym: 1 })).toBe(false);
  });

  it("hráč bez týmu je svoje vlastní strana", () => {
    const u = [c("a", 1, 1, 0), c("s", 0, 3, 1)];
    expect(stranaHrace(u, "a")).toEqual({ tym: 1 });
    expect(stranaHrace(u, "s")).toEqual({ steamId: "s" });
    expect(stranaHrace(u, "z")).toBeNull();
  });
});

describe("sdiliCivilizaci a popisFormatu", () => {
  const coop = [c("a", 1, 1, 0), c("b", 1, 1, 1), c("x", 2, 2, 2), c("y", 2, 2, 3)];

  it("stejná barva = sdílená civilizace", () => {
    expect(sdiliCivilizaci(coop, "a").map((u) => u.steamId)).toEqual(["b"]);
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
