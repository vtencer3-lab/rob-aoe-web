import { expect, it } from "vitest";
import type { Barva } from "../types.js";
import { naMinimapu, procNelzePrevzitMinimapu } from "./minimapa.js";

// Starty verze 1 LLC na /aoe/diplo — středy kosočtverců z obrázku ze hry.
const OBRAZEK = {
  velikostMapy: 220,
  starty: [
    { barva: 1 as Barva, x: 0.2831, y: 0.2833 },
    { barva: 2 as Barva, x: 0.5024, y: 0.118 },
    { barva: 3 as Barva, x: 0.196, y: 0.556 },
    { barva: 4 as Barva, x: 0.7029, y: 0.2835 },
    { barva: 5 as Barva, x: 0.8729, y: 0.496 },
    { barva: 6 as Barva, x: 0.6808, y: 0.6756 },
    { barva: 8 as Barva, x: 0.4997, y: 0.8526 },
  ],
};
// Nová verze téže mapy: rozbor dává medián jednotek, o 1–3 % vedle obrázku.
const posun = (dx: number, dy: number) => ({ ...OBRAZEK, starty: OBRAZEK.starty.map((s) => ({ ...s, x: s.x + dx, y: s.y + dy })) });

it("tatáž mapa (starty do 0,05 od obrázku, jiné pořadí) převezme vlastní minimapu", () => {
  expect(procNelzePrevzitMinimapu(OBRAZEK, OBRAZEK)).toBeNull();
  expect(procNelzePrevzitMinimapu(OBRAZEK, posun(0.03, -0.03))).toBeNull();
  expect(procNelzePrevzitMinimapu(OBRAZEK, { ...OBRAZEK, starty: [...OBRAZEK.starty].reverse() })).toBeNull();
});

// Skutečný rozbor LLC (fixtures/LLC.aoe2scenario, 2. 10. 2026): nejdál je
// modrá 3, ~0,036 od kosočtverce v obrázku.
it("skutečný rozbor LLC sedí na starty z obrázku verze 1", () => {
  const rozbor = [
    { barva: 1 as Barva, x: 0.2722, y: 0.2892 },
    { barva: 2 as Barva, x: 0.5091, y: 0.1114 },
    { barva: 3 as Barva, x: 0.1818, y: 0.5886 },
    { barva: 4 as Barva, x: 0.6977, y: 0.2773 },
    { barva: 5 as Barva, x: 0.8756, y: 0.5108 },
    { barva: 6 as Barva, x: 0.6761, y: 0.7057 },
    { barva: 8 as Barva, x: 0.4955, y: 0.8795 },
  ];
  expect(procNelzePrevzitMinimapu(OBRAZEK, { velikostMapy: 220, starty: rozbor })).toBeNull();
});

it("jiná velikost mapy nepřevezme", () => {
  expect(procNelzePrevzitMinimapu(OBRAZEK, { ...OBRAZEK, velikostMapy: 240 })).toBe("Mapa má jinou velikost (240 místo 220).");
});

it("chybějící nebo navíc barva startu nepřevezme", () => {
  expect(procNelzePrevzitMinimapu(OBRAZEK, { ...OBRAZEK, starty: OBRAZEK.starty.slice(1) })).toBe("Mapa má jiné barvy startů.");
  expect(procNelzePrevzitMinimapu(OBRAZEK, { ...OBRAZEK, starty: [...OBRAZEK.starty, { barva: 7 as Barva, x: 0.5, y: 0.5 }] })).toBe("Mapa má jiné barvy startů.");
});

it("start posunutý o víc než 0,05 nepřevezme", () => {
  const jinde = { ...OBRAZEK, starty: OBRAZEK.starty.map((s) => (s.barva === 5 ? { ...s, x: s.x - 0.06 } : s)) };
  expect(procNelzePrevzitMinimapu(OBRAZEK, jinde)).toBe("Start barvy 5 je jinde než na vlastní minimapě.");
  // Hranice se měří vzdušnou čarou: 0,04 na obou osách je ~0,057.
  expect(procNelzePrevzitMinimapu(OBRAZEK, posun(0.04, 0.04))).toMatch("je jinde");
});

// Dílec → minimapa jako `otoc` v rozbor.py: střed mapy je střed obrázku,
// roh (0, 0) je levý vrchol kosočtverce, (n, n) pravý, (n, 0) horní.
it("dílec hry se převede na místo v kosočtverci minimapy", () => {
  expect(naMinimapu(110, 110, 220)).toEqual({ x: 0.5, y: 0.5 });
  expect(naMinimapu(0, 0, 220)).toEqual({ x: 0, y: 0.5 });
  expect(naMinimapu(220, 220, 220)).toEqual({ x: 1, y: 0.5 });
  expect(naMinimapu(220, 0, 220)).toEqual({ x: 0.5, y: 0 });
  expect(naMinimapu(0, 220, 220)).toEqual({ x: 0.5, y: 1 });
});
