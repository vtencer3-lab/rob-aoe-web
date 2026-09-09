import { describe, expect, it, vi } from "vitest";
import { ZMENA_VYSKY_MS } from "./vyska.js";

// Přejezd výšky má být plynulý, ne obřadný: kdyby trval dlouho, čekalo by se
// na něj při každém výběru hráče do sestavy.
describe("změna výšky panelu", () => {
  it("trvá krátce", () => {
    expect(ZMENA_VYSKY_MS).toBeGreaterThan(80);
    expect(ZMENA_VYSKY_MS).toBeLessThanOrEqual(300);
  });
});
