import type { FastifyRequest } from "fastify";
import { describe, expect, it } from "vitest";
import { HttpError, requireId } from "./guards.js";

/** requireId čte jen request.params, takže mu stačí podvržený objekt. */
function pozadavek(id: unknown): FastifyRequest {
  return { params: { id } } as unknown as FastifyRequest;
}

describe("requireId", () => {
  it("propustí kladné celé číslo", () => {
    expect(requireId(pozadavek("42"))).toBe(42);
  });

  it("propustí největší ID, které unese sloupec typu integer", () => {
    expect(requireId(pozadavek("2147483647"))).toBe(2147483647);
  });

  it.each([
    ["chybějící", undefined],
    ["prázdné", ""],
    ["nečíselné", "abc"],
    ["číslo s ocasem", "1abc"],
    ["nula", "0"],
    ["záporné", "-1"],
    ["desetinné", "1.5"],
    ["nekonečno", "1e400"],
  ])("odmítne %s ID chybou 400", (_popis, hodnota) => {
    expect(() => requireId(pozadavek(hodnota))).toThrow(HttpError);
    expect(() => requireId(pozadavek(hodnota))).toThrow(/Neplatné ID/);
  });

  it("odmítne ID nad rozsahem integeru, aby se z něj nestala 500 v logu", () => {
    // Bez téhle meze projde guardem (je to kladné celé číslo), spadne až
    // v Postgresu na 22003 a vypíše se jako interní chyba do Robova logu.
    expect(() => requireId(pozadavek("2147483648"))).toThrow(/Neplatné ID/);
  });
});
