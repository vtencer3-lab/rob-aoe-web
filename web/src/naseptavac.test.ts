import { expect, it } from "vitest";
import { aplikuj, najdiEmoty, najdiUzivatele, oknoOd, otevri, posun, prefiltruj, slovoPodKurzorem } from "./naseptavac.js";

const EMOTY = ["KEKW", "Kappa", "peepoHappy", "widepeepoHappy", "DinkDonk", "kekw2"];

it("slovo pod kurzorem jde od poslední mezery po kurzor", () => {
  expect(slovoPodKurzorem("ahoj kek", 8)).toEqual({ start: 5, slovo: "kek" });
  expect(slovoPodKurzorem("kek", 3)).toEqual({ start: 0, slovo: "kek" });
  expect(slovoPodKurzorem("ahoj ", 5)).toEqual({ start: 5, slovo: "" });
});

// Bez fulltextu jen začátek jména; shoda začátku a přesná velikost písmen jdou první.
it("hledá podle začátku, s fulltextem kdekoli, a řadí přesné shody první", () => {
  expect(najdiEmoty("kek", EMOTY, false)).toEqual(["kekw2", "KEKW"]);
  expect(najdiEmoty("peepo", EMOTY, false)).toEqual(["peepoHappy"]);
  expect(najdiEmoty("peepo", EMOTY, true)).toEqual(["peepoHappy", "widepeepoHappy"]);
  expect(najdiEmoty("", EMOTY, true)).toEqual([]);
});

it("@ nabídne uživatele podle začátku, holé @ všechny", () => {
  expect(najdiUzivatele("@t", ["Trokner", "Jouki", "tonda"])).toEqual(["@tonda", "@Trokner"]);
  expect(najdiUzivatele("@", ["Jouki", "jouki"])).toEqual(["@Jouki"]);
});

// Tab vloží položku + mezeru a další Tab cykluje přes tutéž pozici.
it("otevře, vloží první položku s mezerou a cykluje", () => {
  const ac = otevri("jdu kek", 7, EMOTY, [], false)!;
  expect(ac.matches).toEqual(["kekw2", "KEKW"]);
  const prvni = aplikuj("jdu kek", ac);
  expect(prvni.text).toBe("jdu kekw2 ");
  expect(prvni.pos).toBe(10);
  expect(prvni.ac.applied).toBe(true);
  const druhy = aplikuj(prvni.text, posun(prvni.ac, 1));
  expect(druhy.text).toBe("jdu KEKW ");
  expect(aplikuj(druhy.text, posun(druhy.ac, 1)).text).toBe("jdu kekw2 ");
  expect(otevri("jdu xyz", 7, EMOTY, [], false)).toBeNull();
  expect(otevri("jdu @tr", 7, EMOTY, ["Trokner"], false)?.druh).toBe("uzivatel");
});

it("přepnutí fulltextu přefiltruje proti původnímu prefixu", () => {
  const ac = otevri("peepo", 5, EMOTY, [], false)!;
  expect(prefiltruj(ac, EMOTY, true)?.matches).toEqual(["peepoHappy", "widepeepoHappy"]);
  expect(prefiltruj({ ...ac, prefix: "zzz" }, EMOTY, true)).toBeNull();
});

it("okno čtyř položek se posouvá kolem vybrané", () => {
  expect(oknoOd(0, 10, 0)).toBe(0);
  expect(oknoOd(4, 10, 0)).toBe(1);
  expect(oknoOd(9, 10, 1)).toBe(6);
  expect(oknoOd(2, 10, 6)).toBe(2);
  expect(oknoOd(3, 3, 0)).toBe(0);
});
