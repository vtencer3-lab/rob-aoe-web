import { describe, expect, it } from "vitest";
import { HttpError } from "../guards.js";
import { MAX_KOUSEK_B64, rozeberKousek } from "./hlas.js";

const chyba = (telo: unknown): number | null => {
  try {
    rozeberKousek(telo);
    return null;
  } catch (e) {
    return e instanceof HttpError ? e.statusCode : -1;
  }
};

describe("rozeberKousek", () => {
  it("propustí kousek i značku konce a nic si nepřimýšlí", () => {
    expect(rozeberKousek({ sezeni: "s1", poradi: 0, data: "AAAA", mime: "audio/webm;codecs=opus" })).toEqual({ sezeni: "s1", poradi: 0, konec: false, data: "AAAA", mime: "audio/webm;codecs=opus" });
    expect(rozeberKousek({ sezeni: "s1", poradi: 3, konec: true })).toEqual({ sezeni: "s1", poradi: 3, konec: true, data: "" });
  });

  it("odmítne kousek bez sezení, bez pořadí, prázdný a moc velký", () => {
    expect(chyba({ poradi: 0, data: "AAAA" })).toBe(400);
    expect(chyba({ sezeni: "s 1", poradi: 0, data: "AAAA" })).toBe(400);
    expect(chyba({ sezeni: "s1", poradi: -1, data: "AAAA" })).toBe(400);
    expect(chyba({ sezeni: "s1", poradi: 0 })).toBe(400);
    expect(chyba({ sezeni: "s1", poradi: 0, data: "A".repeat(MAX_KOUSEK_B64 + 1) })).toBe(413);
    expect(chyba(null)).toBe(400);
  });

  // Zesiluje až přehrávač posluchače; server jen hlídá strop, ať upravený
  // klient nepustí posluchačům do uší libovolný násobek.
  it("zesílení přepošle jen v povoleném rozsahu", () => {
    const kousek = { sezeni: "s1", poradi: 0, data: "AAAA" };
    expect(rozeberKousek({ ...kousek, zesileni: 250 }).zesileni).toBe(250);
    expect(rozeberKousek({ ...kousek, zesileni: 9000 }).zesileni).toBe(400);
    expect(rozeberKousek({ ...kousek, zesileni: 100 })).not.toHaveProperty("zesileni");
    expect(rozeberKousek({ ...kousek, zesileni: 20 })).not.toHaveProperty("zesileni");
    expect(rozeberKousek({ ...kousek, zesileni: "400" })).not.toHaveProperty("zesileni");
    expect(rozeberKousek(kousek)).not.toHaveProperty("zesileni");
  });
});
