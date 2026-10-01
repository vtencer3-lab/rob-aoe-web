import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { UcastnikView } from "../../../src/shared/types.js";
import { StranyZapasu } from "./StranyZapasu.js";

const u = (hracId: string, barva: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, tym: 0 | 1 | 2): UcastnikView => ({
  hracId,
  alias: `Hrac${hracId}`,
  platformaJmeno: null,
  tym,
  barva,
  civ: null,
  jeHost: false,
  poradi: barva,
  kliknulPripojit: null,
});

// FFA s osmi stranami (každý hráč sám za sebe) se do jednoho řádku nevejde —
// kontejner dostane třídu pro zalomení a vykreslí se 8 řádků s 7× „VS“.
it("u víc než dvou stran zalomí a vykreslí všechny strany", () => {
  const ucastnici = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => u(String(b), b as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, 0));
  const { container } = render(<StranyZapasu ucastnici={ucastnici} ja="1" />);
  const kontejner = container.querySelector(".vs-rozlozeni");
  expect(kontejner).toHaveClass("mnoho-stran");
  expect(screen.getAllByTestId("radek-strany")).toHaveLength(8);
  expect(screen.getAllByText("VS")).toHaveLength(7);
});

// Dva týmy (1v1, 2v2, 4v4) musí vypadat přesně jako dnes — bez zalomení.
it("u dvou stran (2v2) nezalamuje a ukáže jedno VS", () => {
  const ucastnici = [u("1", 1, 1), u("2", 2, 1), u("3", 3, 2), u("4", 4, 2)];
  const { container } = render(<StranyZapasu ucastnici={ucastnici} ja="1" />);
  const kontejner = container.querySelector(".vs-rozlozeni");
  expect(kontejner).not.toHaveClass("mnoho-stran");
  expect(screen.getAllByTestId("radek-strany")).toHaveLength(4);
  expect(screen.getAllByText("VS")).toHaveLength(1);
});
