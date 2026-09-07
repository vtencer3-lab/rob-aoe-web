import { describe, expect, it } from "vitest";
import type { UcastnikView, ZapasView } from "../../src/shared/types.js";
import { jmenoHrace, mojeZapasy, mujUcastnik, souperi, spoluhraci, verejneZapasy } from "./zapas.js";

const u = (steamId: string, tym: 1 | 2, barva: 1 | 2, jeHost = false): UcastnikView => ({
  steamId,
  alias: steamId.toUpperCase(),
  steamName: null,
  tym,
  barva,
  civ: null,
  jeHost,
  poradi: 0,
  kliknulPripojit: null,
});

const coop: ZapasView = {
  id: 1,
  poradi: 1,
  stav: "vyhlaseny",
  nazevLobby: "ROB-01",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
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
    const jeden: ZapasView = { ...coop, ucastnici: [u("a", 1, 1), u("c", 2, 2)] };
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

describe("jmenoHrace", () => {
  const kdo = (alias: string | null, steamName: string | null): UcastnikView => ({
    steamId: "76561199091641101",
    alias,
    steamName,
    tym: 1,
    barva: 1,
    civ: null,
    jeHost: false,
    poradi: 0,
    kliknulPripojit: null,
  });

  it("nejradši má alias ze žebříčku", () => {
    expect(jmenoHrace(kdo("TibbarZmr_WE", "TibbarZmr"))).toBe("TibbarZmr_WE");
  });

  // Účet bez hodnocené hry žádný alias nemá. Bez tohohle kroku svítí v sestavě
  // syrové 64bitové číslo, i když soupiska vedle jméno zná.
  it("bez aliasu vezme jméno ze Steamu", () => {
    expect(jmenoHrace(kdo(null, "TibbarZmr"))).toBe("TibbarZmr");
  });

  it("teprve když není ani jedno, ukáže Steam ID", () => {
    expect(jmenoHrace(kdo(null, null))).toBe("76561199091641101");
  });
});

describe("verejneZapasy", () => {
  const zapas = (id: number, stav: string, steamIds: string[]): ZapasView => ({
    id,
    poradi: id,
    stav,
    nazevLobby: `ROB-0${id}`,
    heslo: "",
    lobbyId: null,
    joinUri: null,
    spectatorUri: null,
    vitez: null,
    ucastnici: steamIds.map((steamId, i) => ({
      steamId,
      alias: steamId,
      steamName: null,
      tym: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      barva: (i % 2 === 0 ? 1 : 2) as 1 | 2,
      civ: null,
      jeHost: false,
      poradi: 0,
      kliknulPripojit: null,
    })),
  });

  it("anonymovi ukáže všechny běžící zápasy", () => {
    const zapasy = [zapas(1, "bezi", ["a", "b"]), zapas(2, "bezi", ["c", "d"])];
    expect(verejneZapasy(zapasy, null).map((z) => z.id)).toEqual([1, 2]);
  });

  it("zrušený zápas neukáže nikomu", () => {
    expect(verejneZapasy([zapas(1, "zruseny", ["a", "b"])], null)).toEqual([]);
  });

  // Účastník má na svůj běžící zápas plnou kartu, takže by ho řádek jen
  // zdvojil.
  it("vynechá zápas, na který má divák vlastní kartu", () => {
    const zapasy = [zapas(1, "bezi", ["a", "b"]), zapas(2, "bezi", ["c", "d"])];
    expect(verejneZapasy(zapasy, "a").map((z) => z.id)).toEqual([2]);
  });

  // Dohraný zápas z karty vypadne (mojeZapasy ho filtruje), takže by hráči po
  // zapsání výsledku zmizel z obrazovky úplně. Tady ho zachytíme.
  it("vlastní dohraný zápas ukáže, protože karta už pro něj není", () => {
    const zapasy = [zapas(1, "dohrano", ["a", "b"])];
    expect(verejneZapasy(zapasy, "a").map((z) => z.id)).toEqual([1]);
  });
});

it("zavřený dohraný zápas se divákům neukazuje", async () => {
  const { verejneZapasy } = await import("./zapas.js");
  const z = { id: 1, poradi: 1, stav: "dohrano", nazevLobby: "ROB-01", heslo: "", lobbyId: null, joinUri: null, spectatorUri: null, vitez: { tym: 1 as const }, ucastnici: [] };
  expect(verejneZapasy([z], null)).toHaveLength(1);
  expect(verejneZapasy([{ ...z, zavreny: true }], null)).toHaveLength(0);
});
