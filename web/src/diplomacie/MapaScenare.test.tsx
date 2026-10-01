import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import { MapaScenare } from "./MapaScenare.js";

const verze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null };

it("bez startů jen obrázek", () => {
  render(<MapaScenare verze={verze} starty="zadne" />);
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" }).getAttribute("src")).toMatch(/\/api\/diplo\/scenar\/3\/minimapa\.webp$/);
  expect(screen.queryAllByTestId("start")).toHaveLength(0);
});
it("všechny starty se jmény pro GM", () => {
  render(<MapaScenare verze={verze} starty="vsechny" jmena={{ 1: "Rob" }} />);
  expect(screen.getAllByTestId("start")).toHaveLength(7);
  expect(screen.getByText("Rob")).toBeTruthy();
});
it("hráč vidí jen svůj start", () => {
  render(<MapaScenare verze={verze} starty={3} />);
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(screen.getByText("Tady začínáš")).toBeTruthy();
});
it("verze bez rozboru nic nevykreslí", () => {
  const { container } = render(<MapaScenare verze={{ ...verze, rozbor: null }} starty="zadne" />);
  expect(container.innerHTML).toBe("");
});
