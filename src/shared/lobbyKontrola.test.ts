import { describe, expect, it } from "vitest";
import { doplnNastaveni, lobbyVPoradku, velikostProHrace, VYCHOZI_NASTAVENI, zkontrolujLobby, type PoznatekLobby } from "./lobbyKontrola.js";
import { nazevMapy } from "./mapy.js";
import type { Barva, Tym } from "./types.js";

const HOST = "76561198014710095";
const JA = "76561198014056480";

const u = (steamId: string, tym: Tym, barva: Barva, alias: string) => ({ steamId, tym, barva, alias });

/** Nastavení ze hry přesně podle výchozího očekávání (velikost pro dva). */
const podleOcekavani = { ...VYCHOZI_NASTAVENI, velikost: 120 };

function lobby(cast: Partial<PoznatekLobby> = {}): PoznatekLobby {
  return {
    lobbyId: "504987862",
    hostSteamId: HOST,
    maHeslo: true,
    povolujeDivaky: true,
    sloty: [
      { steamId: HOST, barva: 1, tym: 1, civ: null, pripraven: true },
      { steamId: JA, barva: 2, tym: 0, civ: null, pripraven: true },
    ],
    nastaveni: podleOcekavani,
    ...cast,
  };
}

const sestava = [u(HOST, 1, 1, "Trokner"), u(JA, 0, 2, "Jouki")];
const ocekavane = doplnNastaveni(null);

describe("zkontrolujLobby", () => {
  it("lobby přesně podle zápasu projde celá; hlavní sekce před dalším nastavením", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby());
    expect(k.every((x) => x.ok)).toBe(true);
    expect(k.filter((x) => x.sekce === "hlavni").map((x) => x.klic)).toEqual([
      "divaci", "heslo", "hraci", `barva:${HOST}`, `tym:${HOST}`, `barva:${JA}`, `tym:${JA}`,
      "mapa", "velikost", "rychlost", "populace", "vitezstvi", "cheaty",
    ]);
    expect(k.filter((x) => x.sekce === "dalsi").map((x) => x.klic)).toEqual([
      "sadaCivilizaci", "rezim", "aiObtiznost", "suroviny", "odkrytiMapy", "pocatecniVek", "konecnyVek", "primeri",
      "lockTeams", "teamTogether", "teamPositions", "sharedExploration", "lockSpeed", "turbo", "fullTechTree",
      "empireWars", "suddenDeath", "regicide", "antiquity", "recordGame",
    ]);
    expect(lobbyVPoradku(k)).toBe(true);
  });

  it("chybějící a cizí hráče pojmenuje", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: null, pripraven: true }, { steamId: "cizi", barva: 3, tym: 0, civ: null, pripraven: false }] }));
    const hraci = k.find((x) => x.klic === "hraci")!;
    expect(hraci.ok).toBe(false);
    expect(hraci.text).toBe("Chybí Jouki; navíc 1 cizí");
    // Kdo v lobby není, nemá řádky barvy a týmu.
    expect(k.some((x) => x.klic === `barva:${JA}`)).toBe(false);
    expect(lobbyVPoradku(k)).toBe(false);
  });

  it("špatná barva říká, co má být; v 1v1 tým nevadí, dokud není stejný jako soupeřův", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: null, tym: "?", civ: null, pripraven: true }, { steamId: JA, barva: 4, tym: 2, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === `barva:${HOST}`)!.text).toBe("Trokner má náhodnou barvu, má mít modrá");
    expect(k.find((x) => x.klic === `barva:${JA}`)!.text).toBe("Jouki má žlutá, má mít červená");
    expect(k.find((x) => x.klic === `tym:${HOST}`)).toMatchObject({ ok: true, text: "Trokner: náhodný" });
    expect(k.find((x) => x.klic === `tym:${JA}`)).toMatchObject({ ok: true, text: "Jouki: tým 2" });
  });

  it("v 1v1 je chyba jen stejné číslo týmu u obou", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: null, pripraven: true }, { steamId: JA, barva: 2, tym: 1, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === `tym:${HOST}`)).toMatchObject({ ok: false, text: /Trokner a Jouki mají oba tým 1/ });
    expect(k.find((x) => x.klic === `tym:${JA}`)!.ok).toBe(false);
  });

  it("v týmové hře musí spoluhráči sdílet číslo týmu a soupeři mít jiné", () => {
    const dvaNaDva = [u(HOST, 1, 1, "Trokner"), u("b", 1, 1, "Pepa"), u(JA, 2, 2, "Jouki"), u("d", 2, 2, "Lukas")];
    const sloty = (t: Array<import("./lobbyKontrola.js").SlotLobby["tym"]>) =>
      [HOST, "b", JA, "d"].map((steamId, i) => ({ steamId, barva: (i < 2 ? 1 : 2) as Barva, tym: t[i]!, civ: null, pripraven: true }));
    const ok = zkontrolujLobby(dvaNaDva, ocekavane, lobby({ sloty: sloty([3, 3, 4, 4]) }));
    expect(ok.filter((x) => x.klic.startsWith("tym:")).every((x) => x.ok)).toBe(true);

    const spatne = zkontrolujLobby(dvaNaDva, ocekavane, lobby({ sloty: sloty([1, 0, 1, 2]) }));
    const t = Object.fromEntries(spatne.map((x) => [x.klic, x.text]));
    expect(t[`tym:b`]).toBe("Pepa má –, v týmové hře musí mít číslo týmu (stejné jako Trokner)");
    expect(t[`tym:${HOST}`]).toBe("Trokner má tým 1, Pepa ze stejného týmu má –");
    expect(t[`tym:${JA}`]).toBe("Jouki má tým 1, Lukas ze stejného týmu má tým 2");
  });

  it("předepsaná civilizace se porovná, libovolná se přeskočí", () => {
    const s2 = [{ ...sestava[0]!, civ: 18 }, sestava[1]!];
    const k = zkontrolujLobby(s2, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: 2, pripraven: true }, { steamId: JA, barva: 2, tym: 0, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === `civ:${HOST}`)).toMatchObject({ ok: false, text: "Trokner má Franks, má mít Koreans" });
    expect(k.some((x) => x.klic === `civ:${JA}`)).toBe(false);
    const ok = zkontrolujLobby(s2, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: 18, pripraven: true }] }));
    expect(ok.find((x) => x.klic === `civ:${HOST}`)).toMatchObject({ ok: true, text: "Trokner: Koreans" });
  });

  // Heslo není povinné: bez něj se hrát dá, jen do lobby může vlézt někdo
  // cizí. Je to upozornění, ne chyba — „lobby v pořádku“ na něm nestojí.
  it("diváci jsou chyba, chybějící heslo jen upozornění", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ povolujeDivaky: false, maHeslo: false }));
    expect(k.find((x) => x.klic === "divaci")).toMatchObject({ ok: false, text: /Allow Spectators/ });
    expect(k.find((x) => x.klic === "heslo")).toMatchObject({ ok: false, varovani: true, sekce: "hlavni" });
    expect(lobbyVPoradku(k)).toBe(false);
    const jenBezHesla = zkontrolujLobby(sestava, ocekavane, lobby({ maHeslo: false }));
    expect(lobbyVPoradku(jenBezHesla)).toBe(true);
  });

  it("nastavení hry porovná s očekáváním a pojmenuje hodnoty", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: { ...podleOcekavani, mapaId: 10878, velikost: 168, rychlost: 3, populace: 150, vitezstvi: 9, cheaty: true } }));
    const t = Object.fromEntries(k.map((x) => [x.klic, x.text]));
    expect(t["mapa"]).toBe("Mapa: Black Forest, má být Arabia");
    expect(t["velikost"]).toBe("Velikost: Medium (4), má být Tiny (2)");
    expect(t["rychlost"]).toBe("Rychlost: Fast, má být Normal");
    expect(t["populace"]).toBe("Populace: 150, má být 200");
    expect(t["vitezstvi"]).toBe("Victory: Standard, má být Conquest");
    expect(t["cheaty"]).toBe("Cheaty jsou povolené, mají být vypnuté");
  });

  // Další nastavení se hlásí ve své sekci a do „lobby v pořádku“ se nepočítá:
  // Rob je vidí zvlášť a rozhodne sám, jestli kvůli Team Positions zdržovat.
  it("další nastavení porovná ve vlastní sekci, hlavní verdikt neovlivní", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: { ...podleOcekavani, sadaCivilizaci: 2, primeri: 15, lockTeams: false, teamPositions: null } }));
    const t = Object.fromEntries(k.map((x) => [x.klic, x]));
    expect(t["sadaCivilizaci"]).toMatchObject({ ok: false, sekce: "dalsi", text: "Civilization Set: Chronicles, má být Age of Empires II" });
    expect(t["primeri"]).toMatchObject({ ok: false, text: "Treaty Length: 15 min, má být žádné" });
    expect(t["lockTeams"]).toMatchObject({ ok: false, text: "Lock Teams: vypnuto, má být zapnuto" });
    expect(t["teamPositions"]).toMatchObject({ ok: false, text: "Team Positions: ?, má být vypnuto" });
    expect(t["recordGame"]).toMatchObject({ ok: true, text: "Record Game: zapnuto" });
    expect(lobbyVPoradku(k)).toBe(true);
  });

  it("mapa null = nekontroluje se, velikost null = podle počtu hráčů", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ mapaId: null }), lobby({ nastaveni: { ...podleOcekavani, mapaId: 301112 } }));
    expect(k.some((x) => x.klic === "mapa")).toBe(false);
    expect(k.find((x) => x.klic === "velikost")!.ok).toBe(true);
  });

  it("nečitelné nastavení je jeden křížek místo pádu", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: null }));
    expect(k.at(-1)).toMatchObject({ klic: "nastaveni", ok: false, sekce: "hlavni" });
    expect(lobbyVPoradku(k)).toBe(false);
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
