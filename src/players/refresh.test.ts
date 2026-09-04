import { describe, expect, it, vi } from "vitest";
import type { PlayerStatsUpdate } from "../db/players.js";
import { CACHE_TTL_MS, jeCerstve, refreshPlayerStats, type RefreshDeps } from "./refresh.js";

const ZEBRICEK = {
  alias: "TenceR",
  country: "cz",
  elo1v1: 1847,
  eloNejvyssi: 1901,
  odehranoHer: 512,
  posledniZapas: new Date("2026-08-30T10:00:00Z"),
};

function depsSe(prepis: Partial<RefreshDeps> = {}) {
  const ulozeno: PlayerStatsUpdate[] = [];
  const deps: RefreshDeps = {
    nactiZebricek: vi.fn(async () => ZEBRICEK),
    nactiProfil: vi.fn(async () => ({ personaName: "Vlasta", avatarUrl: "https://a/b.jpg" })),
    nactiHodiny: vi.fn(async () => 1230),
    uloz: vi.fn(async (_id: string, staty: PlayerStatsUpdate) => {
      ulozeno.push(staty);
    }),
    ...prepis,
  };
  return { deps, ulozeno };
}

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
      chyba: null,
    });
  });

  it("skryté hodiny uloží jako null, ne jako chybu", async () => {
    const { deps, ulozeno } = depsSe({ nactiHodiny: vi.fn(async () => null) });
    await refreshPlayerStats("76561198000000001", deps);
    expect(ulozeno[0]!.steamHodiny).toBeNull();
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
      nactiHodiny: selze,
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
