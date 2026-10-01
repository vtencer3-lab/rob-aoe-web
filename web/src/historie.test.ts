import { describe, expect, it } from "vitest";
import { VYCHOZI_NASTAVENI } from "../../src/shared/lobbyKontrola.js";
import type { SestavaVstup } from "../../src/shared/types.js";
import { popisZmenyNastaveni, popisZmenySestavy } from "./historie.js";

const jmeno = (id: string) => ({ a: "Trokner", b: "Jouki" })[id] ?? id;
const h = (hracId: string, tym: 0 | 1 | 2, barva: 1 | 2 | 3, civ: number | null = null): SestavaVstup => ({ hracId, tym, barva, civ });

describe("popisZmenySestavy", () => {
  it("pojmenuje přidání, vyřazení, barvu, tým, civilizaci a pořadí", () => {
    expect(popisZmenySestavy([h("a", 1, 1)], [h("a", 1, 1), h("b", 2, 2)], jmeno)).toEqual({ text: "Jouki přidán do sestavy", cil: "b" });
    expect(popisZmenySestavy([h("a", 1, 1), h("b", 2, 2)], [h("a", 1, 1)], jmeno)).toEqual({ text: "Jouki vyřazen ze sestavy", cil: null });
    expect(popisZmenySestavy([h("a", 1, 1)], [h("a", 1, 2)], jmeno)).toEqual({ text: "Trokner: barva modrá → červená", cil: "a" });
    expect(popisZmenySestavy([h("a", 1, 1)], [h("a", 0, 1)], jmeno)).toEqual({ text: "Trokner: tým 1 → –", cil: "a" });
    expect(popisZmenySestavy([h("a", 1, 1)], [h("a", 1, 1, 18)], jmeno)).toEqual({ text: "Trokner: civilizace libovolná → Koreans", cil: "a" });
    expect(popisZmenySestavy([h("a", 1, 1), h("b", 2, 2)], [h("b", 2, 2), h("a", 1, 1)], jmeno)).toEqual({ text: "Pořadí slotů změněno", cil: "b" });
    expect(popisZmenySestavy([h("a", 1, 1)], [], jmeno)).toEqual({ text: "Trokner vyřazen ze sestavy", cil: null });
    expect(popisZmenySestavy([h("a", 1, 1), h("b", 2, 2)], [], jmeno)).toEqual({ text: "Sestava vyprázdněna", cil: null });
  });
});

describe("popisZmenyNastaveni", () => {
  it("pojmenuje první změněný klíč s hodnotami jako v panelu", () => {
    expect(popisZmenyNastaveni(VYCHOZI_NASTAVENI, { ...VYCHOZI_NASTAVENI, populace: 150 })).toEqual({ text: "Population: 200 → 150", cil: "populace" });
    expect(popisZmenyNastaveni(VYCHOZI_NASTAVENI, { ...VYCHOZI_NASTAVENI, mapaId: 10878 })).toEqual({ text: "Location: Arabia → Black Forest", cil: "mapaId" });
    expect(popisZmenyNastaveni(VYCHOZI_NASTAVENI, { ...VYCHOZI_NASTAVENI, lockTeams: false })).toEqual({ text: "Lock Teams: zapnuto → vypnuto", cil: "lockTeams" });
    expect(popisZmenyNastaveni(VYCHOZI_NASTAVENI, { ...VYCHOZI_NASTAVENI, rychlost: 3, cheaty: true }).text).toBe("Game Speed: Normal → Fast (+1 dalších)");
  });

  // V Custom Scenario mapu, velikost a Victory určuje scénář a panel je
  // neukazuje — věta o nich by ukazovala na řádek, který v panelu není.
  it("v Custom Scenario o mapě, velikosti a Victory mlčí, o ostatním ne", () => {
    const scenar = { ...VYCHOZI_NASTAVENI, rezim: 3 };
    expect(popisZmenyNastaveni(scenar, { ...scenar, mapaId: 10878, velikost: 220, vitezstvi: 9 })).toEqual({ text: "Nastavení beze změny", cil: null });
    expect(popisZmenyNastaveni(scenar, { ...scenar, mapaId: 10878, populace: 150 })).toEqual({ text: "Population: 200 → 150", cil: "populace" });
    // Přepnutí režimu samo je změna a jmenuje se herním názvem.
    expect(popisZmenyNastaveni(VYCHOZI_NASTAVENI, scenar)).toEqual({ text: "Game Mode: Random Map → Custom Scenario", cil: "rezim" });
  });
});
