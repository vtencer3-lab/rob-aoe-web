import { expect, it } from "vitest";
import { prectiRozbor } from "./scenar.js";
import { ROZBOR } from "./fixtures.js";

it("platný rozbor projde beze změny", () => {
  expect(prectiRozbor(ROZBOR)).toEqual(ROZBOR);
});
it("chybějící nebo špatně typované pole se odmítne", () => {
  expect(() => prectiRozbor({ ...ROZBOR, cile: "x" })).toThrow("Rozbor: cile není seznam.");
  expect(() => prectiRozbor({ ...ROZBOR, suroviny: { ...ROZBOR.suroviny, zlato: "2000" } })).toThrow("suroviny.zlato");
  expect(() => prectiRozbor({ ...ROZBOR, starty: [{ barva: 9, x: 0, y: 0 }] })).toThrow("barva 1–8");
  expect(() => prectiRozbor(null)).toThrow("výsledek chybí");
});
// Podmínky vítězství přibyly 1. 10. 2026 (úkol 22); verze rozebrané dřív je
// v databázi nemají a musí se dál číst. Tvar se ale hlídá stejně přísně.
it("podmínky vítězství jsou volitelné, ale když jsou, mají správný tvar", () => {
  const { vitezstvi: _bezNich, ...starsi } = ROZBOR;
  const precteno = prectiRozbor(starsi);
  expect(precteno.vitezstvi).toBeUndefined();
  expect("vitezstvi" in precteno).toBe(false);
  expect(prectiRozbor({ ...ROZBOR, vitezstvi: { rezim: "skore", popis: "Skóre 14000" } }).vitezstvi).toEqual({ rezim: "skore", popis: "Skóre 14000" });
  expect(() => prectiRozbor({ ...ROZBOR, vitezstvi: { rezim: "x", popis: "?" } })).toThrow("vitezstvi.rezim");
  expect(() => prectiRozbor({ ...ROZBOR, vitezstvi: { rezim: "skore" } })).toThrow("vitezstvi.popis");
  expect(() => prectiRozbor({ ...ROZBOR, vitezstvi: null })).toThrow("vitezstvi chybí");
});
it("scénář musí mít právě jednoho GM", () => {
  expect(() => prectiRozbor({ ...ROZBOR, sloty: ROZBOR.sloty.map((s) => ({ ...s, jeGm: false })) })).toThrow("právě jednoho GM");
});
