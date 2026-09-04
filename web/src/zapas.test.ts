import { describe, expect, it } from "vitest";
import type { UcastnikView, ZapasView } from "../../src/shared/types.js";
import { mojeZapasy, mujUcastnik, souperi, spoluhraci } from "./zapas.js";

const u = (steamId: string, tym: 1 | 2, barva: 1 | 2, jeHost = false): UcastnikView => ({
  steamId,
  alias: steamId.toUpperCase(),
  tym,
  barva,
  jeHost,
  kliknulPripojit: null,
});

const coop: ZapasView = {
  id: 1,
  poradi: 1,
  format: "coop_kings_2v2",
  stav: "vyhlaseny",
  nazevLobby: "ROB-01",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [u("a", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)],
};

describe("mujUcastnik", () => {
  it("najde mě", () => {
    expect(mujUcastnik(coop, "b")?.barva).toBe(1);
  });

  it("cizího nenajde", () => {
    expect(mujUcastnik(coop, "z")).toBeNull();
  });
});

describe("spoluhraci", () => {
  it("v Coop Kings je to ten se stejnou barvou, bez mě", () => {
    expect(spoluhraci(coop, "a").map((s) => s.steamId)).toEqual(["b"]);
  });

  it("v 1v1 nikdo", () => {
    const jeden: ZapasView = { ...coop, format: "1v1", ucastnici: [u("a", 1, 1), u("c", 2, 2)] };
    expect(spoluhraci(jeden, "a")).toEqual([]);
  });
});

describe("souperi", () => {
  it("jsou z druhého týmu", () => {
    expect(souperi(coop, "a").map((s) => s.steamId)).toEqual(["c", "d"]);
  });
});

describe("mojeZapasy", () => {
  it("vrátí jen ty, kde hraju", () => {
    expect(mojeZapasy([coop], "a")).toHaveLength(1);
    expect(mojeZapasy([coop], "z")).toHaveLength(0);
  });

  it("dohrané a zrušené vynechá", () => {
    expect(mojeZapasy([{ ...coop, stav: "dohrano" }], "a")).toHaveLength(0);
    expect(mojeZapasy([{ ...coop, stav: "zruseny" }], "a")).toHaveLength(0);
  });
});
