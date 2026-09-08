import { describe, expect, it } from "vitest";
import { zkontrolujSestavu } from "./sestava.js";
import type { Barva, SestavaVstup, Tym } from "./types.js";

const h = (steamId: string, tym: Tym, barva: Barva): SestavaVstup => ({ steamId, tym, barva });

describe("zkontrolujSestavu", () => {
  it("1v1, 2v2 i Coop Kings projdou", () => {
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 2, 2)])).toBeNull();
    expect(zkontrolujSestavu([h("a", 0, 1), h("b", 0, 2)])).toBeNull();
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 1, 1), h("c", 2, 2), h("d", 2, 2)])).toBeNull();
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 1, 3), h("c", 2, 2), h("d", 2, 4)])).toBeNull();
  });

  // Tým může být jak velký chce a nemusí být vyrovnaný — Rob si sestavu
  // klikne ručně a hra sama nic takového nevyžaduje.
  it("tým unese libovolný počet hráčů", () => {
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 1, 2), h("c", 1, 3), h("d", 2, 4)])).toBeNull();
    expect(
      zkontrolujSestavu([h("a", 1, 1), h("b", 1, 2), h("c", 1, 3), h("d", 2, 4), h("e", 2, 5), h("f", 2, 6)]),
    ).toBeNull();
    const sedm = [h("a", 1, 1), h("b", 1, 2), h("c", 1, 3), h("d", 1, 4), h("e", 1, 5), h("f", 1, 6), h("g", 2, 7)];
    expect(zkontrolujSestavu(sedm)).toBeNull();
  });

  // Na jednom slotu (barvě) můžou ve hře sedět i tři a víc; dřív to pravidlo
  // zaseklo na dvou a zápas nešel založit.
  it("stejnou barvu smí sdílet i víc než dva hráči", () => {
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 1, 1), h("c", 1, 1), h("d", 2, 2)])).toBeNull();
    expect(
      zkontrolujSestavu([
        { ...h("a", 1, 1), civ: 18 },
        { ...h("b", 1, 1), civ: 18 },
        { ...h("c", 1, 1), civ: 18 },
        h("d", 2, 2),
      ]),
    ).toBeNull();
  });

  it("odmítne málo nebo moc hráčů", () => {
    expect(zkontrolujSestavu([h("a", 1, 1)])).toMatch(/aspoň 2/);
    const devet = Array.from({ length: 9 }, (_, i) => h(`p${i}`, 0, ((i % 8) + 1) as Barva));
    expect(zkontrolujSestavu(devet)).toMatch(/nejvýš 8/);
  });

  it("odmítne zdvojeného hráče a hodnoty mimo hru", () => {
    expect(zkontrolujSestavu([h("a", 1, 1), h("a", 2, 2)])).toMatch(/dvakrát/);
    expect(zkontrolujSestavu([h("a", 1, 9 as Barva), h("b", 2, 2)])).toMatch(/Barva/);
    expect(zkontrolujSestavu([h("a", 5 as Tym, 1), h("b", 2, 2)])).toMatch(/Tým/);
  });

  it("stejná barva jen ve stejném týmu", () => {
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 2, 1)])).toMatch(/stejném týmu/);
    expect(zkontrolujSestavu([h("a", 0, 1), h("b", 0, 1)])).toMatch(/stejném týmu/);
    // Rozejde se až třetí — pravidlo musí koukat na celou skupinu, ne jen na dvojici.
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 1, 1), h("c", 2, 1), h("d", 2, 2)])).toMatch(/stejném týmu/);
    expect(
      zkontrolujSestavu([
        { ...h("a", 1, 1), civ: 18 },
        { ...h("b", 1, 1), civ: 18 },
        { ...h("c", 1, 1), civ: 2 },
        h("d", 2, 2),
      ]),
    ).toMatch(/tutéž/);
  });

  it("všichni v jednom týmu není zápas", () => {
    expect(zkontrolujSestavu([h("a", 1, 1), h("b", 1, 2)])).toMatch(/proti komu/);
  });
});

it("civilizace musí být známá a u sdílené barvy stejná", () => {
  expect(zkontrolujSestavu([{ ...h("a", 1, 1), civ: 18 }, h("b", 2, 2)])).toBeNull();
  expect(zkontrolujSestavu([{ ...h("a", 1, 1), civ: 999 }, h("b", 2, 2)])).toMatch(/civilizace/i);
  expect(zkontrolujSestavu([{ ...h("a", 1, 1), civ: 18 }, { ...h("b", 1, 1), civ: 2 }, h("c", 2, 2), h("d", 2, 2)])).toMatch(/tutéž/);
  expect(zkontrolujSestavu([{ ...h("a", 1, 1), civ: 18 }, { ...h("b", 1, 1), civ: 18 }, h("c", 2, 2), h("d", 2, 2)])).toBeNull();
});
