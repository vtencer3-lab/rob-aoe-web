import { describe, expect, it } from "vitest";
import ownedGames from "./fixtures/steam-ownedgames.json" with { type: "json" };
import ownedGamesSkryte from "./fixtures/steam-ownedgames-skryte.json" with { type: "json" };
import summaries from "./fixtures/steam-playersummaries.json" with { type: "json" };
import { parseOwnedGames, parsePlayerSummaries, parseSteamHra } from "./steam.js";

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

  it("nevyhodí výjimku, když je prvek players null", () => {
    expect(parsePlayerSummaries({ response: { players: [null] } }, "1")).toBeNull();
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

  it("nevyhodí výjimku, když je prvek games null", () => {
    expect(parseOwnedGames({ response: { games: [null] } })).toBeNull();
  });

  it("hráč, který hru vlastní, ale nikdy nehrál, vrátí 0, ne null", () => {
    expect(parseOwnedGames({ response: { games: [{ appid: 813780, playtime_forever: 0 }] } })).toBe(0);
  });
});

// Skrytou a prázdnou knihovnu Steam rozlišuje jen tvarem odpovědi: skrytá je
// `response: {}`, veřejná má `game_count` i s nulou. Na tom stojí otazník
// versus vykřičník u ikony hry.
describe("parseSteamHra", () => {
  it("hráč s hrou: hodiny a `ma`", () => {
    expect(parseSteamHra(ownedGames)).toEqual({ hodiny: 1230, vlastnictvi: "ma" });
  });

  it("skrytá knihovna: bez hodin a `soukromy`", () => {
    expect(parseSteamHra(ownedGamesSkryte)).toEqual({ hodiny: null, vlastnictvi: "soukromy" });
    expect(parseSteamHra(null)).toEqual({ hodiny: null, vlastnictvi: "soukromy" });
  });

  it("veřejná knihovna bez hry: `nema`", () => {
    expect(parseSteamHra({ response: { game_count: 0, games: [] } })).toEqual({ hodiny: null, vlastnictvi: "nema" });
  });

  it("hru má, ale nikdy nehrál: nula hodin a `ma`", () => {
    expect(parseSteamHra({ response: { game_count: 1, games: [{ appid: 813780, playtime_forever: 0 }] } })).toEqual({
      hodiny: 0,
      vlastnictvi: "ma",
    });
  });
});
