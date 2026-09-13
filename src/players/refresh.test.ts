import { describe, expect, it, vi } from "vitest";
import type { PlayerStatsUpdate } from "../db/players.js";
import { CACHE_TTL_MS, jeCerstve, maCerstveStaty, refreshPlayerStats, type RefreshDeps } from "./refresh.js";

const ZEBRICEK = {
  alias: "TenceR",
  country: "cz",
  elo1v1: 1847,
  eloNejvyssi: 1901,
  odehranoHer: 512,
  zebricky: [],
  posledniZapas: new Date("2026-08-30T10:00:00Z"),
};

function depsSe(prepis: Partial<RefreshDeps> = {}) {
  const ulozeno: PlayerStatsUpdate[] = [];
  const deps: RefreshDeps = {
    nactiZebricek: vi.fn(async () => ZEBRICEK),
    nactiProfil: vi.fn(async () => ({ personaName: "Vlasta", avatarUrl: "https://a/b.jpg" })),
    nactiHru: vi.fn(async () => ({ hodiny: 1230, vlastnictvi: "ma" as const })),
    uloz: vi.fn(async (_id: string, staty: PlayerStatsUpdate) => {
      ulozeno.push(staty);
    }),
    ...prepis,
  };
  return { deps, ulozeno };
}

// Řádek stažený serverem, který žebříčky ještě neznal, je čerstvý jen podle
// času. Bez žebříčků se obnovit musí, jinak karta hráče čtvrt hodiny lže.
describe("maCerstveStaty", () => {
  const ted = new Date("2026-09-07T22:36:00Z");
  const pred = new Date(ted.getTime() - 60_000);

  it("bez hráče nebo bez žebříčků není čerstvé ani minutu po stažení", () => {
    expect(maCerstveStaty(null, ted)).toBe(false);
    expect(maCerstveStaty({ statyStazenyV: pred, zebricky: null }, ted)).toBe(false);
  });

  it("se žebříčky rozhoduje stáří", () => {
    expect(maCerstveStaty({ statyStazenyV: pred, zebricky: [] }, ted)).toBe(true);
    expect(maCerstveStaty({ statyStazenyV: new Date(ted.getTime() - CACHE_TTL_MS - 1), zebricky: [] }, ted)).toBe(false);
  });
});

describe("jeCerstve", () => {
  const ted = new Date("2026-09-03T12:00:00Z");

  it("nikdy nestažené není čerstvé", () => {
    expect(jeCerstve(null, ted)).toBe(false);
  });

  it("čerstvé je do patnácti minut", () => {
    expect(jeCerstve(new Date(ted.getTime() - CACHE_TTL_MS + 1000), ted)).toBe(true);
    expect(jeCerstve(new Date(ted.getTime() - CACHE_TTL_MS - 1000), ted)).toBe(false);
  });
});

describe("refreshPlayerStats", () => {
  it("uloží všechno z obou zdrojů", async () => {
    const { deps, ulozeno } = depsSe();
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno).toHaveLength(1);
    expect(ulozeno[0]).toMatchObject({
      alias: "TenceR",
      elo1v1: 1847,
      odehranoHer: 512,
      steamName: "Vlasta",
      steamHodiny: 1230,
      steamHra: "ma",
      chyba: null,
    });
  });

  it("skrytou knihovnu uloží jako null hodin a `soukromy`, ne jako chybu", async () => {
    const { deps, ulozeno } = depsSe({ nactiHru: vi.fn(async () => ({ hodiny: null, vlastnictvi: "soukromy" as const })) });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.steamHodiny).toBeNull();
    expect(ulozeno[0]!.steamHra).toBe("soukromy");
    expect(ulozeno[0]!.chyba).toBeNull();
  });

  it("pád žebříčku nevyhodí výjimku a zapíše se jako chyba", async () => {
    const { deps, ulozeno } = depsSe({
      nactiZebricek: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
    expect(ulozeno[0]!.chyba).toMatch(/žebříček/i);
  });

  it("pád žebříčku nezabrání uložení dat ze Steamu", async () => {
    const { deps, ulozeno } = depsSe({
      nactiZebricek: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.steamName).toBe("Vlasta");
    expect(ulozeno[0]!.steamHodiny).toBe(1230);
  });

  it("pád obou zdrojů pořád jen zapíše chybu", async () => {
    const selze = vi.fn(async () => {
      throw new Error("mimo provoz");
    });
    const { deps, ulozeno } = depsSe({
      nactiZebricek: selze,
      nactiProfil: selze,
      nactiHru: selze,
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
    expect(ulozeno[0]!.chyba).toBeTruthy();
  });

  it("selhání zápisu do databáze nevyhodí výjimku ven", async () => {
    const { deps } = depsSe({
      uloz: vi.fn(async () => {
        throw new Error("databáze spí");
      }),
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
  });

  // Test výše používá `async`, tedy odmítnutý příslib. Synchronní pád (dřív, než
  // příslib vůbec vznikne) je jiná noha: `.catch()` na něj nedosáhne, protože
  // visí až na vráceném příslibu. Zápis se navíc zkouší dvakrát — jednou
  // v hlavní cestě, podruhé v záchytném handleru — a projít musí obě.
  it("synchronní pád zápisu (ne odmítnutý příslib) nevyhodí výjimku ven", async () => {
    const uloz = vi.fn(() => {
      throw new Error("databáze spí");
    });
    const { deps } = depsSe({ uloz });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
    expect(uloz).toHaveBeenCalledTimes(2);
  });

  it("neznámý hráč v žebříčku se uloží bez aliasu a bez chyby", async () => {
    const { deps, ulozeno } = depsSe({ nactiZebricek: vi.fn(async () => null) });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.alias).toBeNull();
    expect(ulozeno[0]!.chyba).toBeNull();
  });

  it("synchronní pád závislosti (ne odmítnutý příslib) nevyhodí výjimku ven a zapíše chybu", async () => {
    const { deps, ulozeno } = depsSe({
      nactiZebricek: vi.fn(() => {
        throw new Error("selhalo dřív, než vznikl příslib");
      }),
    });
    await expect(refreshPlayerStats("76561198000000001", deps)).resolves.toBeUndefined();
    expect(ulozeno).toHaveLength(1);
    expect(ulozeno[0]!.chyba).toMatch(/obnova selhala/i);
  });
});
