import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { aiId, JMENO_AI } from "../../../src/shared/aiHraci.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { KartaRole } from "./KartaRole.js";

vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70 }));
import { prehraj } from "../zvuk.js";

it("před rozesláním čeká", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  expect(screen.getByText("Role se rozdají po startu hry, až GM potvrdí Nástupce.")).toBeTruthy();
});

it("po rozeslání je karta zakrytá a po odkrytí ukáže roli, cíl a oběť", () => {
  const { container } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" />);
  expect(screen.queryByText("Kat")).toBeNull();
  // Zakrytá karta leží rubem nahoru (bez alt — není to informace, jen obrázek).
  expect(container.querySelector("img.rub-karty")).toBeTruthy();
  // Viditelný text je jen „Tvá tajná role“; že se kliknutím odkrývá, říká title.
  const tlacitko = screen.getByRole("button", { name: "Tvá tajná role" });
  expect(tlacitko.textContent).toBe("Tvá tajná role");
  expect(tlacitko).toHaveAttribute("title", "Klikni pro odkrytí");
  fireEvent.click(tlacitko);
  expect(container.querySelector("img.rub-karty")).toBeNull();
  expect(screen.getByRole("heading", { name: "Kat" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Kat" })).toHaveClass("znak-role");
  // Popisky tajných údajů jsou věcné a u všech rolí stejné: „Oběť:“,
  // „Pokrevní pouto:“, „Druhý Nájezdník:“ — bez oslovení.
  expect(screen.getByText("Oběť:")).toBeTruthy();
  expect(screen.getByText("Vyhrává, když splní primární nebo sekundární cíl a jeho oběť je mrtvá. Oběť může zabít kdokoli.")).toHaveClass("cil");
  // Jméno oběti nese čtvereček její barvy (h4 sedí na žluté), Nástupce svůj.
  expect(screen.getByText("Hráč 4").querySelector(".swatch")).toHaveClass("barva-4");
  expect(screen.getByText("Hráč 1").querySelector(".swatch")).toHaveClass("barva-1");
});

it("Nájezdník vidí druhého Nájezdníka, Žoldák pakt", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null }, { hracId: "h5", role: "najezdnik", cilHracId: null }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByText("Druhý Nájezdník:")).toBeTruthy();
  expect(screen.getByText("Hráč 5").querySelector(".swatch")).toHaveClass("barva-5");
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" />);
  expect(screen.getByText("Pokrevní pouto:")).toBeTruthy();
  expect(screen.getByText("Hráč 6").querySelector(".swatch")).toHaveClass("barva-6");
});

// Nestandardní složení (spec §6.2: třeba 3× Nájezdník) — redakce posílá
// Nájezdníkovi všechny Nájezdníky a karta musí ukázat oba spojence, ne
// jen prvního; jinak hráč zaútočí na vlastního.
it("při třech Nájezdnících vidí Nájezdník oba spojence", () => {
  const najezdnik = (hracId: string) => ({ hracId, role: "najezdnik" as const, cilHracId: null });
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5"), najezdnik("h8")])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  const radek = screen.getByText("Další Nájezdníci:").parentElement!;
  expect(radek).toHaveTextContent("Další Nájezdníci: Hráč 5, Hráč 8");
  expect([...radek.querySelectorAll(".swatch")].map((s) => s.className)).toEqual(["swatch barva-5", "swatch barva-8"]);
  expect(screen.queryByText("Druhý Nájezdník:")).toBeNull();
});

// Dvě AI se jmenují stejně, takže oběť „AI“ by Katovi neřekla, kterou má
// zabít — rozliší ji barva (stejný helper jako v pultu GM).
it("oběť, která je jednou ze dvou AI, se rozliší barvou", () => {
  const zapasAi = { ...zapas, ucastnici: zapas.ucastnici.map((u) => (u.barva === 3 || u.barva === 5 ? { ...u, hracId: aiId(u.barva), alias: JMENO_AI, platformaJmeno: JMENO_AI } : u)) };
  render(<KartaRole zapas={zapasAi} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: aiId(5) }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByText("AI (p5)")).toBeTruthy();
  expect(screen.getByText("Hráč 1")).toBeTruthy();
});

// Jméno Nástupce je veřejné, stojí nad zakrytou kartou. Hláška „GM upravil
// tvou roli“ zanikla s úpravami po rozeslání (2. 10. 2026).
it("všichni v zápase vidí Nástupce už nad zakrytou kartou", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }])} ja="h2" />);
  expect(screen.getByText(/Nástupcem císaře je/)).toHaveTextContent("Nástupcem císaře je Hráč 1.");
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.queryByText(/GM upravil/)).toBeNull();
});

it("přechod do rozesláno zazvoní, načtení s už rozeslanými rolemi ne", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  vi.mocked(prehraj).mockClear();
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(prehraj).not.toHaveBeenCalled();
});

it("bez rozboru scénáře karta funguje jen s texty rolí", () => {
  render(<KartaRole zapas={zapas} data={{ ...stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }]), aktivni: null, verze: {} }} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  // Znak role zůstává, mapa ne.
  expect(screen.getByRole("img", { name: "Královská Garda" })).toBeTruthy();
  expect(screen.queryByRole("img", { name: /^Mapa scénáře/ })).toBeNull();
});

// Odkrytá karta ukáže minimapu jen s vlastním startem (spec §8.2) — h2 sedí
// na červené, takže značka je jedna a červená. Před odkrytím není žádný
// obrázek s názvem: rub karty je bez alt, tedy mimo roli img.
it("odkrytá karta ukáže minimapu jen s vlastním startem", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
  const starty = screen.getAllByTestId("start");
  expect(starty).toHaveLength(1);
  expect(starty[0]).toHaveClass("barva-2");
});
