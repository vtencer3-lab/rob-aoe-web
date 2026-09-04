import { afterEach, expect, it, vi } from "vitest";
import { zkontrolujProstredi } from "./config.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

function nastav(hodnoty: Record<string, string | undefined>): void {
  for (const [jmeno, hodnota] of Object.entries(hodnoty)) vi.stubEnv(jmeno, hodnota);
}

it("s kompletním prostředím projde", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: "76561198000000070",
  });
  expect(() => zkontrolujProstredi()).not.toThrow();
});

// Bez ADMIN_STEAM_ID přepíše první Robovo přihlášení po restartu jeho je_admin
// na false a režie zmizí bez chybové hlášky — a restart po nastavení BASE_URL
// na tunelovou adresu je přesně to, co říká návod v README.
it("bez ADMIN_STEAM_ID se server odmítne spustit a řekne proč", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: undefined,
  });
  expect(() => zkontrolujProstredi()).toThrow(/ADMIN_STEAM_ID/);
  expect(() => zkontrolujProstredi()).toThrow(/práva admina/);
});

it("prázdné ADMIN_STEAM_ID je totéž jako chybějící", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: "",
  });
  expect(() => zkontrolujProstredi()).toThrow(/ADMIN_STEAM_ID/);
});

it("bez DATABASE_URL se server odmítne spustit", () => {
  nastav({ DATABASE_URL: undefined, ADMIN_STEAM_ID: "76561198000000070" });
  expect(() => zkontrolujProstredi()).toThrow(/DATABASE_URL/);
});
