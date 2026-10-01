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
it("scénář musí mít právě jednoho GM", () => {
  expect(() => prectiRozbor({ ...ROZBOR, sloty: ROZBOR.sloty.map((s) => ({ ...s, jeGm: false })) })).toThrow("právě jednoho GM");
});
