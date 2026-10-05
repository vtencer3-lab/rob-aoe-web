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

/** Počet řádků mřížky, který komponenta předává CSS (dva sloupce plněné shora dolů). */
const radku = (kontejner: Element | null) => (kontejner as HTMLElement).style.getPropertyValue("--radku-stran");

// FFA s osmi stranami (každý hráč sám za sebe) se do jednoho řádku nevejde —
// kontejner dostane třídu pro mřížku, vykreslí se 8 řádků a „VS“ se vůbec
// nekreslí (u FFA nic neodděluje, jen by viselo na kraji zalomeného řádku).
// Mřížka má dva sloupce po čtyřech: vlevo 1–4, vpravo 5–8 — strany jdou
// v DOM v pořadí slotů a CSS je sází po sloupcích do čtyř řádků.
it("u víc než dvou stran dá třídu pro mřížku, vykreslí všechny strany a žádné VS", () => {
  const ucastnici = [1, 2, 3, 4, 5, 6, 7, 8].map((b) => u(String(b), b as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8, 0));
  const { container } = render(<StranyZapasu ucastnici={ucastnici} ja="1" />);
  const kontejner = container.querySelector(".vs-rozlozeni");
  expect(kontejner).toHaveClass("mnoho-stran");
  expect(screen.getAllByTestId("radek-strany")).toHaveLength(8);
  expect(screen.queryAllByText("VS")).toHaveLength(0);
  expect(radku(kontejner)).toBe("4");
  expect(screen.getAllByTestId("radek-strany").map((r) => r.querySelector(".jmeno")!.textContent)).toEqual(["Hrac1", "Hrac2", "Hrac3", "Hrac4", "Hrac5", "Hrac6", "Hrac7", "Hrac8"]);
});

// Lichý počet stran: řádků je ⌈počet / 2⌉, levý sloupec je o stranu delší.
it("u sedmi stran počítá čtyři řádky, u pěti tři", () => {
  const sedm = [1, 2, 3, 4, 5, 6, 7].map((b) => u(String(b), b as 1 | 2 | 3 | 4 | 5 | 6 | 7, 0));
  const { container, rerender } = render(<StranyZapasu ucastnici={sedm} ja="1" />);
  expect(radku(container.querySelector(".vs-rozlozeni"))).toBe("4");
  rerender(<StranyZapasu ucastnici={sedm.slice(0, 5)} ja="1" />);
  expect(radku(container.querySelector(".vs-rozlozeni"))).toBe("3");
});

// Hranice „víc než dvě strany“ (1v1v1, tým 0 = každý sám za sebe): tři strany
// musí dostat stejnou třídu jako osm, žádné VS. `> 2` by se jinak prozradilo
// jen na hranici, ne na osmi stranách.
it("u tří stran (1v1v1) taky dá třídu pro mřížku a žádné VS", () => {
  const ucastnici = [u("1", 1, 0), u("2", 2, 0), u("3", 3, 0)];
  const { container } = render(<StranyZapasu ucastnici={ucastnici} ja="1" />);
  const kontejner = container.querySelector(".vs-rozlozeni");
  expect(kontejner).toHaveClass("mnoho-stran");
  expect(screen.getAllByTestId("radek-strany")).toHaveLength(3);
  expect(screen.queryAllByText("VS")).toHaveLength(0);
  expect(radku(kontejner)).toBe("2");
});

// Dva týmy (1v1, 2v2, 4v4) musí vypadat přesně jako dnes — beze změny.
it("u dvou stran (2v2) nedá třídu pro mřížku a ukáže jedno VS", () => {
  const ucastnici = [u("1", 1, 1), u("2", 2, 1), u("3", 3, 2), u("4", 4, 2)];
  const { container } = render(<StranyZapasu ucastnici={ucastnici} ja="1" />);
  const kontejner = container.querySelector(".vs-rozlozeni");
  expect(kontejner).not.toHaveClass("mnoho-stran");
  expect(radku(kontejner)).toBe("");
  expect(screen.getAllByTestId("radek-strany")).toHaveLength(4);
  expect(screen.getAllByText("VS")).toHaveLength(1);
});
