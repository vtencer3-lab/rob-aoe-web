import { expect, it } from "vitest";
import { obrazekEmotu, rozsekejNaEmoty, type Emote } from "./emoty.js";
import { cisloTauntu } from "../../src/shared/taunty.js";

const kekw: Emote = { jmeno: "KEKW", url: "https://cdn.7tv.app/emote/k", siroky: false, nulovaSirka: false };
const rain: Emote = { jmeno: "RainTime", url: "https://cdn.7tv.app/emote/r", siroky: false, nulovaSirka: true };
const emoty = new Map([["KEKW", kekw], ["RainTime", rain]]);

// Zero-width emote za jiným emotem je jeho vrstva; za textem obyčejný emote.
it("zero-width emote se položí na předchozí emote, za textem stojí sám", () => {
  expect(rozsekejNaEmoty("KEKW RainTime RainTime", emoty)).toEqual([{ typ: "emote", emote: kekw, vrstvy: [rain, rain] }]);
  expect(rozsekejNaEmoty("ahoj RainTime", emoty)).toEqual([
    { typ: "text", text: "ahoj " },
    { typ: "emote", emote: rain, vrstvy: [] },
  ]);
});

// Slovo, které je přesně jménem emotu, je obrázek; zbytek textu i mezery zůstanou.
it("rozseká text na slova a emoty, mezery zachová", () => {
  expect(rozsekejNaEmoty("to je KEKW fakt", emoty)).toEqual([
    { typ: "text", text: "to je " },
    { typ: "emote", emote: kekw, vrstvy: [] },
    { typ: "text", text: " fakt" },
  ]);
  expect(rozsekejNaEmoty("kekw", emoty)).toEqual([{ typ: "text", text: "kekw" }]);
  expect(rozsekejNaEmoty("KEKW KEKW", emoty).filter((k) => k.typ === "emote")).toHaveLength(2);
  expect(rozsekejNaEmoty("nic", new Map())).toEqual([{ typ: "text", text: "nic" }]);
});

it("adresa obrázku má velikost a webp", () => {
  expect(obrazekEmotu(kekw)).toBe("https://cdn.7tv.app/emote/k/2x.webp");
  expect(obrazekEmotu(kekw, 3)).toBe("https://cdn.7tv.app/emote/k/3x.webp");
});

// Taunt je jen číslo z herní tabulky; „1“ = Yes, „11“ = Laugh, mimo tabulku nic.
it("číslo tauntu pozná jen samotné číslo z tabulky", () => {
  expect(cisloTauntu("1")).toBe(1);
  expect(cisloTauntu(" 11 ")).toBe(11);
  expect(cisloTauntu("105")).toBe(105);
  expect(cisloTauntu("106")).toBeNull();
  expect(cisloTauntu("0")).toBeNull();
  expect(cisloTauntu("11 lol")).toBeNull();
});
