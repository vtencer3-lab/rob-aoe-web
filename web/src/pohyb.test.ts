import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { animuj, krivka, sledujZaviraniOken, trvani, usePribyli } from "./pohyb.js";
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

// Okna React při zavření odebere z DOM naráz; hlídač je vrátí jako neživou
// kulisu, CSS přehraje zavření a časovač ji odklidí.
describe("sledujZaviraniOken", () => {
  let uklid: () => void;
  beforeEach(() => {
    uklid = sledujZaviraniOken();
  });
  afterEach(() => {
    uklid();
    document.body.replaceChildren();
  });
  const okno = () => {
    const stin = document.createElement("div");
    stin.className = "prelobby-stin";
    stin.innerHTML = '<div class="prelobby-okno"><ul class="seznam-map"></ul></div>';
    document.body.appendChild(stin);
    return stin;
  };
  // MutationObserver volá až v mikroúloze.
  const poHlidaci = () => Promise.resolve();

  it("odebrané okno vrátí jako neživou kulisu a po přechodu ho odklidí", async () => {
    const stin = okno();
    stin.remove();
    await poHlidaci();
    expect(stin.isConnected).toBe(true);
    expect(stin).toHaveClass("zavira");
    expect(stin).toHaveAttribute("inert");
    expect(stin).toHaveAttribute("aria-hidden", "true");
    vi.advanceTimersByTime(219);
    expect(stin.isConnected).toBe(true);
    vi.advanceTimersByTime(1);
    expect(stin.isConnected).toBe(false);
    // Odklizení kulisy už další kulisu nevyrobí.
    await poHlidaci();
    expect(document.querySelector(".prelobby-stin")).toBeNull();
  });

  it("kulisa si drží odrolování, které měl seznam před zavřením", async () => {
    const stin = okno();
    const seznam = stin.querySelector(".seznam-map")!;
    seznam.scrollTop = 340;
    seznam.dispatchEvent(new Event("scroll"));
    stin.remove();
    seznam.scrollTop = 0;
    await poHlidaci();
    expect(seznam.scrollTop).toBe(340);
  });

  it("jiné prvky a okna bez pohybu nechá být", async () => {
    const jiny = document.createElement("div");
    document.body.appendChild(jiny);
    jiny.remove();
    await poHlidaci();
    expect(jiny.isConnected).toBe(false);
    pohyb.uklid();
    pohyb = podvrhniPohyb({ "--prechod": "0ms" });
    const stin = okno();
    stin.remove();
    await poHlidaci();
    expect(stin.isConnected).toBe(false);
  });
});

// Nové řádky seznamu, který React přeskládává (sestava): značí je skript.
describe("usePribyli", () => {
  const seznam = (klice: string[]) => {
    const ul = document.createElement("ul");
    ul.innerHTML = klice.map((k) => `<li data-klic="${k}"></li>`).join("");
    return ul;
  };
  const tridy = (ul: HTMLElement) => [...ul.children].map((li) => li.className);

  it("označí jen prvky, které přibyly, a třídu po přechodu sundá", () => {
    const ul = seznam(["a", "b"]);
    const { rerender } = renderHook(({ klice }) => usePribyli({ current: ul }, klice, "data-klic"), { initialProps: { klice: ["a", "b"] } });
    // První vykreslení neznačí nic — jinak by blikl celý seznam.
    expect(tridy(ul)).toEqual(["", ""]);
    ul.insertAdjacentHTML("beforeend", '<li data-klic="c"></li>');
    rerender({ klice: ["a", "b", "c"] });
    expect(tridy(ul)).toEqual(["", "", "pribyl"]);
    // Přeskládání nic neoznačí.
    ul.prepend(ul.lastElementChild!);
    rerender({ klice: ["c", "a", "b"] });
    vi.advanceTimersByTime(1000);
    expect(tridy(ul)).toEqual(["", "", ""]);
  });

  it("bez pohybu neznačí nic", () => {
    pohyb.uklid();
    const ul = seznam(["a"]);
    const { rerender } = renderHook(({ klice }) => usePribyli({ current: ul }, klice, "data-klic"), { initialProps: { klice: ["a"] } });
    ul.insertAdjacentHTML("beforeend", '<li data-klic="b"></li>');
    rerender({ klice: ["a", "b"] });
    expect(tridy(ul)).toEqual(["", ""]);
  });
});
