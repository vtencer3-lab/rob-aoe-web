import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VERZE } from "./verze.js";

it("verze v kódu odpovídá package.json", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  expect(VERZE).toBe(pkg.version);
});

// Pokusná větev přidává za pomlčku vlastní dvojčíslí (0.16.3-16.4);
// mimo ni musí verze zůstat obyčejná X.Y.Z.
it("verze má tvar X.Y.Z, na pokusné větvi X.Y.Z-A.B", () => {
  expect(VERZE).toMatch(/^\d+\.\d+\.\d+(-\d+\.\d+)?$/);
});
