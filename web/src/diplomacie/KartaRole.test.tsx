import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { KartaRole } from "./KartaRole.js";

vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70 }));
import { prehraj } from "../zvuk.js";

it("před rozesláním čeká", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  expect(screen.getByText("Role se rozdají po startu hry, až GM potvrdí Nástupce.")).toBeTruthy();
});

it("po rozeslání je karta zakrytá a po odkrytí ukáže roli, cíl a oběť", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4", upravenoPoRozeslani: false }])} ja="h2" />);
  expect(screen.queryByText("Kat")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role — klikni pro odkrytí" }));
  expect(screen.getByRole("heading", { name: "Kat" })).toBeTruthy();
  expect(screen.getByText("Tvá oběť:")).toBeTruthy();
  expect(screen.getByText("Hráč 4")).toBeTruthy();
});

it("Nájezdník vidí druhého Nájezdníka, Žoldák pakt", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null, upravenoPoRozeslani: false }, { hracId: "h5", role: "najezdnik", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByText("Druhý Nájezdník:")).toBeTruthy();
  expect(screen.getByText("Hráč 5")).toBeTruthy();
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6", upravenoPoRozeslani: false }])} ja="h2" />);
  expect(screen.getByText("Pokrevní pouto:")).toBeTruthy();
});

it("všichni v zápase vidí Nástupce a úprava GM se ohlásí", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null, upravenoPoRozeslani: true }])} ja="h2" />);
  expect(screen.getByText(/Nástupcem císaře je/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByText("GM upravil tvou roli.")).toBeTruthy();
});

it("přechod do rozesláno zazvoní, načtení s už rozeslanými rolemi ne", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  vi.mocked(prehraj).mockClear();
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  expect(prehraj).not.toHaveBeenCalled();
});

it("bez rozboru scénáře karta funguje jen s texty rolí", () => {
  render(<KartaRole zapas={zapas} data={{ ...stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }]), aktivni: null, verze: {} }} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  expect(screen.queryByRole("img")).toBeNull();
});

// Odkrytá karta ukáže minimapu jen s vlastním startem (spec §8.2) — h2 sedí
// na červené, takže značka je jedna a červená.
it("odkrytá karta ukáže minimapu jen s vlastním startem", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null, upravenoPoRozeslani: false }])} ja="h2" />);
  expect(screen.queryByRole("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /odkrytí/ }));
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
  const starty = screen.getAllByTestId("start");
  expect(starty).toHaveLength(1);
  expect(starty[0]).toHaveClass("barva-2");
});
