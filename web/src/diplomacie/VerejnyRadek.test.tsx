import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { VerejnyRadek } from "./VerejnyRadek.js";

// Divák mimo zápas vidí jen to, co je veřejné (spec §7, §8.2): do rozeslání
// holé „Diplomacie“, po něm i jméno Nástupce — role nikdy.
it("před rozesláním jen „Diplomacie“, po rozeslání i Nástupce", () => {
  const { rerender } = render(<VerejnyRadek zapas={zapas} data={stavDiplo("losovano", [])} />);
  expect(screen.getByText("Diplomacie")).toBeTruthy();
  expect(screen.queryByText(/Nástupce/)).toBeNull();
  rerender(<VerejnyRadek zapas={zapas} data={stavDiplo("rozeslano", [])} />);
  expect(screen.getByText("Diplomacie · Nástupce: Hráč 1")).toBeTruthy();
});

it("zápas bez dat Diplomacie dostane holý štítek", () => {
  render(<VerejnyRadek zapas={{ ...zapas, id: 99 }} data={stavDiplo("rozeslano", [])} />);
  expect(screen.getByText("Diplomacie")).toBeTruthy();
});
