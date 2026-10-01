import { expect, it } from "vitest";
import { GM_BARVA, zkontrolujSestavuDiplomacie } from "./sestava.js";
import { aiId } from "../aiHraci.js";
import type { Barva, SestavaVstup } from "../types.js";

const osm = (): SestavaVstup[] => ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva, tym: 0, civ: null }));

it("8 lidí, různé barvy, bez týmů a civilizací projde", () => {
  expect(zkontrolujSestavuDiplomacie(osm())).toBeNull();
});
it("7 lidí a AI na jiné než šedé barvě projde", () => {
  expect(zkontrolujSestavuDiplomacie(osm().map((s) => (s.barva === 3 ? { ...s, hracId: aiId(1) } : s)))).toBeNull();
});
it("AI na šedé neprojde — GM musí být člověk", () => {
  expect(zkontrolujSestavuDiplomacie(osm().map((s) => (s.barva === GM_BARVA ? { ...s, hracId: aiId(1) } : s)))).toBe("Na šedé musí být GM, ne počítač.");
});
it("sedm lidí neprojde", () => {
  expect(zkontrolujSestavuDiplomacie(osm().slice(0, 7))).toMatch(/přesně 8/);
});
it("dvě stejné barvy neprojdou", () => {
  const s = osm();
  s[0] = { ...s[0]!, barva: 2 };
  expect(zkontrolujSestavuDiplomacie(s)).toBe("Každý musí mít jinou barvu.");
});
it("tým nebo civilizace neprojdou", () => {
  expect(zkontrolujSestavuDiplomacie(osm().map((s, i) => (i === 0 ? { ...s, tym: 1 } : s)))).toMatch(/bez týmu/);
  expect(zkontrolujSestavuDiplomacie(osm().map((s, i) => (i === 0 ? { ...s, civ: 1 } : s)))).toMatch(/nepředepisuj/);
});
