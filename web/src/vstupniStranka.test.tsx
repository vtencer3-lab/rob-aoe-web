import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App.js";
import { vstupniStranka } from "./vstupniStranka.js";

// Právní stránky nesmí tahat zbytek aplikace: žádné /api dotazy, žádné SSE.
// Padlý fetch/EventSource by tu vyhodil chybu, kterou testy uvidí — přesně to
// je kontrola, že se vykreslí opravdu jen ta stránka samotná.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Právní stránka se nesmí ptát serveru.");
    }),
  );
  vi.stubGlobal(
    "EventSource",
    vi.fn(() => {
      throw new Error("Právní stránka nesmí otevírat SSE spojení.");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("/podminky vykreslí podmínky použití bez dotazu na server", () => {
  render(vstupniStranka("/podminky"));
  expect(screen.getByRole("heading", { name: "Podmínky použití" })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(EventSource).not.toHaveBeenCalled();
});

it("/soukromi vykreslí zásady soukromí bez dotazu na server", () => {
  render(vstupniStranka("/soukromi"));
  expect(screen.getByRole("heading", { name: "Zásady soukromí" })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  expect(EventSource).not.toHaveBeenCalled();
});

// Nejlevnější způsob, jak tuhle stránku rozbít: lidi si adresu kopírují
// s koncovým lomítkem.
it("koncové lomítko vede na tutéž stránku", () => {
  render(vstupniStranka("/podminky/"));
  expect(screen.getByRole("heading", { name: "Podmínky použití" })).toBeInTheDocument();
});

// Nemontuje se skutečná App (ta by tady s podstrčeným fetch/EventSource
// spadla) — stačí ověřit, že rozcestí zvolilo správnou komponentu.
it("neznámá cesta vede na hlavní aplikaci, ne na právní stránku", () => {
  expect(vstupniStranka("/").type).toBe(App);
  expect(vstupniStranka("/neco-jineho").type).toBe(App);
});
