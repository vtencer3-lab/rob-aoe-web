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
// Sankce Rady králů u Nástupce je jiné pravidlo a jmenuje se dál stejně.
it("Nájezdník má Sabotáž jednou za hru, o ekonomické sankci už nemluví", () => {
  expect(POPIS_ROLE.najezdnik.vyhody).toContain(
    "Jednou za hru může provést Sabotáž proti kterémukoli hráči (stojí 2000 zlata zaplacených GM).",
  );
  expect(POPIS_ROLE.najezdnik.vyhody.join(" ")).not.toMatch(/sankc/i);
  expect(POPIS_ROLE.nastupce.vyhody).toContain("Nelze na něj uvalit sankci Rady králů.");
});

// Veřejnost Nástupce je informace, ne výhoda (uživatel 3. 10. 2026);
// rady už svolávat smí (nová verze pravidel téhož dne).
it("Nástupce: veřejnost je informace, svolávání rad už není nevýhoda", () => {
  expect(POPIS_ROLE.nastupce.informace).toEqual(["Je veřejně znám od začátku hry."]);
  expect(POPIS_ROLE.nastupce.vyhody.join(" ")).not.toMatch(/veřejně/);
  expect(POPIS_ROLE.nastupce.nevyhody.join(" ")).not.toMatch(/rady/);
});

// Jeden sloh pro všechny role (uživatel 2. 10. 2026): cíl začíná „Vyhrává,
// když …“, každá věta končí tečkou a obraty „lze“, „je-li“ a „skrze“ se
// nepoužívají — pravidla mají být věcná a u každé role napsaná stejně.
// („Nelze“ ve větě o sankci Rady králů je znění zadané uživatelem; hlídá
// se samostatné slovo „lze“.)
it("pravidla rolí drží jednotný sloh", () => {
  for (const role of Object.keys(POPIS_ROLE) as (keyof typeof POPIS_ROLE)[]) {
    const { cil, informace = [], vyhody, nevyhody } = POPIS_ROLE[role];
    expect(cil, role).toMatch(/^Vyhrává, když /);
    for (const veta of [cil, ...informace, ...vyhody, ...nevyhody]) {
      expect(veta, `${role}: ${veta}`).toMatch(/^\p{Lu}/u);
      expect(veta, `${role}: ${veta}`).toMatch(/\.$/);
      expect(veta, `${role}: ${veta}`).not.toMatch(/(^|[^\p{L}])(lze|je-li|skrze)([^\p{L}]|$)/iu);
    }
  }
});

// Znění odsouhlasené uživatelem — pojistka proti tichému přepsání.
it("cíle rolí mají dohodnuté znění", () => {
  expect(Object.fromEntries(Object.entries(POPIS_ROLE).map(([role, p]) => [role, p.cil]))).toEqual({
    nastupce: "Vyhrává, když získá 7 relikvií a udrží je 15 minut.",
    garda: "Vyhrává, když vyhraje Nástupce císaře, nebo když sama splní primární či sekundární cíl a Nástupce přitom žije.",
    najezdnik: "Vyhrává, když je Nástupce císaře poražen a Nájezdník splní primární nebo sekundární cíl. Vyhrává i tehdy, když vyhraje druhý Nájezdník (i po vlastním vyřazení).",
    sasek: "Vyhrává, když splní primární nebo sekundární cíl. Vyhrává sám za sebe, bez ohledu na aliance.",
    zoldak: "Vyhrává, když splní primární nebo sekundární cíl (pak vyhrává samostatně), nebo když vyhraje hráč, se kterým má pokrevní pouto. Když tento hráč prohraje, prohrává i Žoldák.",
    kat: "Vyhrává, když splní primární nebo sekundární cíl a jeho oběť je mrtvá. Oběť může zabít kdokoli.",
  });
});
