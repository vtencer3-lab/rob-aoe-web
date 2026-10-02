import { expect, it } from "vitest";
import { ROZBOR } from "../shared/diplomacie/fixtures.js";
import type { ScenarVerze } from "../shared/diplomacie/typy.js";
import { nastaveniScenare } from "./rezim.js";

const verze = (id: number, jmenoSouboru: string, cast: Partial<ScenarVerze> = {}): ScenarVerze => ({
  id,
  jmenoSouboru,
  nahrano: "2026-10-01T10:00:00.000Z",
  nahralJmeno: "Jin",
  poznamka: null,
  aktivni: false,
  rozbor: ROZBOR,
  chybaRozboru: null,
  minimapaOtisk: null,
  minimapaVlastni: false,
  sonda: null,
  ...cast,
});

// V Custom Scenario hra Map Size nenabízí a lobby posílá velikost ze
// scénáře; kontrola ji proto musí čekat z rozboru, ne z počtu hráčů.
it("z aktivní verze bere jméno, starší jména i velikost mapy z rozboru", () => {
  const v1 = verze(1, "LLC v1.aoe2scenario");
  const v2 = verze(2, "LLC v2.aoe2scenario", { aktivni: true });
  expect(nastaveniScenare(v2, [v1, v2])).toEqual({ scenar: "LLC v2.aoe2scenario", scenarStarsi: ["LLC v1.aoe2scenario"], velikost: 220 });
});

it("bez aktivní verze je všechno null", () => {
  expect(nastaveniScenare(null, [])).toEqual({ scenar: null, scenarStarsi: null, velikost: null });
});

// Aktivovat jde jen verzi s rozborem (routa to hlídá), ale kdyby se stav
// rozešel, kontrola má radši velikost jen vypsat než hádat.
it("aktivní verze bez rozboru nechá velikost null", () => {
  const v = verze(1, "LLC.aoe2scenario", { aktivni: true, rozbor: null, chybaRozboru: "x" });
  expect(nastaveniScenare(v, [v])).toEqual({ scenar: "LLC.aoe2scenario", scenarStarsi: [], velikost: null });
});
