import { beforeEach, expect, it } from "vitest";
import { PING_TRVA_MS, pingyZapasu, pridejPing, zapomenPingy } from "./pingy.js";

beforeEach(() => zapomenPingy());

// Ping svítí PING_TRVA_MS, pak z paměti sám zmizí; zápasy se nemíchají.
it("ping po čase zmizí a patří jen svému zápasu", () => {
  const t0 = Date.parse("2026-10-03T12:00:00.000Z");
  pridejPing(1, 0.5, 0.25, null, t0);
  pridejPing(1, 0.1, 0.2, "h2", t0 + 1000);
  pridejPing(2, 0.3, 0.3, null, t0);
  expect(pingyZapasu(1, t0 + 2000).map((p) => [p.x, p.y, p.komu])).toEqual([
    [0.5, 0.25, null],
    [0.1, 0.2, "h2"],
  ]);
  expect(pingyZapasu(2, t0 + 2000)).toHaveLength(1);
  expect(pingyZapasu(1, t0 + PING_TRVA_MS + 500).map((p) => p.komu)).toEqual(["h2"]);
  expect(pingyZapasu(1, t0 + PING_TRVA_MS + 1500)).toEqual([]);
});
