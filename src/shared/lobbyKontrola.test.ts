import { describe, expect, it } from "vitest";
import { doplnNastaveni, velikostProHrace, zkontrolujLobby, type PoznatekLobby } from "./lobbyKontrola.js";
import { nazevMapy } from "./mapy.js";
import type { Barva, Tym } from "./types.js";

const HOST = "76561198014710095";
const JA = "76561198014056480";

const u = (steamId: string, tym: Tym, barva: Barva, alias: string) => ({ steamId, tym, barva, alias });

function lobby(cast: Partial<PoznatekLobby> = {}): PoznatekLobby {
  return {
    lobbyId: "504987862",
    hostSteamId: HOST,
    maHeslo: true,
    povolujeDivaky: true,
    sloty: [
      { steamId: HOST, barva: 1, tym: 1, pripraven: true },
      { steamId: JA, barva: 2, tym: 0, pripraven: true },
    ],
    nastaveni: { mapaId: 10875, velikost: 120, rychlost: 2, populace: 200, vitezstvi: 1, cheaty: false },
    ...cast,
  };
}

const sestava = [u(HOST, 1, 1, "Trokner"), u(JA, 0, 2, "Jouki")];
const ocekavane = doplnNastaveni(null);

describe("zkontrolujLobby", () => {
  it("lobby přesně podle zápasu projde celá", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby());
    expect(k.every((x) => x.ok)).toBe(true);
    expect(k.map((x) => x.klic)).toEqual([
      "divaci", "heslo", "hraci", `barva:${HOST}`, `tym:${HOST}`, `barva:${JA}`, `tym:${JA}`,
      "mapa", "velikost", "rychlost", "populace", "vitezstvi", "cheaty",
    ]);
  });

  it("chybějící a cizí hráče pojmenuje", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, pripraven: true }, { steamId: "cizi", barva: 3, tym: 0, pripraven: false }] }));
    const hraci = k.find((x) => x.klic === "hraci")!;
    expect(hraci.ok).toBe(false);
    expect(hraci.text).toBe("Chybí Jouki; navíc 1 cizí");
    // Kdo v lobby není, nemá řádky barvy a týmu.
    expect(k.some((x) => x.klic === `barva:${JA}`)).toBe(false);
  });

  it("špatná barva a tým říkají, co má být", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: null, tym: "?", pripraven: true }, { steamId: JA, barva: 4, tym: 2, pripraven: true }] }));
    expect(k.find((x) => x.klic === `barva:${HOST}`)!.text).toBe("Trokner má náhodnou barvu, má mít modrá");
    expect(k.find((x) => x.klic === `tym:${HOST}`)!.text).toBe("Trokner má náhodný, má mít tým 1");
    expect(k.find((x) => x.klic === `barva:${JA}`)!.text).toBe("Jouki má žlutá, má mít červená");
    expect(k.find((x) => x.klic === `tym:${JA}`)!.text).toBe("Jouki má tým 2, má mít –");
  });

  it("diváci a heslo", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ povolujeDivaky: false, maHeslo: false }));
    expect(k.find((x) => x.klic === "divaci")).toMatchObject({ ok: false, text: /Allow Spectators/ });
    expect(k.find((x) => x.klic === "heslo")).toMatchObject({ ok: false });
  });

  it("nastavení hry porovná s očekáváním a pojmenuje hodnoty", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: { mapaId: 10878, velikost: 168, rychlost: 3, populace: 150, vitezstvi: 9, cheaty: true } }));
    const t = Object.fromEntries(k.map((x) => [x.klic, x.text]));
    expect(t["mapa"]).toBe("Mapa: Black Forest, má být Arabia");
    expect(t["velikost"]).toBe("Velikost: Medium (4), má být Tiny (2)");
    expect(t["rychlost"]).toBe("Rychlost: Fast, má být Normal");
    expect(t["populace"]).toBe("Populace: 150, má být 200");
    expect(t["vitezstvi"]).toBe("Victory: Standard, má být Conquest");
    expect(t["cheaty"]).toBe("Cheaty jsou povolené, mají být vypnuté");
  });

  it("mapa null = nekontroluje se, velikost null = podle počtu hráčů", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ mapaId: null }), lobby({ nastaveni: { mapaId: 301112, velikost: 120, rychlost: 2, populace: 200, vitezstvi: 1, cheaty: false } }));
    expect(k.some((x) => x.klic === "mapa")).toBe(false);
    expect(k.find((x) => x.klic === "velikost")!.ok).toBe(true);
  });

  it("nečitelné nastavení je jeden křížek místo pádu", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: null }));
    expect(k.at(-1)).toMatchObject({ klic: "nastaveni", ok: false });
  });
});

describe("pomocné tabulky", () => {
  it("velikost podle počtu hráčů kopíruje hru", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(velikostProHrace)).toEqual([120, 120, 144, 168, 200, 200, 220, 220]);
  });

  it("mapy zná jménem, neznámé číslem", () => {
    expect(nazevMapy(10875)).toBe("Arabia");
    expect(nazevMapy(10901)).toBe("Nomad");
    expect(nazevMapy(301112)).toBe("Earth");
    expect(nazevMapy(1)).toBe("mapa č. 1");
    expect(nazevMapy(null)).toBe("libovolná");
  });
});
