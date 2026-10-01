import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { AkceStavPayload } from "../../../src/shared/types.js";
import { rezimKlienta } from "./index.js";

// Klasický večer nic do obrazovek jádra nepřidává; chybějící mód (starší
// snímek stavu bez `rezim`) je totéž co klasický.
it("klasický večer ani chybějící mód nic nepřidávají", () => {
  expect(rezimKlienta(undefined)).toEqual({});
  expect(rezimKlienta("klasicky")).toEqual({});
});

it("Diplomacie označí šedý slot jako GM, ostatní nechá bez štítku", () => {
  const rk = rezimKlienta("diplomacie");
  expect(rk.popisSlotu?.(7)).toBe("GM");
  expect(rk.popisSlotu?.(1)).toBeNull();
});

// Panel Nastavení lobby ukazuje v Custom Scenario podmínky vítězství z
// rozboru aktivní verze; bez verze (nebo u starého rozboru bez nich) nic.
it("Diplomacie dodá panelu nastavení popis vítězství z aktivní verze", () => {
  const rk = rezimKlienta("diplomacie");
  const aktivni: ScenarVerze = { id: 1, jmenoSouboru: "LLC.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null };
  const stav = (a: ScenarVerze | null): AkceStavPayload => ({ akce: null, prihlaseni: [], zapasy: [], rezim: { id: "diplomacie", data: { aktivni: a, verze: {}, zapasy: [] } } });
  expect(rk.nastaveniScenare?.(stav(aktivni))).toEqual({ vitezstvi: "Vlastní podmínky scénáře" });
  expect(rk.nastaveniScenare?.(stav(null))).toEqual({ vitezstvi: null });
  expect(rk.nastaveniScenare?.(stav({ ...aktivni, rozbor: { ...ROZBOR, vitezstvi: undefined } }))).toEqual({ vitezstvi: null });
  // Snímek bez dat módu (starší stav) — nic k ukázání.
  expect(rk.nastaveniScenare?.({ akce: null, prihlaseni: [], zapasy: [] })).toBeNull();
});
