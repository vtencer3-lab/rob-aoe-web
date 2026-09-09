import { describe, expect, it } from "vitest";
import { AI_HRACI, aiId, JMENO_AI, jeAi, POCET_AI } from "./aiHraci.js";

describe("aiHraci", () => {
  it("nabízí tolik AI, kolik se jich vejde do lobby vedle jednoho člověka", () => {
    expect(POCET_AI).toBe(7);
    expect(AI_HRACI).toHaveLength(7);
  });

  it("každé AI má vlastní id, ale všechna se jmenují stejně", () => {
    expect(new Set(AI_HRACI.map((a) => a.steamId)).size).toBe(POCET_AI);
    expect(AI_HRACI.every((a) => a.alias === JMENO_AI)).toBe(true);
  });

  it("id vypadá jako ai:N a nikdy se nesrazí se Steam ID ani se zkušebním hráčem", () => {
    expect(aiId(1)).toBe("ai:1");
    expect(aiId(7)).toBe("ai:7");
    expect(jeAi("ai:1")).toBe(true);
    expect(jeAi("76561198014056480")).toBe(false);
    expect(jeAi("test:pepa")).toBe(false);
  });

  it("AI nemá žádná čísla — ELO ani odehrané hry", () => {
    expect(AI_HRACI.every((a) => a.elo1v1 === null && a.odehranoHer === null)).toBe(true);
  });
});
