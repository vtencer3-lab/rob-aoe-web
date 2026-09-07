import { describe, expect, it } from "vitest";
import fixture from "./fixtures/worldsedge-personalstat.json" with { type: "json" };
import { parsePersonalStat } from "./worldsEdge.js";

describe("parsePersonalStat", () => {
  it("vytáhne jméno ve hře a 1v1 ELO", () => {
    const staty = parsePersonalStat(fixture, "76561198000635167");
    expect(staty).not.toBeNull();
    expect(staty!.alias).toBe("Oni.Vinchester");
    expect(staty!.elo1v1).toBe(2992);
    expect(staty!.eloNejvyssi).toBe(3026);
    expect(staty!.country).toBe("ru");
  });

  it("počet odehraných her je součet výher a proher v 1v1", () => {
    expect(parsePersonalStat(fixture, "76561198000635167")!.odehranoHer).toBe(1857 + 724);
  });

  it("ignoruje týmový žebříček", () => {
    // leaderboard_id 4 má rating 1975 — nesmí se použít
    expect(parsePersonalStat(fixture, "76561198000635167")!.elo1v1).not.toBe(1975);
  });

  it("vrátí všechny žebříčky hráče v pořadí ze hry (id, rating, pořadí, výhry, prohry)", () => {
    const staty = parsePersonalStat(fixture, "76561198000635167");
    expect(staty!.zebricky).toEqual([
      { id: 3, rating: 2992, nejvyssi: 3026, poradi: 1, vyhry: 1857, prohry: 724 },
      { id: 4, rating: 1975, nejvyssi: 2041, poradi: 89, vyhry: 844, prohry: 262 },
    ]);
  });

  it("převede datum posledního zápasu", () => {
    const staty = parsePersonalStat(fixture, "76561198000635167");
    expect(staty!.posledniZapas).toEqual(new Date(1788255997 * 1000));
  });

  it("vrátí null pro cizí Steam ID", () => {
    expect(parsePersonalStat(fixture, "76561198999999999")).toBeNull();
  });

  it("vrátí null pro nesmyslnou odpověď", () => {
    expect(parsePersonalStat({}, "76561198000635167")).toBeNull();
    expect(parsePersonalStat(null, "76561198000635167")).toBeNull();
    expect(parsePersonalStat("<html>chyba</html>", "76561198000635167")).toBeNull();
  });

  it("hráč bez záznamu v 1v1 žebříčku má ELO null, ale alias zůstane", () => {
    const bezZebricku = {
      statGroups: [
        { id: 5, members: [{ name: "/steam/1", alias: "Novacek", personal_statgroup_id: 5, country: "cz" }] },
      ],
      leaderboardStats: [],
    };
    const staty = parsePersonalStat(bezZebricku, "1");
    expect(staty!.alias).toBe("Novacek");
    expect(staty!.elo1v1).toBeNull();
    expect(staty!.odehranoHer).toBeNull();
  });

  it("nevyhodí výjimku, když je prvek statGroups null", () => {
    expect(parsePersonalStat({ statGroups: [null], leaderboardStats: [] }, "123")).toBeNull();
  });

  it("nevyhodí výjimku, když je prvek members null", () => {
    expect(
      parsePersonalStat({ statGroups: [{ members: [null] }], leaderboardStats: [] }, "123"),
    ).toBeNull();
  });

  it("nevyhodí výjimku, když je prvek leaderboardStats null", () => {
    const staty = parsePersonalStat(
      {
        statGroups: [
          { members: [{ name: "/steam/123", alias: "Test", personal_statgroup_id: 1 }] },
        ],
        leaderboardStats: [null],
      },
      "123",
    );
    expect(staty).not.toBeNull();
    expect(staty!.elo1v1).toBeNull();
  });
});
