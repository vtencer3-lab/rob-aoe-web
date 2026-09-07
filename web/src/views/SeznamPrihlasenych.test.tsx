import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { PlayerView } from "../../../src/shared/types.js";
import { SeznamPrihlasenych } from "./SeznamPrihlasenych.js";

const hrac = (prepis: Partial<PlayerView> = {}): PlayerView => ({
  steamId: "76561198000000001",
  alias: "TenceR",
  steamName: "Vlasta",
  avatarUrl: null,
  country: "cz",
  elo1v1: 1847,
  eloNejvyssi: 1901,
  odehranoHer: 512,
  steamHodiny: 1230,
  posledniZapas: null,
  statyStazenyV: "2026-09-03T12:00:00.000Z",
  statyChyba: null,
  ...prepis,
});

it("ukáže jméno ve hře, ELO a hodiny", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.getByText("TenceR")).toBeInTheDocument();
  expect(screen.getByText("1847")).toBeInTheDocument();
  expect(screen.getByText("1230 h")).toBeInTheDocument();
});

it("u skrytého profilu napíše nezveřejněno", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamHodiny: null, avatarUrl: "https://avatars.steamstatic.com/x_full.jpg" })]} />);
  expect(screen.getByText("nezveřejněno")).toBeInTheDocument();
});

it("bez jména ve hře použije Steam přezdívku", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ alias: null })]} />);
  expect(screen.getByText("Vlasta")).toBeInTheDocument();
});

it("označí data, která se nepodařilo stáhnout", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ statyChyba: "Žebříček: timeout" })]} />);
  expect(screen.getByTitle(/timeout/)).toBeInTheDocument();
});

it("prázdný seznam to řekne slovy", () => {
  render(<SeznamPrihlasenych prihlaseni={[]} />);
  expect(screen.getByText(/zatím se nikdo nepřihlásil/i)).toBeInTheDocument();
});

it("bez režie nenabízí tlačítko „+“", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.queryByRole("button", { name: /vybrat hráče/i })).not.toBeInTheDocument();
});

// Admin si tabulku seřadí kliknutím na hlavičku: vzestupně → sestupně →
// vlastní pořadí (přetažením). Kdo hodnotu nemá, je vždy na konci.
it("v režii řadí kliknutím na sloupec dokola a hráče bez hodnoty dává na konec", async () => {
  const { useSkladani } = await import("../skladani.js");
  const { renderHook } = await import("@testing-library/react");
  localStorage.clear();
  const hraci = [
    hrac({ steamId: "a", alias: "Bez", elo1v1: null }),
    hrac({ steamId: "b", alias: "Nizke", elo1v1: 900 }),
    hrac({ steamId: "c", alias: "Vysoke", elo1v1: 1500 }),
  ];
  const { result } = renderHook(() => useSkladani(hraci));
  const jmena = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelectorAll("td")[1]!.textContent);
  const { rerender } = render(<SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} />);
  expect(jmena()).toEqual(["Bez", "Nizke", "Vysoke"]);

  const elo = screen.getByRole("button", { name: /1v1 elo/i });
  fireEvent.click(elo);
  rerender(<SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} />);
  expect(jmena()).toEqual(["Nizke", "Vysoke", "Bez"]);
  expect(screen.getByRole("columnheader", { name: /1v1 elo/i })).toHaveAttribute("aria-sort", "ascending");

  fireEvent.click(elo);
  expect(jmena()).toEqual(["Vysoke", "Nizke", "Bez"]);

  fireEvent.click(elo);
  expect(jmena()).toEqual(["Bez", "Nizke", "Vysoke"]);
  expect(screen.getByRole("columnheader", { name: /1v1 elo/i })).toHaveAttribute("aria-sort", "none");
});

it("hráči bez režie hlavičky klikat nemůžou", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.queryByRole("button", { name: /1v1 elo/i })).not.toBeInTheDocument();
});
