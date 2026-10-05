import { expect, it } from "vitest";
import { zamichej, zamichejJinak, zJednotkove } from "./michani.js";

it("zamíchání je permutace a původní pole nemění", () => {
  const pole = [1, 2, 3, 4, 5];
  const vysledek = zamichej(pole, () => 0);
  expect([...vysledek].sort()).toEqual([1, 2, 3, 4, 5]);
  expect(vysledek).not.toEqual(pole);
  expect(pole).toEqual([1, 2, 3, 4, 5]);
});

// Náhoda, která by Fisher–Yates nechala beze změny (vždy poslední index),
// nesmí vrátit totéž pořadí — jinak by tlačítko „Zamíchat“ nic neudělalo.
it("zamichejJinak se od původního pořadí vždy liší", () => {
  const beze = (n: number) => n - 1;
  expect(zamichej([1, 2, 3], beze)).toEqual([1, 2, 3]);
  expect(zamichejJinak([1, 2, 3], beze)).toEqual([2, 3, 1]);
  expect(zamichejJinak([1, 2], beze)).toEqual([2, 1]);
  expect(zamichejJinak([1], beze)).toEqual([1]);
  expect(zamichejJinak([], beze)).toEqual([]);
});

it("náhoda tvaru Math.random se převede na celé číslo pod n", () => {
  expect(zJednotkove(() => 0)(8)).toBe(0);
  expect(zJednotkove(() => 0.5)(8)).toBe(4);
  expect(zJednotkove(() => 0.999)(8)).toBe(7);
});
