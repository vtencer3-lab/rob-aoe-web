import { describe, expect, it } from "vitest";
import { procNelze, udalostiHry, zbyva, type Schopnost } from "./schopnosti.js";
import type { RoleHrace } from "./typy.js";

const ROLE: RoleHrace[] = [
  { hracId: "n", role: "nastupce", cilHracId: null },
  { hracId: "g", role: "garda", cilHracId: null },
  { hracId: "j1", role: "najezdnik", cilHracId: null },
  { hracId: "j2", role: "najezdnik", cilHracId: null },
  { hracId: "s", role: "sasek", cilHracId: null },
  { hracId: "z", role: "zoldak", cilHracId: "g" },
  { hracId: "k", role: "kat", cilHracId: "s" },
];
const HRACI = ROLE.map((r) => r.hracId);
const D = { stav: "rozeslano" as const, role: ROLE };
let id = 0;
const s = (hracId: string, druh: Schopnost["druh"], stav: Schopnost["stav"] = "potvrzeno", cilHracId: string | null = null): Schopnost => ({ id: ++id, hracId, druh, cilHracId, stav, vytvoreno: "2026-10-03T20:00:00.000Z" });

describe("kdo smí co", () => {
  it("jen po rozeslání a jen se správnou rolí", () => {
    expect(procNelze({ ...D, stav: "losovano" }, [], HRACI, "j1", "sabotaz", "n")).toMatch(/po rozeslání/);
    expect(procNelze(D, [], HRACI, "k", "sabotaz", "n")).toMatch(/nemá/);
    expect(procNelze(D, [], HRACI, "j1", "sabotaz", "n")).toBeNull();
    expect(procNelze(D, [], HRACI, "s", "informace", null)).toBeNull();
    expect(procNelze(D, [], HRACI, "z", "doplatek", null)).toBeNull();
  });

  it("Sabotáž 1× za hru, na jednoho hráče nejvýš jedna; zamítnutá se nepočítá", () => {
    expect(procNelze(D, [s("j1", "sabotaz", "potvrzeno", "k")], HRACI, "j1", "sabotaz", "n")).toMatch(/už jsi použil/);
    expect(procNelze(D, [s("j1", "sabotaz", "zamitnuto", "k")], HRACI, "j1", "sabotaz", "k")).toBeNull();
    expect(procNelze(D, [s("j1", "sabotaz", "ceka", "k")], HRACI, "j2", "sabotaz", "k")).toMatch(/nejvýš jedna/);
    expect(procNelze(D, [], HRACI, "j1", "sabotaz", "j1")).toMatch(/jiného hráče/);
    expect(procNelze(D, [], HRACI, "j1", "sabotaz", null)).toMatch(/jiného hráče/);
  });

  it("Šašek 3 informace, jedna žádost naráz", () => {
    expect(zbyva([s("s", "informace"), s("s", "informace", "zamitnuto")], "s", "informace")).toBe(2);
    expect(procNelze(D, [s("s", "informace", "ceka")], HRACI, "s", "informace", null)).toMatch(/čeká/);
    expect(procNelze(D, [s("s", "informace"), s("s", "informace"), s("s", "informace")], HRACI, "s", "informace", null)).toMatch(/vyčerpal/);
    expect(zbyva([], "z", "doplatek")).toBeNull();
  });

  it("Šašek proměněný v Gardu už informace nežádá", () => {
    const role = ROLE.map((r) => (r.hracId === "s" ? { ...r, role: "garda" as const, puvodniRole: "sasek" as const } : r));
    expect(procNelze({ ...D, role }, [], HRACI, "s", "informace", null)).toMatch(/nemá/);
  });
});

describe("události hry", () => {
  it("pád Gardy promění žijícího Šaška, jen jednou", () => {
    expect(udalostiHry(ROLE, [{ hracId: "g", zije: false }]).povysit).toBe("s");
    expect(udalostiHry(ROLE, [{ hracId: "g", zije: false }, { hracId: "s", zije: false }]).povysit).toBeNull();
    const poPromene = ROLE.map((r) => (r.hracId === "s" ? { ...r, role: "garda" as const, puvodniRole: "sasek" as const } : r));
    expect(udalostiHry(poPromene, [{ hracId: "g", zije: false }]).povysit).toBeNull();
    expect(udalostiHry(ROLE, [{ hracId: "g", zije: true }]).povysit).toBeNull();
  });

  it("za padlého připomínka Katovi a žijící Gardě; za padlou Gardu jen Katovi", () => {
    expect(udalostiHry(ROLE, [{ hracId: "j1", zije: false }]).pripominky).toEqual([
      { druh: "kat_odmena", hracId: "k", cilHracId: "j1" },
      { druh: "garda_role", hracId: "g", cilHracId: "j1" },
    ]);
    expect(udalostiHry(ROLE, [{ hracId: "g", zije: false }]).pripominky).toEqual([{ druh: "kat_odmena", hracId: "k", cilHracId: "g" }]);
    // Padlý Kat odměnu za sebe ani za další nedostane.
    expect(udalostiHry(ROLE, [{ hracId: "k", zije: false }, { hracId: "z", zije: false }]).pripominky.filter((p) => p.druh === "kat_odmena")).toEqual([]);
  });
});

describe("Šašek po smrti Nástupce", () => {
  it("prodává, když sám nemá běžící odpočet; cizí odpočet ho nechrání", () => {
    const prodej = (hraci: { hracId: string; zije: boolean | null; relikvie?: number | null }[]) => udalostiHry(ROLE, hraci).pripominky.filter((p) => p.druh === "sasek_prodej");
    expect(prodej([{ hracId: "n", zije: false }, { hracId: "s", zije: true, relikvie: 3 }])).toEqual([{ druh: "sasek_prodej", hracId: "s", cilHracId: "n" }]);
    expect(prodej([{ hracId: "n", zije: false }, { hracId: "s", zije: true, relikvie: 3 }, { hracId: "k", zije: true, relikvie: 8 }])).toHaveLength(1);
    expect(prodej([{ hracId: "n", zije: false }, { hracId: "s", zije: true, relikvie: 7 }])).toEqual([]);
    expect(prodej([{ hracId: "n", zije: false }, { hracId: "s", zije: false, relikvie: 0 }])).toEqual([]);
    expect(prodej([{ hracId: "n", zije: true }, { hracId: "s", zije: true, relikvie: 0 }])).toEqual([]);
  });
});
