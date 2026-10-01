import { expect, it } from "vitest";
import type { Barva, SestavaVstup } from "./types.js";
import { vychoziTymRezimu, zkontrolujSestavuRezimu } from "./rezimy.js";

const osm = (): SestavaVstup[] => ([1, 2, 3, 4, 5, 6, 7, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva, tym: 0, civ: null }));

it("klasický mód = jen jádro", () => {
  expect(zkontrolujSestavuRezimu("klasicky", osm().slice(0, 2))).toBeNull();
});
it("Diplomacie přidá svá pravidla po jádru", () => {
  expect(zkontrolujSestavuRezimu("diplomacie", osm().slice(0, 2))).toMatch(/přesně 8/);
  expect(zkontrolujSestavuRezimu("diplomacie", osm())).toBeNull();
  expect(zkontrolujSestavuRezimu("diplomacie", [osm()[0]!])).toMatch(/aspoň 2/);
});

// Diplomacie je každý sám za sebe a její kontrola sestavy týmy zakazuje —
// nový hráč tam dostane rovnou „–“, ať admin nepřepíná osm tlačítek.
it("výchozí tým nového hráče: klasicky střídá 1 a 2, Diplomacie dává „–“", () => {
  expect(vychoziTymRezimu("klasicky", 0)).toBe(1);
  expect(vychoziTymRezimu("klasicky", 1)).toBe(2);
  expect(vychoziTymRezimu("diplomacie", 0)).toBe(0);
  expect(vychoziTymRezimu("diplomacie", 5)).toBe(0);
});
