import { expect, it, vi } from "vitest";
import { NAHLEDY_MAP, donactiDoplnkoveObrazky, nahledMapy } from "./mapyNahledy.js";

it("zná náhled podle id mapy a pro mapu bez ikony vrátí null", () => {
  expect(NAHLEDY_MAP.size).toBeGreaterThan(150);
  expect(nahledMapy(10875)).toMatch(/10875\.webp/);
  expect(nahledMapy(null)).toBeNull();
  expect(nahledMapy(999999)).toBeNull();
});

// Doplňkové obrázky nesmí zdržet hlavní stránku: prefetch až po `load`, a to
// v klidu (requestIdleCallback), ne hned.
it("prefetch odkazy přidá až po načtení stránky a v klidu", () => {
  const spust: Array<() => void> = [];
  const posluchaci: Record<string, () => void> = {};
  const head = { appendChild: vi.fn() };
  const doc = { readyState: "loading", head, createElement: () => ({}) as HTMLLinkElement };
  const okno = {
    document: doc,
    requestIdleCallback: (f: () => void) => spust.push(f),
    addEventListener: (typ: string, f: () => void) => {
      posluchaci[typ] = f;
    },
    setTimeout,
  } as unknown as Window;

  donactiDoplnkoveObrazky(["a.webp", "b.webp"], okno);
  expect(head.appendChild).not.toHaveBeenCalled();
  posluchaci["load"]!();
  expect(head.appendChild).not.toHaveBeenCalled();
  spust[0]!();
  expect(head.appendChild).toHaveBeenCalledTimes(2);
  expect(head.appendChild.mock.calls.map(([o]) => (o as HTMLLinkElement).rel)).toEqual(["prefetch", "prefetch"]);
});
