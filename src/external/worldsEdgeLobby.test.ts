import { describe, expect, it, vi } from "vitest";
import inzeraty from "./fixtures/worldsedge-advertisements.json" with { type: "json" };
import robova from "./fixtures/worldsedge-lobby-robdiesalot.json" with { type: "json" };
import { fetchAdvertisements, parseAdvertisements } from "./worldsEdgeLobby.js";

describe("parseAdvertisements", () => {
  it("převede inzerát na číslo lobby, hosta a členy podle Steam ID", () => {
    const [prvni] = parseAdvertisements(inzeraty);
    expect(prvni).toMatchObject({
      lobbyId: "504953429",
      hostSteamId: "76561198014056480",
      nazev: "Jouki in Rage's Game",
      maHeslo: false,
      povolujeDivaky: true,
      clenoveSteamIds: ["76561198014056480"],
    });
  });

  it("členy bez záznamu v avatars a nesmyslné prvky přeskočí", () => {
    const rob03 = parseAdvertisements(inzeraty).find((l) => l.nazev === "ROB-03");
    expect(rob03).toMatchObject({
      lobbyId: "504951828",
      hostSteamId: "76561198000000072",
      maHeslo: true,
      povolujeDivaky: false,
      clenoveSteamIds: ["76561198000000072", "76561198000000073"],
    });
  });

  it("host mimo Steam (Xbox) dostane null, id jako text projde", () => {
    const xbox = parseAdvertisements(inzeraty).find((l) => l.nazev === "xbox host");
    expect(xbox).toMatchObject({ lobbyId: "504951802", hostSteamId: null, clenoveSteamIds: [] });
  });

  it("inzerát bez id a nesmysly vynechá, celkem zbydou tři", () => {
    expect(parseAdvertisements(inzeraty)).toHaveLength(3);
  });

  it("nesmyslná odpověď vrátí prázdný seznam", () => {
    expect(parseAdvertisements(null)).toEqual([]);
    expect(parseAdvertisements({})).toEqual([]);
    expect(parseAdvertisements({ matches: "ne", avatars: null })).toEqual([]);
  });

  it("neplatná slotinfo a options nevyhodí, jen zůstanou prázdné", () => {
    const [l] = parseAdvertisements(inzeraty);
    expect(l!.sloty).toEqual([]);
    expect(l!.nastaveni).toBeNull();
  });
});

// Skutečný snímek lobby „RobDiesALot“ ze 7. 9. 2026: Trokner modrá + tým 1,
// Jouki červená + „–“, Black Forest, Medium, Normal, populace 150, Victory
// Standard, cheaty zapnuté, bez hesla, diváci ano. Hodnoty odpovídají tomu,
// co bylo ve hře nastavené v okamžiku snímku.
describe("parseAdvertisements — sloty a nastavení", () => {
  const [lobby] = parseAdvertisements(robova);

  it("rozbalí sloty: barvu z ScenarioPlayerIndex, tým z Team", () => {
    expect(lobby!.sloty).toEqual([
      { steamId: "76561198014710095", barva: 1, tym: 1, civ: null, pripraven: true },
      { steamId: "76561198014056480", barva: 2, tym: 0, civ: null, pripraven: true },
    ]);
  });

  it("rozbalí nastavení hry podle zmapovaných klíčů", () => {
    expect(lobby!.nastaveni).toEqual({
      mapaId: 10878,
      velikost: 168,
      rychlost: 2,
      populace: 150,
      vitezstvi: 9,
      cheaty: true,
      sadaCivilizaci: 1,
      rezim: 0,
      aiObtiznost: 3,
      suroviny: 0,
      odkrytiMapy: 0,
      pocatecniVek: 0,
      konecnyVek: 0,
      primeri: 0,
      lockTeams: true,
      teamTogether: true,
      teamPositions: false,
      sharedExploration: true,
      lockSpeed: true,
      turbo: false,
      fullTechTree: false,
      empireWars: false,
      suddenDeath: false,
      regicide: false,
      antiquity: false,
      recordGame: true,
    });
    expect(lobby!).toMatchObject({ lobbyId: "504987862", maHeslo: false, povolujeDivaky: true, hostSteamId: "76561198014710095" });
  });
});

describe("fetchAdvertisements", () => {
  it("volá findAdvertisements a odpověď rozparsuje", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(inzeraty), { status: 200 }));
    const seznam = await fetchAdvertisements(fetchImpl as unknown as typeof fetch);
    expect(seznam).toHaveLength(3);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("/advertisement/findAdvertisements?title=age2&start=0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Endpoint dává nejvýš 100 lobby na stránku; když je jich sto, je za nimi
  // další stránka. Vaše lobby na ní klidně může být — 7. 9. 2026 se to stalo.
  it("při plné stránce stáhne i další a stejné id nezdvojí", async () => {
    const plna = { matches: Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i, host_profile_id: 0, description: "x", matchmembers: [] })), avatars: [] };
    const zbytek = { matches: [{ id: 1099, host_profile_id: 0, description: "dup", matchmembers: [] }, { id: 2000, host_profile_id: 0, description: "posledni", matchmembers: [] }], avatars: [] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(plna), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(zbytek), { status: 200 }));
    const seznam = await fetchAdvertisements(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain("start=100");
    expect(seznam).toHaveLength(101);
  });

  it("neúspěšná odpověď vyhodí chybu se stavovým kódem", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchAdvertisements(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/503/);
  });
});
