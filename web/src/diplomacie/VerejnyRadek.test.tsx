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

it("zápas bez dat Diplomacie dostane holý štítek", () => {
  render(<VerejnyRadek zapas={{ ...zapas, id: 99 }} data={stavDiplo("rozeslano", [])} />);
  expect(screen.getByText("Diplomacie")).toBeTruthy();
});
