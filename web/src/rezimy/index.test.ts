import { expect, it } from "vitest";
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
