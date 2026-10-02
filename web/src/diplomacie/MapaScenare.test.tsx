import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { Barva } from "../../../src/shared/types.js";
import { MapaScenare, popiskyStartu, type PopiskyStartu } from "./MapaScenare.js";

const verze = { id: 3, jmenoSouboru: "LLC.aoe2scenario", jmenoHry: "JIN_DIPLO_3.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null, minimapaOtisk: null, minimapaVlastni: false, sonda: null };

const start = (barva: Barva) => screen.getAllByTestId("start").find((s) => s.classList.contains(`barva-${barva}`))!;

it("bez popisků jen obrázek", () => {
  render(<MapaScenare verze={verze} />);
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" }).getAttribute("src")).toMatch(/\/api\/diplo\/scenar\/3\/minimapa\.webp$/);
  expect(screen.queryAllByTestId("start")).toHaveLength(0);
});

// Pult GM a správa scénáře: popisek u každého startu — jméno, kdo na barvě
// sedí, jinak název barvy. Obyčejný popisek nemá žádnou třídu druhu.
it("všechny starty: jméno hráče, bez něj název barvy", () => {
  render(<MapaScenare verze={verze} popisky={popiskyStartu(verze, { 1: "Rob" })} />);
  expect(screen.getAllByTestId("start")).toHaveLength(7);
  expect(start(1).textContent).toBe("Rob");
  expect(start(2).textContent).toBe("červená");
  expect(start(2).className).toBe("start barva-2");
  // Poloha jde do stylu i jako `--x`: podle ní CSS drží popisek uvnitř mapy.
  expect(start(2).style.left).toBe("50%");
  expect(start(2).style.getPropertyValue("--x")).toBe("0.5");
});

// Kreslí se jen starty, ke kterým volající dal popisek — karta role dává
// vlastní start a hráče, ke kterým má divák vztah.
it("start bez popisku se nekreslí", () => {
  render(<MapaScenare verze={verze} popisky={{ 3: { text: "Tady začínáš", druhy: ["ja"] } }} />);
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(start(3)).toHaveClass("druh-ja");
  expect(screen.getByText("Tady začínáš")).toHaveAttribute("title", "Tady začínáš");
});

// Druh popisku je třída na značce (vzhled je v CSS) a bublina říká slovy,
// čím hráč je. Korunu má jen Nástupce císaře.
it("druhy popisků dávají třídy, bublinu a Nástupci korunu", () => {
  const popisky: PopiskyStartu = {
    1: { text: "Tady začínáš", druhy: ["ja"] },
    2: { text: "Tonda", druhy: ["spojenec"] },
    3: { text: "Zdena", druhy: ["obet"] },
    4: { text: "Karel", druhy: ["pouto"] },
    5: { text: "Jana", druhy: ["nastupce"] },
  };
  render(<MapaScenare verze={verze} popisky={popisky} />);
  expect(start(2).className).toBe("start barva-2 druh-spojenec");
  expect(start(3).className).toBe("start barva-3 druh-obet");
  expect(start(4).className).toBe("start barva-4 druh-pouto");
  expect(start(5).className).toBe("start barva-5 druh-nastupce");
  expect(screen.getByText("Tonda")).toHaveAttribute("title", "Tonda — druhý Nájezdník");
  expect(screen.getByText("Zdena")).toHaveAttribute("title", "Zdena — tvá oběť");
  expect(screen.getByText("Karel")).toHaveAttribute("title", "Karel — pokrevní pouto");
  expect(screen.getByText("Jana")).toHaveAttribute("title", "Jana — Nástupce císaře");
  const koruny = screen.getAllByRole("img", { name: "Nástupce císaře" });
  expect(koruny).toHaveLength(1);
  expect(koruny[0]).toHaveClass("koruna");
  expect(start(5)).toContainElement(koruny[0]!);
});

// Jeden hráč může být pro diváka víc věcí naráz: oběť, která je Nástupcem,
// má korunu i červené jméno; vlastní start Nástupce korunu nad „Tady
// začínáš“. Třídy jdou v pevném pořadí, ať se o ně CSS může opřít.
it("jeden start nese víc druhů naráz", () => {
  const { rerender } = render(<MapaScenare verze={verze} popisky={{ 3: { text: "Zdena", druhy: ["obet", "nastupce"] } }} />);
  expect(start(3).className).toBe("start barva-3 druh-nastupce druh-obet");
  expect(start(3).querySelector("img.koruna")).toBeTruthy();
  expect(screen.getByText("Zdena")).toHaveAttribute("title", "Zdena — Nástupce císaře, tvá oběť");
  rerender(<MapaScenare verze={verze} popisky={{ 3: { text: "Tady začínáš", druhy: ["ja", "nastupce"] } }} />);
  expect(start(3).className).toBe("start barva-3 druh-nastupce druh-ja");
  expect(start(3).querySelector("img.koruna")).toBeTruthy();
  expect(screen.getByText("Tady začínáš")).toHaveAttribute("title", "Tady začínáš — Nástupce císaře");
});

// Kdo nemá v rozboru start (šedá), se nekreslí; víc spojenců = „další Nájezdník“.
it("start bez pozice v rozboru se nekreslí; víc spojenců je „další“", () => {
  const { rerender } = render(<MapaScenare verze={verze} popisky={{ 1: { text: "Tady začínáš", druhy: ["ja"] }, 7: { text: "GM", druhy: ["nastupce"] } }} />);
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(screen.queryByRole("img", { name: "Nástupce císaře" })).toBeNull();
  rerender(<MapaScenare verze={verze} popisky={{ 2: { text: "Tonda", druhy: ["spojenec"] }, 4: { text: "Karel", druhy: ["spojenec"] } }} />);
  expect(screen.getByText("Tonda")).toHaveAttribute("title", "Tonda — další Nájezdník");
});

// Route minimapy posílá roční cache; po výměně obrázku u verze (mapa ze hry
// místo terénního renderu) by prohlížeč držel starý, proto otisk v adrese.
it("adresa obrázku nese otisk minimapy, když ho verze má", () => {
  render(<MapaScenare verze={{ ...verze, minimapaOtisk: "0123456789abcdef" }} />);
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" }).getAttribute("src")).toMatch(/\/api\/diplo\/scenar\/3\/minimapa\.webp\?v=0123456789abcdef$/);
});
// Obrázek ze hry už kosočtverce hráčů má: starty zůstávají (popisky se
// jmény sedí na nich), kolečko schová CSS podle třídy na figure.
it("vlastní mapa dostane třídu vlastni, starty zůstávají", () => {
  const vlastni = { ...verze, minimapaVlastni: true };
  const { container } = render(<MapaScenare verze={vlastni} popisky={popiskyStartu(vlastni)} />);
  expect(container.querySelector("figure")).toHaveClass("vlastni");
  expect(screen.getAllByTestId("start")).toHaveLength(7);
});
it("verze bez rozboru nic nevykreslí", () => {
  const { container } = render(<MapaScenare verze={{ ...verze, rozbor: null }} popisky={{ 1: { text: "x" } }} />);
  expect(container.innerHTML).toBe("");
});
