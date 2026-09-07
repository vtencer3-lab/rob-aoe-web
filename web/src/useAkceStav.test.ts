import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api } from "./api.js";
import {
  DOTAZ_INTERVAL_MS,
  HLIDKA_MS,
  MAX_ODKLAD_MS,
  PRVNI_ODKLAD_MS,
  TRPELIVOST_MS,
  useAkceStav,
} from "./useAkceStav.js";

vi.mock("./api.js", () => ({ api: { akce: vi.fn() } }));

const dotaz = vi.mocked(api.akce);

const PRAZDNY_STAV = { akce: null, prihlaseni: [], zapasy: [] };

const otevrene: FalesnyZdroj[] = [];

/** jsdom EventSource neimplementuje, takže si ho podstrčíme celý. */
class FalesnyZdroj {
  onopen: (() => void) | null = null;
  onmessage: ((udalost: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  zavreno = false;
  posluchace = new Map<string, () => void>();

  constructor(readonly url: string) {
    otevrene.push(this);
  }

  addEventListener(typ: string, fn: () => void) {
    this.posluchace.set(typ, fn);
  }

  puls() {
    this.posluchace.get("puls")?.();
  }

  close() {
    this.zavreno = true;
  }
}

beforeEach(() => {
  otevrene.length = 0;
  dotaz.mockReset();
  dotaz.mockResolvedValue(PRAZDNY_STAV);
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

// Cloudflare quick tunnel drží celé tělo odpovědi, dokud neskončí — a náš
// stream schválně nekončí nikdy. Přes takový proxy tedy nedorazí ani úvodní
// snímek stavu a stránka zůstane napořád prázdná, aniž by cokoliv spadlo:
// spojení je otevřené, jen mlčí. Proto se po chvíli ticha přepneme na
// dotazování — /api/akce vrací tentýž redigovaný payload jako stream.
it("po trpělivosti bez jediné zprávy ze streamu se zeptá na /api/akce", async () => {
  const { unmount } = renderHook(() => useAkceStav());
  act(() => otevrene[0]!.onopen!());

  expect(dotaz).not.toHaveBeenCalled();

  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS));

  expect(dotaz).toHaveBeenCalledTimes(1);
  unmount();
});

it("dotazování se opakuje v intervalu, dokud stream mlčí", async () => {
  const { unmount } = renderHook(() => useAkceStav());
  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS));
  expect(dotaz).toHaveBeenCalledTimes(1);

  await act(async () => void vi.advanceTimersByTime(DOTAZ_INTERVAL_MS));
  expect(dotaz).toHaveBeenCalledTimes(2);
  await act(async () => void vi.advanceTimersByTime(DOTAZ_INTERVAL_MS * 2));
  expect(dotaz).toHaveBeenCalledTimes(4);
  unmount();
});

it("odpověď z dotazování naplní stav a stránka se tváří spojeně", async () => {
  dotaz.mockResolvedValue({
    akce: { id: 1, nazev: "večer přes tunel", stav: "prihlasovani" },
    prihlaseni: [],
    zapasy: [],
  });
  const { result, unmount } = renderHook(() => useAkceStav());

  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS));

  expect(result.current.stav?.akce?.nazev).toBe("večer přes tunel");
  expect(result.current.spojeno).toBe(true);
  unmount();
});

it("neúspěšné dotázání stránku označí za nespojenou, ale dotazování nekončí", async () => {
  // Nejdřív jedno úspěšné, aby `spojeno` bylo prokazatelně true — jinak by
  // test prošel i bez ošetření chyby, protože se startuje na false.
  const { result, unmount } = renderHook(() => useAkceStav());
  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS));
  expect(result.current.spojeno).toBe(true);

  dotaz.mockRejectedValue(new Error("server neodpovídá"));
  await act(async () => void vi.advanceTimersByTime(DOTAZ_INTERVAL_MS));
  expect(result.current.spojeno).toBe(false);
  expect(dotaz).toHaveBeenCalledTimes(2);

  // Jedno selhání dotazování neukončí.
  await act(async () => void vi.advanceTimersByTime(DOTAZ_INTERVAL_MS));
  expect(dotaz).toHaveBeenCalledTimes(3);
  unmount();
});

it("když stream promluví, dotazování se zastaví", async () => {
  const { unmount } = renderHook(() => useAkceStav());
  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS));
  expect(dotaz).toHaveBeenCalledTimes(1);

  act(() => otevrene[0]!.onmessage!({ data: JSON.stringify(PRAZDNY_STAV) }));

  await act(async () => void vi.advanceTimersByTime(DOTAZ_INTERVAL_MS * 5));
  expect(dotaz).toHaveBeenCalledTimes(1);
  unmount();
});

it("stream, který doručí včas, se dotazováním vůbec nedoprovází", async () => {
  const { unmount } = renderHook(() => useAkceStav());
  act(() => otevrene[0]!.onmessage!({ data: JSON.stringify(PRAZDNY_STAV) }));

  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS * 4));

  expect(dotaz).not.toHaveBeenCalled();
  unmount();
});

it("po odpojení komponenty se dotazování zastaví", async () => {
  const { unmount } = renderHook(() => useAkceStav());
  await act(async () => void vi.advanceTimersByTime(TRPELIVOST_MS));
  expect(dotaz).toHaveBeenCalledTimes(1);

  unmount();

  await act(async () => void vi.advanceTimersByTime(DOTAZ_INTERVAL_MS * 10));
  expect(dotaz).toHaveBeenCalledTimes(1);
});

// Spojení, které potichu umřelo (NAT, proxy, uspaný počítač): prohlížeč
// nevyhodí chybu a čekal by navždy. Server pulsuje po 25 s; když za HLIDKA_MS
// nepřijde puls ani stav, klient spojení zahodí, doptá se a otevře nové.
it("po dlouhém tichu bez pulsu spojení obnoví a doptá se", async () => {
  const { result, unmount } = renderHook(() => useAkceStav());
  act(() => otevrene[0]!.onopen!());
  act(() => otevrene[0]!.onmessage!({ data: JSON.stringify(PRAZDNY_STAV) }));
  expect(result.current.spojeno).toBe(true);

  // Pulsy hlídku natahují — dokud chodí, nic se neobnovuje.
  for (let i = 0; i < 4; i++) {
    act(() => void vi.advanceTimersByTime(HLIDKA_MS - 1000));
    act(() => otevrene[0]!.puls());
  }
  expect(otevrene).toHaveLength(1);

  await act(async () => void vi.advanceTimersByTime(HLIDKA_MS));
  expect(otevrene[0]!.zavreno).toBe(true);
  expect(otevrene).toHaveLength(2);
  expect(dotaz).toHaveBeenCalled();
  unmount();
});

it("obnov() se doptá serveru a stav převezme", async () => {
  dotaz.mockResolvedValue({ akce: { id: 2, nazev: "po akci", stav: "bezi" }, prihlaseni: [], zapasy: [] });
  const { result, unmount } = renderHook(() => useAkceStav());
  await act(async () => result.current.obnov());
  expect(result.current.stav?.akce?.nazev).toBe("po akci");
  unmount();
});
