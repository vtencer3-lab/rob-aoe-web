import { describe, expect, it } from "vitest";
import ownedGames from "./fixtures/steam-ownedgames.json" with { type: "json" };
import ownedGamesSkryte from "./fixtures/steam-ownedgames-skryte.json" with { type: "json" };
import summaries from "./fixtures/steam-playersummaries.json" with { type: "json" };
import { parseOwnedGames, parsePlayerSummaries } from "./steam.js";

describe("parsePlayerSummaries", () => {
  it("vytáhne přezdívku a avatar", () => {
    const profil = parsePlayerSummaries(summaries, "76561198000635167");
    expect(profil).toEqual({
      personaName: "Vinchester",
      avatarUrl: "https://avatars.steamstatic.com/abc_full.jpg",
    });
  });

  it("vrátí null pro cizí Steam ID i pro nesmysl", () => {
    expect(parsePlayerSummaries(summaries, "76561198999999999")).toBeNull();
    expect(parsePlayerSummaries({}, "76561198000635167")).toBeNull();
  });
});

describe("parseOwnedGames", () => {
  it("převede minuty na celé hodiny", () => {
    expect(parseOwnedGames(ownedGames)).toBe(1230);
  });

  it("skrytý profil vrátí null, ne nulu", () => {
    expect(parseOwnedGames(ownedGamesSkryte)).toBeNull();
  });

  it("hráč, který AoE2 nevlastní, vrátí null", () => {
    expect(parseOwnedGames({ response: { game_count: 0, games: [] } })).toBeNull();
  });

  it("nesmyslná odpověď vrátí null", () => {
    expect(parseOwnedGames(null)).toBeNull();
  });
});
