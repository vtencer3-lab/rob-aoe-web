import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { VerejnyRadek } from "./VerejnyRadek.js";

// Divák mimo zápas (a Rob v režii) vidí jen to, co je veřejné (spec §7,
// §8.2): stav zápasu, po rozeslání i jméno Nástupce — role nikdy.
it("stav zápasu vždy, Nástupce až po rozeslání", () => {
  const { rerender } = render(<VerejnyRadek zapas={zapas} data={stavDiplo("priprava", [])} />);
  expect(screen.getByText("Diplomacie · příprava")).toBeTruthy();
  rerender(<VerejnyRadek zapas={zapas} data={stavDiplo("losovano", [])} />);
  expect(screen.getByText("Diplomacie · role rozdány")).toBeTruthy();
  expect(screen.queryByText(/Nástupce/)).toBeNull();
  rerender(<VerejnyRadek zapas={zapas} data={stavDiplo("rozeslano", [])} />);
  expect(screen.getByText("Diplomacie · role rozeslány · Nástupce: Hráč 1")).toBeTruthy();
});

// Admin v režii bývá i GM a tomu server Nástupce nezaslepuje (viditelnost.ts):
// řádek ho před rozesláním přesto nejmenuje — jinak by stál v kartě režie
// volně, zatímco pult GM ho kvůli streamu schovává pod zakrytou kartou.
it("nezredigovaná data GM: Nástupce se před rozesláním nejmenuje", () => {
  const gm = (stav: "priprava" | "losovano") => {
    const data = stavDiplo(stav, []);
    return { ...data, zapasy: data.zapasy.map((z) => ({ ...z, nastupceHracId: "h1" })) };
  };
  const { rerender } = render(<VerejnyRadek zapas={zapas} data={gm("priprava")} />);
  expect(screen.getByText("Diplomacie · příprava")).toBeTruthy();
  expect(screen.queryByText(/Nástupce/)).toBeNull();
  rerender(<VerejnyRadek zapas={zapas} data={gm("losovano")} />);
  expect(screen.getByText("Diplomacie · role rozdány")).toBeTruthy();
  expect(screen.queryByText(/Nástupce/)).toBeNull();
});

it("zápas bez dat Diplomacie dostane holý štítek", () => {
  render(<VerejnyRadek zapas={{ ...zapas, id: 99 }} data={stavDiplo("rozeslano", [])} />);
  expect(screen.getByText("Diplomacie")).toBeTruthy();
});
