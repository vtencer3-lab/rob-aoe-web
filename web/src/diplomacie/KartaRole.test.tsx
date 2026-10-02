import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { aiId, JMENO_AI } from "../../../src/shared/aiHraci.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { KartaRole } from "./KartaRole.js";

vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70 }));
import { prehraj } from "../zvuk.js";

/** Text karty role (bez mapy pod ní a věty o Nástupci nad ní) — tatáž jména jsou i na mapě. */
const naKarte = () => within(document.querySelector<HTMLElement>(".karta-role .role")!);
/** Značka startu na mapě podle barvy; undefined, když tam není. */
const start = (barva: number) => screen.queryAllByTestId("start").find((s) => s.classList.contains(`barva-${barva}`));
const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));

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
  expect(naKarte().getByText("Hráč 4").querySelector(".swatch")).toHaveClass("barva-4");
  expect(within(screen.getByText(/Nástupcem císaře je/)).getByText("Hráč 1").querySelector(".swatch")).toHaveClass("barva-1");
});

it("Nájezdník vidí druhého Nájezdníka, Žoldák pakt", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null }, { hracId: "h5", role: "najezdnik", cilHracId: null }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByText("Druhý Nájezdník:")).toBeTruthy();
  expect(naKarte().getByText("Hráč 5").querySelector(".swatch")).toHaveClass("barva-5");
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" />);
  expect(screen.getByText("Pokrevní pouto:")).toBeTruthy();
  expect(naKarte().getByText("Hráč 6").querySelector(".swatch")).toHaveClass("barva-6");
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
  expect(naKarte().getByText("AI (p5)")).toBeTruthy();
  // I na mapě nese oběť jméno s přívěskem barvy, ne holé „AI“.
  expect(start(5)!.textContent).toBe("AI (p5)");
  expect(within(screen.getByText(/Nástupcem císaře je/)).getByText("Hráč 1")).toBeTruthy();
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

// Mapa pod kartou (spec §8.2, rozšířeno 2. 10. 2026): vlastní start a hráči,
// ke kterým má hráč podle role vztah; Nástupce císaře s korunou vidí každý.
// Role bez tajného údaje (Garda, Šašek) tak vidí jen sebe a Nástupce. h2
// sedí na červené, Nástupce `h1` na modré. Před odkrytím není žádný obrázek
// s názvem: rub karty je bez alt, tedy mimo roli img.
it("obyčejná role vidí na mapě jen svůj start a Nástupce s korunou", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(screen.queryByRole("img")).toBeNull();
  odkryj();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
  expect(screen.getAllByTestId("start")).toHaveLength(2);
  expect(start(2)!.className).toBe("start barva-2 druh-ja");
  expect(start(2)!.textContent).toBe("Tady začínáš");
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce");
  expect(start(1)!.textContent).toBe("Hráč 1");
  expect(within(start(1)!).getByRole("img", { name: "Nástupce císaře" })).toHaveClass("koruna");
  expect(start(2)!.querySelector(".koruna")).toBeNull();
});

it("Nájezdník vidí na mapě ostatní Nájezdníky jako spojence", () => {
  const najezdnik = (hracId: string) => ({ hracId, role: "najezdnik" as const, cilHracId: null });
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5")])} ja="h2" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(5)!.className).toBe("start barva-5 druh-spojenec");
  expect(start(5)!.textContent).toBe("Hráč 5");
  expect(within(start(5)!).getByText("Hráč 5")).toHaveAttribute("title", "Hráč 5 — druhý Nájezdník");
  // Tři Nájezdníci (nestandardní složení): oba spojenci, v bublině „další“.
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5"), najezdnik("h8")])} ja="h2" />);
  expect(screen.getAllByTestId("start")).toHaveLength(4);
  expect(start(8)).toHaveClass("druh-spojenec");
  expect(within(start(8)!).getByText("Hráč 8")).toHaveAttribute("title", "Hráč 8 — další Nájezdník");
});

// Oběť je na mapě červeně (třída druhu → barva chyby z palety v CSS).
it("Kat vidí na mapě svou oběť v třídě nebezpečí", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(4)!.className).toBe("start barva-4 druh-obet");
  expect(within(start(4)!).getByText("Hráč 4")).toHaveAttribute("title", "Hráč 4 — tvá oběť");
});

it("Žoldák vidí na mapě hráče, se kterým má pokrevní pouto", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(6)!.className).toBe("start barva-6 druh-pouto");
  expect(within(start(6)!).getByText("Hráč 6")).toHaveAttribute("title", "Hráč 6 — pokrevní pouto");
});

// Nástupce sám má korunu nad vlastním „Tady začínáš“; hráč se dvěma vztahy
// (oběť, která je Nástupcem) nese obojí — korunu i třídu oběti.
it("Nástupce má korunu na vlastním startu; oběť, která je Nástupcem, korunu i červené jméno", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h1", role: "nastupce", cilHracId: null }])} ja="h1" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce druh-ja");
  expect(start(1)!.textContent).toBe("Tady začínáš");
  expect(start(1)!.querySelector("img.koruna")).toBeTruthy();
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h1" }])} ja="h2" />);
  expect(screen.getAllByTestId("start")).toHaveLength(2);
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce druh-obet");
  expect(start(1)!.querySelector("img.koruna")).toBeTruthy();
  expect(within(start(1)!).getByText("Hráč 1")).toHaveAttribute("title", "Hráč 1 — Nástupce císaře, tvá oběť");
});
