import { describe, expect, it } from "vitest";
import { joinUri, parseJoinUri, spectatorUri } from "./lobbyUri.js";

describe("parseJoinUri", () => {
  it("přijme platný join odkaz", () => {
    expect(parseJoinUri("aoe2de://0/234230181")).toEqual({ ok: true, lobbyId: "234230181" });
  });

  it("toleruje mezery kolem", () => {
    expect(parseJoinUri("  aoe2de://0/234230181\n")).toEqual({ ok: true, lobbyId: "234230181" });
  });

  it("pozná omylem vložený divácký odkaz", () => {
    expect(parseJoinUri("aoe2de://1/234230181")).toEqual({ ok: false, error: "divacky_odkaz" });
  });

  it("odmítne prázdný vstup", () => {
    expect(parseJoinUri("   ")).toEqual({ ok: false, error: "prazdne" });
  });

  it("odmítne cokoliv jiného", () => {
    expect(parseJoinUri("https://example.com/234230181")).toEqual({ ok: false, error: "spatny_tvar" });
    expect(parseJoinUri("aoe2de://0/abc")).toEqual({ ok: false, error: "spatny_tvar" });
    expect(parseJoinUri("aoe2de://0/")).toEqual({ ok: false, error: "spatny_tvar" });
  });
});

describe("odvození odkazů", () => {
  it("složí join odkaz", () => {
    expect(joinUri("234230181")).toBe("aoe2de://0/234230181");
  });

  it("složí divácký odkaz", () => {
    expect(spectatorUri("234230181")).toBe("aoe2de://1/234230181");
  });

  it("divácký odkaz vzniklý z join odkazu má stejné číslo", () => {
    const parsed = parseJoinUri("aoe2de://0/999");
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(spectatorUri(parsed.lobbyId)).toBe("aoe2de://1/999");
  });
});
