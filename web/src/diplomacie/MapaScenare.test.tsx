import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { Barva } from "../../../src/shared/types.js";
import { kraj, MapaScenare } from "./MapaScenare.js";

const verze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null };

// Starty u kraje mapy (na LLC p3 vlevo, p5 vpravo, p8 dole) nesou třídu,
// podle které CSS posune popisek dovnitř — jinak delší jméno vyčnívá z mapy.
it("start u kraje dostane třídu kraj-*, uprostřed žádnou", () => {
  expect(kraj({ x: 0.1818, y: 0.5886 })).toBe(" kraj-levy");
  expect(kraj({ x: 0.8756, y: 0.5108 })).toBe(" kraj-pravy");
  expect(kraj({ x: 0.4955, y: 0.8795 })).toBe(" kraj-dolni");
  expect(kraj({ x: 0.1, y: 0.9 })).toBe(" kraj-levy kraj-dolni");
  expect(kraj({ x: 0.5, y: 0.5 })).toBe("");
  const starty = [{ barva: 3 as Barva, x: 0.1818, y: 0.5886 }, { barva: 5 as Barva, x: 0.5, y: 0.5 }];
  render(<MapaScenare verze={{ ...verze, rozbor: { ...ROZBOR, starty } }} starty="vsechny" />);
  const [p3, p5] = screen.getAllByTestId("start");
  expect(p3).toHaveClass("kraj-levy");
  expect(p5!.className).toBe("start barva-5");
});

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
