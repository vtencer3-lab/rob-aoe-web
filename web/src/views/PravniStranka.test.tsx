import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { cesta } from "../cesty.js";
import { PravniStranka } from "./PravniStranka.js";

it("vykreslí nadpis, obsah a datum poslední změny", () => {
  render(
    <PravniStranka nazev="Testovací stránka" zmeneno="17. září 2026">
      <p>Obsah stránky.</p>
    </PravniStranka>,
  );
  expect(screen.getByRole("heading", { name: "Testovací stránka" })).toBeInTheDocument();
  expect(screen.getByText("Obsah stránky.")).toBeInTheDocument();
  expect(screen.getByText(/17\. září 2026/)).toBeInTheDocument();
});

// cesta() skládá adresu podle základu webu (/aoe, /aoe/dev, …) — natvrdo
// napsaná cesta by na jouki.cz vedla mimo aktuální nasazení.
it("má cestu zpátky na web postavenou přes cesta()", () => {
  render(
    <PravniStranka nazev="Testovací stránka" zmeneno="17. září 2026">
      <p>x</p>
    </PravniStranka>,
  );
  expect(screen.getByRole("link", { name: /zpátky/i })).toHaveAttribute("href", cesta("/"));
});

it("nastaví titulek záložky podle stránky, ne obecný titulek webu", () => {
  render(
    <PravniStranka nazev="Testovací stránka" zmeneno="17. září 2026">
      <p>x</p>
    </PravniStranka>,
  );
  expect(document.title).toBe("Testovací stránka — RobDiesALot");
});
