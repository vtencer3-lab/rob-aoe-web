import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { Barva } from "../../../src/shared/types.js";
import { kraj, MapaScenare } from "./MapaScenare.js";

const verze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null, minimapaOtisk: null, minimapaVlastni: false, sonda: null };

// Starty u levého a pravého kraje (na LLC p3 a p5) nesou třídu, podle které
// CSS posune popisek dovnitř — jinak delší jméno vyčnívá z mapy. Spodní
// kraj (p8) třídu nemá: popisek pod značkou se vejde a nad značkou by na
// telefonu narazil do popisku p6.
it("start u levého nebo pravého kraje dostane třídu kraj-*, ostatní žádnou", () => {
  expect(kraj(0.1818)).toBe(" kraj-levy");
  expect(kraj(0.8756)).toBe(" kraj-pravy");
  expect(kraj(0.4955)).toBe("");
  expect(kraj(0.2)).toBe("");
  expect(kraj(0.8)).toBe("");
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
// Route minimapy posílá roční cache; po výměně obrázku u verze (mapa ze hry
// místo terénního renderu) by prohlížeč držel starý, proto otisk v adrese.
it("adresa obrázku nese otisk minimapy, když ho verze má", () => {
  render(<MapaScenare verze={{ ...verze, minimapaOtisk: "0123456789abcdef" }} starty="zadne" />);
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" }).getAttribute("src")).toMatch(/\/api\/diplo\/scenar\/3\/minimapa\.webp\?v=0123456789abcdef$/);
});
// Obrázek ze hry už kosočtverce hráčů má: starty zůstávají (popisky se
// jmény sedí na nich), kolečko schová CSS podle třídy na figure.
it("vlastní mapa dostane třídu vlastni, starty zůstávají", () => {
  const { container } = render(<MapaScenare verze={{ ...verze, minimapaVlastni: true }} starty="vsechny" />);
  expect(container.querySelector("figure")).toHaveClass("vlastni");
  expect(screen.getAllByTestId("start")).toHaveLength(7);
});
it("verze bez rozboru nic nevykreslí", () => {
  const { container } = render(<MapaScenare verze={{ ...verze, rozbor: null }} starty="zadne" />);
  expect(container.innerHTML).toBe("");
});
