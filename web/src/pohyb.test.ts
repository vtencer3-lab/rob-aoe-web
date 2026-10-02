import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { animuj, krivka, trvani } from "./pohyb.js";
import { podvrhniPohyb, type PodvrzenyPohyb } from "./pohybTest.js";

let pohyb: PodvrzenyPohyb;
beforeEach(() => {
  vi.useFakeTimers();
  pohyb = podvrhniPohyb({ "--prechod": "220ms", "--prechod-karta": "0.46s", "--krivka": "cubic-bezier(0.2, 0.8, 0.2, 1)" });
});
afterEach(() => {
  pohyb.uklid();
  vi.useRealTimers();
});

// Časy žijí v `:root` (styl.css), ať se ladí na jednom místě; skript je jen čte.
it("trvani čte milisekundy i sekundy z proměnné :root", () => {
  expect(trvani("--prechod")).toBe(220);
  expect(trvani("--prechod-karta")).toBe(460);
  expect(krivka()).toBe("cubic-bezier(0.2, 0.8, 0.2, 1)");
});

// Testovací DOM bez stylů a `prefers-reduced-motion` (nuly v :root) jsou
// pro skript totéž: žádný pohyb.
it("chybějící nebo nulová proměnná znamená bez pohybu", () => {
  pohyb.uklid();
  expect(trvani("--prechod")).toBe(0);
  expect(krivka()).toBe("ease");
  pohyb = podvrhniPohyb({ "--prechod": "0ms" });
  expect(trvani("--prechod")).toBe(0);
});

it("bez pohybu zavolá pokračování hned a animaci nepustí", () => {
  const el = document.createElement("div");
  const potom = vi.fn();
  expect(animuj(el, [{ opacity: 0 }, { opacity: 1 }], { ms: 0 }, potom)).toBeNull();
  expect(potom).toHaveBeenCalledTimes(1);
  expect(pohyb.animace).toHaveLength(0);
});

it("po události finish pokračuje právě jednou, časovač už nic nepřidá", () => {
  const el = document.createElement("div");
  const potom = vi.fn();
  animuj(el, [{ opacity: 0 }, { opacity: 1 }], { ms: 200, krivka: "ease-out", drzet: true }, potom);
  expect(pohyb.animace).toHaveLength(1);
  expect(pohyb.animace[0]!.volby).toEqual({ duration: 200, easing: "ease-out", fill: "forwards" });
  expect(potom).not.toHaveBeenCalled();
  pohyb.animace[0]!.dokonci();
  vi.advanceTimersByTime(1000);
  expect(potom).toHaveBeenCalledTimes(1);
});

// Záložka na pozadí událost `finish` nepošle, dokud se nevrátí do popředí —
// stav komponenty na ní nesmí viset.
it("když finish nepřijde, pokračování vynutí časovač", () => {
  const el = document.createElement("div");
  const potom = vi.fn();
  animuj(el, [{ opacity: 0 }, { opacity: 1 }], { ms: 200 }, potom);
  vi.advanceTimersByTime(199);
  expect(potom).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(potom).toHaveBeenCalledTimes(1);
  pohyb.animace[0]!.dokonci();
  expect(potom).toHaveBeenCalledTimes(1);
});

it("zrušená animace pokračování taky pustí (nic nezůstane viset)", () => {
  const el = document.createElement("div");
  const potom = vi.fn();
  const animace = animuj(el, [{ opacity: 0 }, { opacity: 1 }], { ms: 200 }, potom);
  animace!.cancel();
  expect(potom).toHaveBeenCalledTimes(1);
});
