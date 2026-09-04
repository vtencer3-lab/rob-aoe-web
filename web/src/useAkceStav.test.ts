import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MAX_ODKLAD_MS, PRVNI_ODKLAD_MS, useAkceStav } from "./useAkceStav.js";

const otevrene: FalesnyZdroj[] = [];

/** jsdom EventSource neimplementuje, takže si ho podstrčíme celý. */
class FalesnyZdroj {
  onopen: (() => void) | null = null;
  onmessage: ((udalost: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  zavreno = false;

  constructor(readonly url: string) {
    otevrene.push(this);
  }

  close() {
    this.zavreno = true;
  }
}

beforeEach(() => {
  otevrene.length = 0;
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FalesnyZdroj);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("otevře stream hned po připojení komponenty", () => {
  const { unmount } = renderHook(() => useAkceStav());
  expect(otevrene).toHaveLength(1);
  expect(otevrene[0]!.url).toBe("/api/stream");
  unmount();
});

// Tohle je jádro C1: /api/stream vrací 404, dokud Rob večer nezaloží, a podle
// specifikace SSE prohlížeč po jiném kódu než 200 spojení natvrdo ukončí a sám
// ho už nikdy neotevře. Bez vlastní obnovy zůstane každý, kdo si stránku
// otevřel dřív než Rob založil akci, mrtvý až do ručního refreshe.
it("po chybě spojení otevře po odkladu nové", () => {
  const { unmount } = renderHook(() => useAkceStav());

  act(() => otevrene[0]!.onerror!());
  expect(otevrene[0]!.zavreno).toBe(true);
  expect(otevrene).toHaveLength(1); // ne okamžitě

  act(() => void vi.advanceTimersByTime(PRVNI_ODKLAD_MS));
  expect(otevrene).toHaveLength(2);
  unmount();
});

it("stránka, která se otevřela před akcí, dostane stav, jakmile akce vznikne", () => {
  const { result, unmount } = renderHook(() => useAkceStav());

  // Zatím žádná akce — server odpoví 404 a spojení padne.
  act(() => otevrene[0]!.onerror!());
  expect(result.current.stav).toBeNull();
  expect(result.current.spojeno).toBe(false);

  act(() => void vi.advanceTimersByTime(PRVNI_ODKLAD_MS));

  // Rob mezitím akci založil; obnovené spojení ji doručí bez refreshe.
  act(() =>
    otevrene[1]!.onmessage!({
      data: JSON.stringify({
        akce: { id: 1, nazev: "večer", stav: "prihlasovani" },
        prihlaseni: [],
        zapasy: [],
      }),
    }),
  );

  expect(result.current.stav?.akce?.nazev).toBe("večer");
  expect(result.current.spojeno).toBe(true);
  unmount();
});

it("odklad se zdvojnásobuje, ale nepřeroste strop", () => {
  const { unmount } = renderHook(() => useAkceStav());

  let odklad = PRVNI_ODKLAD_MS;
  for (let pokus = 1; pokus <= 8; pokus++) {
    act(() => otevrene[pokus - 1]!.onerror!());
    // O tik dřív než odklad ještě nic nového nevzniklo.
    act(() => void vi.advanceTimersByTime(odklad - 1));
    expect(otevrene).toHaveLength(pokus);
    act(() => void vi.advanceTimersByTime(1));
    expect(otevrene).toHaveLength(pokus + 1);
    odklad = Math.min(odklad * 2, MAX_ODKLAD_MS);
  }
  expect(odklad).toBe(MAX_ODKLAD_MS);
  unmount();
});

it("úspěšná zpráva odklad zase zkrátí na začátek", () => {
  const { unmount } = renderHook(() => useAkceStav());

  act(() => otevrene[0]!.onerror!());
  act(() => void vi.advanceTimersByTime(PRVNI_ODKLAD_MS));
  act(() => otevrene[1]!.onerror!());
  act(() => void vi.advanceTimersByTime(PRVNI_ODKLAD_MS * 2));
  expect(otevrene).toHaveLength(3);

  act(() =>
    otevrene[2]!.onmessage!({
      data: JSON.stringify({ akce: null, prihlaseni: [], zapasy: [] }),
    }),
  );
  act(() => otevrene[2]!.onerror!());
  act(() => void vi.advanceTimersByTime(PRVNI_ODKLAD_MS));
  expect(otevrene).toHaveLength(4);
  unmount();
});

it("po odpojení komponenty se nic dalšího neotevírá", () => {
  const { unmount } = renderHook(() => useAkceStav());
  act(() => otevrene[0]!.onerror!());
  unmount();

  act(() => void vi.advanceTimersByTime(MAX_ODKLAD_MS * 4));
  expect(otevrene).toHaveLength(1);
});
