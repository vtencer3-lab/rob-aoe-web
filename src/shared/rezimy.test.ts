import { expect, it } from "vitest";
import type { Barva, SestavaVstup } from "./types.js";
import { GM_BARVA } from "./diplomacie/sestava.js";
import { vychoziTymRezimu, zamichejBarvyRezimu, zkontrolujSestavuRezimu } from "./rezimy.js";

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

/** Několik pevných „náhod“ tvaru Math.random, včetně té, která by Fisher–Yates nechala beze změny. */
const NAHODY: Array<() => number> = [() => 0, () => 0.999, () => 0.5, (() => { let i = 0; return () => ((i += 0.37) % 1); })()];
const barvy = (s: SestavaVstup[]) => s.map((x) => x.barva);
const bezBarev = (s: SestavaVstup[]) => s.map(({ barva: _barva, ...zbytek }) => zbytek);

// Klasický mód: barvy se přeskupí mezi stranami — množina použitých barev
// zůstává, kdo barvu sdílel (Coop Kings), sdílí ji dál, a nic jiného se nemění.
it("klasické zamíchání je permutace použitých barev a sdílené barvy drží pohromadě", () => {
  const coop: SestavaVstup[] = [
    { hracId: "a", barva: 1, tym: 1, civ: 5 },
    { hracId: "b", barva: 1, tym: 1, civ: 5 },
    { hracId: "c", barva: 4, tym: 2, civ: null },
    { hracId: "d", barva: 6, tym: 2, civ: null },
  ];
  expect(zkontrolujSestavuRezimu("klasicky", coop)).toBeNull();
  for (const nahoda of NAHODY) {
    const po = zamichejBarvyRezimu("klasicky", coop, nahoda);
    expect(new Set(barvy(po))).toEqual(new Set([1, 4, 6]));
    expect(po[0]!.barva).toBe(po[1]!.barva);
    expect(new Set(barvy(po)).size).toBe(3);
    expect(bezBarev(po)).toEqual(bezBarev(coop));
    expect(barvy(po)).not.toEqual(barvy(coop));
    expect(zkontrolujSestavuRezimu("klasicky", po)).toBeNull();
  }
  // Vstup se nemění — hook si drží původní sestavu pro historii kroků.
  expect(barvy(coop)).toEqual([1, 1, 4, 6]);
});

it("klasické zamíchání 1v1 barvy prohodí; jedna barva nemá co míchat", () => {
  const dva: SestavaVstup[] = [{ hracId: "a", barva: 1, tym: 1 }, { hracId: "b", barva: 2, tym: 2 }];
  for (const nahoda of NAHODY) expect(barvy(zamichejBarvyRezimu("klasicky", dva, nahoda))).toEqual([2, 1]);
  const jedna: SestavaVstup[] = [{ hracId: "a", barva: 3, tym: 1 }, { hracId: "b", barva: 3, tym: 1 }];
  expect(barvy(zamichejBarvyRezimu("klasicky", jedna, () => 0))).toEqual([3, 3]);
  expect(zamichejBarvyRezimu("klasicky", [], () => 0)).toEqual([]);
});

// Diplomacie: GM na šedé zůstává, ostatních sedm barev se rozdá mezi
// ostatní; platná sestava zůstane platná.
it("zamíchání v Diplomacii nechá GM na šedé a ostatním rozdá sedm různých barev", () => {
  for (const nahoda of NAHODY) {
    const po = zamichejBarvyRezimu("diplomacie", osm(), nahoda);
    expect(po.find((s) => s.hracId === `h${GM_BARVA}`)!.barva).toBe(GM_BARVA);
    expect([...barvy(po)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(bezBarev(po)).toEqual(bezBarev(osm()));
    expect(barvy(po)).not.toEqual(barvy(osm()));
    expect(zkontrolujSestavuRezimu("diplomacie", po)).toBeNull();
  }
});

// Rozpracovaná sestava s méně než osmi hráči: míchá se ze všech barev kromě
// šedé (ne jen z těch právě použitých), každý dostane jinou a na šedou se
// nikdo nový nedostane.
it("neúplná sestava Diplomacie míchá z barev bez šedé, každému jinou", () => {
  const ctyri: SestavaVstup[] = [
    { hracId: "gm", barva: GM_BARVA, tym: 0, civ: null },
    { hracId: "a", barva: 1, tym: 0, civ: null },
    { hracId: "b", barva: 2, tym: 0, civ: null },
    { hracId: "c", barva: 3, tym: 0, civ: null },
  ];
  for (const nahoda of NAHODY) {
    const po = zamichejBarvyRezimu("diplomacie", ctyri, nahoda);
    expect(po[0]).toEqual(ctyri[0]);
    const ostatni = barvy(po.slice(1));
    expect(new Set(ostatni).size).toBe(3);
    expect(ostatni).not.toContain(GM_BARVA);
    expect(ostatni).not.toEqual([1, 2, 3]);
    expect(bezBarev(po)).toEqual(bezBarev(ctyri));
  }
  // Bez GM v sestavě šedá zůstane volná.
  const bezGm = zamichejBarvyRezimu("diplomacie", ctyri.slice(1), () => 0);
  expect(barvy(bezGm)).not.toContain(GM_BARVA);
  expect(new Set(barvy(bezGm)).size).toBe(3);
});

// Osm hráčů a nikdo na šedé se do sedmi barev bez šedé nevejde: taková
// sestava je pro Diplomacii stejně neplatná, tak se jen přeskupí její barvy.
it("osm hráčů bez GM se v Diplomacii zamíchá mezi svými barvami", () => {
  const dveStejne = osm().map((s) => (s.barva === GM_BARVA ? { ...s, barva: 1 as Barva } : s));
  const po = zamichejBarvyRezimu("diplomacie", dveStejne, () => 0);
  expect(new Set(barvy(po))).toEqual(new Set(barvy(dveStejne)));
  expect(po).toHaveLength(8);
});
