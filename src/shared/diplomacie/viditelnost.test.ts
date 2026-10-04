import { describe, expect, it } from "vitest";
import type { DiploData, DiploZapas, RoleHrace, StavDiplo } from "./typy.js";
import { redigujDiplo } from "./viditelnost.js";

const GM = "gm";
const role: RoleHrace[] = [
  { hracId: "n", role: "nastupce", cilHracId: null },
  { hracId: "g", role: "garda", cilHracId: null },
  { hracId: "j1", role: "najezdnik", cilHracId: null },
  { hracId: "j2", role: "najezdnik", cilHracId: null },
  { hracId: "s", role: "sasek", cilHracId: null },
  { hracId: "z", role: "zoldak", cilHracId: "g" },
  { hracId: "k", role: "kat", cilHracId: "s" },
];
const data = (stav: StavDiplo): DiploData => ({
  aktivni: null,
  verze: {},
  zapasy: [{ zapasId: 1, gmHracId: GM, stav, nastupceHracId: "n", scenarId: null, role: stav === "priprava" ? [] : role } satisfies DiploZapas],
});
const pohled = (stav: StavDiplo, kdo: string | null) => redigujDiplo(data(stav), kdo).zapasy[0]!;

describe("GM vidí všechno ve všech stavech", () => {
  for (const stav of ["priprava", "losovano", "rozeslano"] as const) {
    it(stav, () => expect(pohled(stav, GM)).toEqual(data(stav).zapasy[0]));
  }
});

describe("před rozesláním nikdo jiný nic", () => {
  for (const stav of ["priprava", "losovano"] as const) {
    for (const kdo of ["n", "k", "cizi", null]) {
      it(`${stav} / ${kdo}`, () => {
        expect(pohled(stav, kdo)).toEqual({ zapasId: 1, gmHracId: GM, stav, nastupceHracId: null, scenarId: null, role: [] });
      });
    }
  }
});

describe("po rozeslání", () => {
  const zaklad = { zapasId: 1, gmHracId: GM, stav: "rozeslano", nastupceHracId: "n", scenarId: null };
  const r = (id: string) => role.find((x) => x.hracId === id)!;

  it("Kat vidí svou roli s obětí a nic dalšího", () => expect(pohled("rozeslano", "k")).toEqual({ ...zaklad, role: [r("k")] }));
  it("Žoldák vidí svůj pakt", () => expect(pohled("rozeslano", "z")).toEqual({ ...zaklad, role: [r("z")] }));
  it("Nájezdník vidí sebe a druhého Nájezdníka", () => expect(pohled("rozeslano", "j1")).toEqual({ ...zaklad, role: [r("j1"), r("j2")] }));
  it("Šašek vidí sebe i s příznakem úpravy", () => expect(pohled("rozeslano", "s")).toEqual({ ...zaklad, role: [r("s")] }));
  it("Garda vidí jen sebe", () => expect(pohled("rozeslano", "g")).toEqual({ ...zaklad, role: [r("g")] }));
  it("Nástupce vidí jen sebe", () => expect(pohled("rozeslano", "n")).toEqual({ ...zaklad, role: [r("n")] }));
  it("cizí, admin-ne-GM i nepřihlášený vidí jen Nástupce", () => {
    for (const kdo of ["cizi", "admin", null]) expect(pohled("rozeslano", kdo)).toEqual({ ...zaklad, role: [] });
  });
  it("cizí oběť ani pakt nikde v datech", () => {
    const text = JSON.stringify(redigujDiplo(data("rozeslano"), "j1"));
    expect(text).not.toContain('"kat"');
    expect(text).not.toContain('"zoldak"');
  });
});

it("verze scénáře se nezaslepují", () => {
  const d: DiploData = { ...data("rozeslano"), verze: { 3: { id: 3 } as never }, aktivni: { id: 3 } as never };
  const v = redigujDiplo(d, null);
  expect(v.verze).toBe(d.verze);
  expect(v.aktivni).toBe(d.aktivni);
});

// Data ze hry říkají, kdo má jaký sekundární cíl a koho hra nechala bez něj
// (Nástupce) — tedy totéž, co role. Patří jen GM zápasu, v každém stavu.
describe("data ze hry vidí jen GM", () => {
  const hra = { cas: 95, prijato: "2026-10-02T20:00:00.000Z", rozdano: true, nastupceHracId: "n", hraci: [{ hracId: "n", cil: null, relikvie: 0, zije: true }] };
  const sHrou = (stav: StavDiplo): DiploData => ({ ...data(stav), zapasy: data(stav).zapasy.map((z) => ({ ...z, hra })) });

  for (const stav of ["priprava", "losovano", "rozeslano"] as const) {
    it(`${stav}: GM je má, hráč, Nástupce, admin-ne-GM ani nepřihlášený ne`, () => {
      expect(redigujDiplo(sHrou(stav), GM).zapasy[0]!.hra).toEqual(hra);
      for (const kdo of ["n", "k", "admin", null]) {
        const z = redigujDiplo(sHrou(stav), kdo).zapasy[0]!;
        expect("hra" in z).toBe(false);
        // Vlastní postup (mojeHra) ano, výpis všech hráčů ne.
        expect(JSON.stringify(z)).not.toContain("hraci");
      }
    });
  }
});

// Krále vidí GM všechny (v `hra`), hráč jen svého (`mujKral`) — v každém
// stavu, poloha vlastního krále nic neprozradí (uživatel 3. 10. 2026).
describe("král z běžící hry", () => {
  const hra = { cas: 95, prijato: "2026-10-02T20:00:00.000Z", rozdano: true, nastupceHracId: "n", hraci: [{ hracId: "n", cil: null, relikvie: 0, zije: true, kral: { x: 10, y: 20 } }, { hracId: "k", cil: null, relikvie: 0, zije: true, kral: { x: 30, y: 40 } }] };
  const sHrou = (stav: StavDiplo): DiploData => ({ ...data(stav), zapasy: data(stav).zapasy.map((z) => ({ ...z, hra })) });
  for (const stav of ["priprava", "rozeslano"] as const) {
    it(`${stav}: hráč vidí jen svého krále, GM všechny, nepřihlášený žádného`, () => {
      expect(redigujDiplo(sHrou(stav), "k").zapasy[0]!.mujKral).toEqual({ x: 30, y: 40 });
      expect(JSON.stringify(redigujDiplo(sHrou(stav), "k"))).not.toContain('"x":10');
      expect(redigujDiplo(sHrou(stav), GM).zapasy[0]!.hra!.hraci.map((h) => h.kral)).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
      expect("mujKral" in redigujDiplo(sHrou(stav), null).zapasy[0]!).toBe(false);
      expect("mujKral" in redigujDiplo(sHrou(stav), "admin").zapasy[0]!).toBe(false);
    });
  }
});

// Ping GM: GM vidí všechny, hráč jen ping pro všechny a pro sebe.
it("ping vidí GM všechny, hráč jen společné a své", () => {
  const pingy = [
    { id: 1, x: 0.1, y: 0.1, komu: null, kdy: "2026-10-03T12:00:00.000Z" },
    { id: 2, x: 0.2, y: 0.2, komu: ["k", "x"], kdy: "2026-10-03T12:00:00.000Z" },
    { id: 3, x: 0.3, y: 0.3, komu: ["n"], kdy: "2026-10-03T12:00:00.000Z" },
  ];
  const d: DiploData = { ...data("rozeslano"), zapasy: data("rozeslano").zapasy.map((z) => ({ ...z, pingy })) };
  expect(redigujDiplo(d, GM).zapasy[0]!.pingy!.map((p) => p.id)).toEqual([1, 2, 3]);
  expect(redigujDiplo(d, "k").zapasy[0]!.pingy!.map((p) => p.id)).toEqual([1, 2]);
  expect(redigujDiplo(d, null).zapasy[0]!.pingy!.map((p) => p.id)).toEqual([1]);
  const jenCizi: DiploData = { ...d, zapasy: d.zapasy.map((z) => ({ ...z, pingy: [pingy[2]!] })) };
  expect("pingy" in redigujDiplo(jenCizi, "k").zapasy[0]!).toBe(false);
});

// Vlastní cíle ze hry (panel u mapy na kartě): hráč jen své, a stav hráčů,
// na kterých závisí jeho výhra, až když zná roli (uživatel 3. 10. 2026).
describe("vlastní cíle ze hry", () => {
  const cil = { text: "zbourano : {} /150 budov", limit: 150, hodnota: 12 };
  const hra = {
    cas: 300,
    prijato: "2026-10-03T20:00:00.000Z",
    rozdano: true,
    nastupceHracId: "n",
    hraci: [
      { hracId: "n", cil: null, relikvie: 7, zije: true, drzeni: 60 },
      { hracId: "k", cil, relikvie: 1, zije: true, drzeni: 0 },
      { hracId: "s", cil: null, relikvie: 0, zije: false, drzeni: 0 },
      { hracId: "g", cil: null, relikvie: 0, zije: true, drzeni: 0 },
    ],
  };
  const sHrou = (stav: StavDiplo): DiploData => ({ ...data(stav), zapasy: data(stav).zapasy.map((z) => ({ ...z, hra })) });

  it("v přípravě: vlastní postup bez sledovaných hráčů", () => {
    expect(redigujDiplo(sHrou("priprava"), "k").zapasy[0]!.mojeHra).toEqual({ cas: 300, prijato: hra.prijato, rozdano: true, cil, relikvie: 1, drzeni: 0, sledovani: [] });
  });
  it("po rozeslání Kat vidí, jestli jeho oběť žije; cizí cíle nikde", () => {
    const z = redigujDiplo(sHrou("rozeslano"), "k").zapasy[0]!;
    expect(z.mojeHra!.sledovani).toEqual([{ hracId: "s", zije: false }]);
    expect(JSON.stringify(z)).not.toContain('"drzeni":60');
  });
  it("Garda sleduje Nástupce", () => expect(redigujDiplo(sHrou("rozeslano"), "g").zapasy[0]!.mojeHra!.sledovani).toEqual([{ hracId: "n", zije: true }]));
  it("GM, nepřihlášený a cizí mojeHra nemají", () => {
    for (const kdo of [GM, null, "cizi"]) expect("mojeHra" in redigujDiplo(sHrou("rozeslano"), kdo).zapasy[0]!).toBe(false);
  });
});

it("Garda vidí role padlých, bez cílů; jiná role ne", () => {
  const hra = { cas: 300, prijato: "2026-10-03T20:00:00.000Z", rozdano: true, nastupceHracId: "n", hraci: [{ hracId: "k", cil: null, relikvie: 0, zije: false }, { hracId: "z", cil: null, relikvie: 0, zije: true }, { hracId: "g", cil: null, relikvie: 0, zije: true }] };
  const d: DiploData = { ...data("rozeslano"), zapasy: data("rozeslano").zapasy.map((z) => ({ ...z, hra })) };
  const garda = redigujDiplo(d, "g").zapasy[0]!;
  expect(garda.odhaleneRole).toEqual([{ hracId: "k", role: "kat" }]);
  expect(JSON.stringify(garda)).not.toContain('"cilHracId":"s"');
  expect("odhaleneRole" in redigujDiplo(d, "z").zapasy[0]!).toBe(false);
});

// Náhled (uživatel 4. 10. 2026): jmenovaný divák (DIPLO_NAHLED) vidí zápas,
// ve kterém nehraje, celý — v zápase, kde hraje, jen svou roli.
describe("náhled do cizího zápasu", () => {
  const hra = { cas: 95, prijato: "2026-10-04T20:00:00.000Z", rozdano: true, nastupceHracId: "n", hraci: [{ hracId: "n", cil: null, relikvie: 0, zije: true }] };
  const sUcastniky = (): DiploData => ({ ...data("rozeslano"), zapasy: data("rozeslano").zapasy.map((z) => ({ ...z, hra, ucastnici: [GM, ...role.map((r) => r.hracId)] })) });

  it("s právem a mimo zápas: celý zápas s příznakem náhledu", () => {
    const z = redigujDiplo(sUcastniky(), "jouki", true).zapasy[0]!;
    expect(z.nahled).toBe(true);
    expect(z.role).toEqual(role);
    expect(z.hra).toEqual(hra);
  });
  it("s právem, ale v zápase hraje: jen vlastní role", () => {
    const z = redigujDiplo(sUcastniky(), "k", true).zapasy[0]!;
    expect("nahled" in z).toBe(false);
    expect(z.role).toEqual([role.find((r) => r.hracId === "k")]);
  });
  it("bez práva nic, a bez známé sestavy taky nic", () => {
    expect("nahled" in redigujDiplo(sUcastniky(), "jouki", false).zapasy[0]!).toBe(false);
    expect("nahled" in redigujDiplo(data("rozeslano"), "jouki", true).zapasy[0]!).toBe(false);
  });
});
