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
