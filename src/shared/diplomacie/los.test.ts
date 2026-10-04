import { describe, expect, it } from "vitest";
import { losujRole, odchylkySlozeni, povoleneCile, zmenCil, zmenRoli } from "./los.js";

const HRACI = ["a", "b", "c", "d", "e", "f", "g"];

function slozeni(role: ReturnType<typeof losujRole>) {
  return role.map((r) => r.role).sort();
}

describe("losujRole", () => {
  it("Nástupce zůstává a zbytek dostane 1+1+2+1+1", () => {
    const role = losujRole(HRACI, "c");
    expect(role).toHaveLength(7);
    expect(role.find((r) => r.hracId === "c")?.role).toBe("nastupce");
    expect(slozeni(role)).toEqual(["garda", "kat", "najezdnik", "najezdnik", "nastupce", "sasek", "zoldak"]);
  });

  it("Kat ani Žoldák nemají za cíl sebe ani Nástupce", () => {
    for (let i = 0; i < 500; i++) {
      for (const r of losujRole(HRACI, "a")) {
        if (r.role === "kat" || r.role === "zoldak") {
          expect(r.cilHracId).not.toBeNull();
          expect(r.cilHracId).not.toBe(r.hracId);
          expect(r.cilHracId).not.toBe("a");
        } else {
          expect(r.cilHracId).toBeNull();
        }
      }
    }
  });

  it("každá role se časem dostane ke každému hráči", () => {
    const videno = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const r of losujRole(HRACI, "a")) videno.add(`${r.hracId}:${r.role}`);
    for (const h of HRACI.filter((h) => h !== "a")) {
      for (const role of ["garda", "kat", "najezdnik", "sasek", "zoldak"]) expect(videno.has(`${h}:${role}`)).toBe(true);
    }
  });

  it("deterministická náhoda dá deterministický výsledek", () => {
    const nula = () => 0;
    expect(losujRole(HRACI, "a", nula)).toEqual(losujRole(HRACI, "a", nula));
  });

  it("Nástupce musí být mezi hráči a hráčů musí být 7", () => {
    expect(() => losujRole(HRACI, "x")).toThrow("Nástupce není mezi hráči.");
    expect(() => losujRole(HRACI.slice(0, 6), "a")).toThrow("Diplomacie potřebuje 7 hráčů (bez GM).");
  });
});

describe("úpravy GM (chování Jinova nástroje)", () => {
  const nula = () => 0;
  const zaklad = losujRole(HRACI, "a", nula);
  const kdo = (role: string) => zaklad.find((r) => r.role === role)!.hracId;

  it("povolené cíle jsou všichni kromě sebe a Nástupce", () => {
    expect(povoleneCile(HRACI, "b", "a")).toEqual(["c", "d", "e", "f", "g"]);
  });

  it("změna na Kata přidělí platný cíl, změna jinam cíl smaže", () => {
    const sasek = kdo("sasek");
    const naKata = zmenRoli(zaklad, sasek, "kat", "a", nula);
    const r = naKata.find((x) => x.hracId === sasek)!;
    expect(r.role).toBe("kat");
    expect(r.cilHracId).not.toBeNull();
    expect([sasek, "a"]).not.toContain(r.cilHracId);
    const zpet = zmenRoli(naKata, sasek, "sasek", "a", nula);
    expect(zpet.find((x) => x.hracId === sasek)!.cilHracId).toBeNull();
  });

  it("platný starý cíl se při změně Kat → Žoldák zachová", () => {
    const kat = kdo("kat");
    const cil = zaklad.find((r) => r.hracId === kat)!.cilHracId;
    expect(zmenRoli(zaklad, kat, "zoldak", "a", nula).find((x) => x.hracId === kat)!.cilHracId).toBe(cil);
  });

  it("Nástupci roli změnit nejde a nepovolený cíl se odmítne", () => {
    expect(() => zmenRoli(zaklad, "a", "kat", "a")).toThrow("Nástupce se mění výběrem Nástupce, ne rolí.");
    expect(() => zmenCil(zaklad, kdo("kat"), "a", "a")).toThrow("Tenhle cíl není povolený.");
    expect(() => zmenCil(zaklad, kdo("sasek"), "c", "a")).toThrow("Cíl má jen Popravčí a Žoldák.");
  });

  it("odchylky složení", () => {
    expect(odchylkySlozeni(zaklad)).toEqual([]);
    const triNajezdnici = zmenRoli(zaklad, kdo("kat"), "najezdnik", "a", nula);
    expect(odchylkySlozeni(triNajezdnici)).toEqual(["3× Nájezdník (má být 2×)", "chybí Popravčí"]);
    // Šašek proměněný ve hře v Gardu se počítá jako Šašek (uživatel 4. 10. 2026).
    const poPromene = zaklad.map((r) => (r.role === "sasek" ? { ...r, role: "garda" as const, puvodniRole: "sasek" as const } : r));
    expect(odchylkySlozeni(poPromene)).toEqual([]);
  });
});
