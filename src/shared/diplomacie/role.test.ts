import { expect, it } from "vitest";
import { NAZEV_ROLE, POPIS_ROLE } from "./role.js";

it("každá role má název a cíl", () => {
  for (const role of Object.keys(NAZEV_ROLE) as (keyof typeof NAZEV_ROLE)[]) {
    expect(NAZEV_ROLE[role].length).toBeGreaterThan(0);
    expect(POPIS_ROLE[role].cil.length).toBeGreaterThan(0);
  }
});
