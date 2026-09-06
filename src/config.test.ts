import { afterEach, expect, it, vi } from "vitest";
import {
  config,
  nazevCookie,
  varovaniDevPristup,
  varovaniProstredi,
  zakladniCesta,
  zkontrolujProstredi,
} from "./config.js";

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

// --- nouzový režim ADMIN_BOOTSTRAP ---

it("s ADMIN_BOOTSTRAP=true se spustí i bez ADMIN_STEAM_ID", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: undefined,
    ADMIN_BOOTSTRAP: "true",
  });
  expect(() => zkontrolujProstredi()).not.toThrow();
});

it("jiná hodnota než 'true' nouzový režim nezapne", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: undefined,
    ADMIN_BOOTSTRAP: "1",
  });
  expect(() => zkontrolujProstredi()).toThrow(/ADMIN_STEAM_ID/);
});

it("chybějící ADMIN_STEAM_ID poradí i nouzový režim", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: undefined,
    ADMIN_BOOTSTRAP: undefined,
  });
  expect(() => zkontrolujProstredi()).toThrow(/ADMIN_BOOTSTRAP/);
});

it("dokud admin neexistuje, varuje — v tu chvíli je režie volná pro kohokoliv", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: undefined,
    ADMIN_BOOTSTRAP: "true",
  });
  expect(varovaniProstredi(false)).toMatch(/první, kdo se přihlásí/);
});

it("jakmile admin existuje, mlčí — pojistka smí zůstat zapnutá natrvalo", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: undefined,
    ADMIN_BOOTSTRAP: "true",
  });
  expect(varovaniProstredi(true)).toBeNull();
});

it("s nastaveným ADMIN_STEAM_ID nevaruje, i kdyby byla pojistka zapnutá", () => {
  nastav({
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/rob_aoe",
    ADMIN_STEAM_ID: "76561198000000070",
    ADMIN_BOOTSTRAP: "true",
  });
  expect(varovaniProstredi(false)).toBeNull();
});

it("mlčí o zkušebních dveřích, dokud nejsou zapnuté", () => {
  nastav({ DEV_PRISTUP: undefined, BASE_URL: "http://localhost:3000" });
  expect(varovaniDevPristup()).toBeNull();
});

it("na localhostu o otevřených zkušebních dveřích řekne", () => {
  nastav({ DEV_PRISTUP: "true", BASE_URL: "http://localhost:3000" });
  expect(varovaniDevPristup()).toContain("obcházejí Steam");
});

it("na https řekne, že jsou dveře i tak zavřené", () => {
  nastav({ DEV_PRISTUP: "true", BASE_URL: "https://neco.trycloudflare.com" });
  expect(varovaniDevPristup()).toContain("zavřené");
});

it("základní cesta se odvozuje z BASE_URL", () => {
  expect(zakladniCesta("http://localhost:3000")).toBe("");
  expect(zakladniCesta("https://jouki.cz/aoe")).toBe("/aoe");
  expect(zakladniCesta("https://jouki.cz/aoe/")).toBe("/aoe");
  expect(zakladniCesta("https://jouki.cz/aoe/dev")).toBe("/aoe/dev");
  expect(zakladniCesta("neni url")).toBe("");
});

it("název cookie je pro každou cestu jiný, na kořeni zůstává sid", () => {
  expect(nazevCookie("")).toBe("sid");
  expect(nazevCookie("/aoe")).toBe("sid_aoe");
  expect(nazevCookie("/aoe/dev")).toBe("sid_aoe_dev");
});

it("config skládá cestu, cookie i domov z BASE_URL", () => {
  nastav({ BASE_URL: "https://jouki.cz/aoe/dev" });
  expect(config.basePath).toBe("/aoe/dev");
  expect(config.cookieNazev).toBe("sid_aoe_dev");
  expect(config.domovskaCesta).toBe("/aoe/dev/");
  nastav({ BASE_URL: undefined });
  expect(config.basePath).toBe("");
  expect(config.domovskaCesta).toBe("/");
});

it("HOST je bez proměnné loopback", () => {
  nastav({ HOST: undefined });
  expect(config.host).toBe("127.0.0.1");
  nastav({ HOST: "0.0.0.0" });
  expect(config.host).toBe("0.0.0.0");
});
