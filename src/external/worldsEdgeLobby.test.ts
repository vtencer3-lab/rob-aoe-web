import { describe, expect, it, vi } from "vitest";
import inzeraty from "./fixtures/worldsedge-advertisements.json" with { type: "json" };
import { fetchAdvertisements, parseAdvertisements } from "./worldsEdgeLobby.js";

describe("parseAdvertisements", () => {
  it("převede inzerát na číslo lobby, hosta a členy podle Steam ID", () => {
    const [prvni] = parseAdvertisements(inzeraty);
    expect(prvni).toEqual({
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
});

describe("fetchAdvertisements", () => {
  it("volá findAdvertisements a odpověď rozparsuje", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(inzeraty), { status: 200 }),
    );
    const seznam = await fetchAdvertisements(fetchImpl as unknown as typeof fetch);
    expect(seznam).toHaveLength(3);
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("/advertisement/findAdvertisements?title=age2");
  });

  it("neúspěšná odpověď vyhodí chybu se stavovým kódem", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchAdvertisements(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/503/);
  });
});
