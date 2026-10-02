import { expect, it } from "vitest";
import { NAZEV_ROLE, POPIS_ROLE } from "./role.js";

it("každá role má název a cíl", () => {
  for (const role of Object.keys(NAZEV_ROLE) as (keyof typeof NAZEV_ROLE)[]) {
    expect(NAZEV_ROLE[role].length).toBeGreaterThan(0);
    expect(POPIS_ROLE[role].cil.length).toBeGreaterThan(0);
  }
});

// Pravidlo z 2. 10. 2026: Sabotáž (dřív „ekonomická sankce“) má každý
// Nájezdník jednu za hru a na jednoho hráče smí dopadnout nejvýš jedna.
// Sankce z Rady králů u Nástupce je jiné pravidlo a jmenuje se dál stejně.
it("Nájezdník má Sabotáž jednou za hru, o ekonomické sankci už nemluví", () => {
  expect(POPIS_ROLE.najezdnik.vyhody).toContain(
    "Každý Nájezdník může jednou za hru provést Sabotáž proti kterémukoli hráči (na jednoho hráče nejvýš jedna; stojí 2000 zlata zaplacené GM).",
  );
  expect(POPIS_ROLE.najezdnik.vyhody.join(" ")).not.toMatch(/sankc/i);
  expect(POPIS_ROLE.nastupce.vyhody).toContain("Nelze na něj uvalit sankci z Rady králů.");
});
