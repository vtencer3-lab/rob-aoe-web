import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VERZE } from "./verze.js";

it("verze v kódu odpovídá package.json", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
  expect(VERZE).toBe(pkg.version);
});

it("verze má tvar MAJOR.MINOR.PATCH", () => {
  expect(VERZE).toMatch(/^\d+\.\d+\.\d+$/);
});
