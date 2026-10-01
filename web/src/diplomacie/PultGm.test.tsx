import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { losujRole } from "../../../src/shared/diplomacie/los.js";
import type { DiploData, RoleHrace, StavDiplo } from "../../../src/shared/diplomacie/typy.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { PultGm } from "./PultGm.js";

vi.mock("./api.js", () => ({
  diploApi: {
    nastupce: vi.fn(async () => ({ ok: true })),
    los: vi.fn(async () => ({ ok: true })),
    role: vi.fn(async () => ({ ok: true })),
    rozeslat: vi.fn(async () => ({ ok: true })),
    zpet: vi.fn(async () => ({ ok: true })),
    minimapaUrl: () => "/m.webp",
  },
}));
import { diploApi } from "./api.js";

const spust = async (fn: () => Promise<unknown>) => {
  await fn();
};
const jmeno = (id: string) => `Hráč ${id.slice(1)}`;
/** Nezredigovaná data, jak je vidí GM `h7`: Nástupce je v nich hned po výběru, ne až po rozeslání. */
const gmData = (stav: StavDiplo, role: RoleHrace[], nastupce?: string): DiploData => {
  const data = stavDiplo(stav, role);
  return { ...data, zapasy: data.zapasy.map((z) => ({ ...z, nastupceHracId: nastupce ?? null })) };
};
const ROLE_LOS = losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h1", () => 0);

const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Pult GM — klikni pro odkrytí" }));
/** Po doběhnutí akce se tlačítka zase odemknou — teprve pak jde klikat dál. */
const odemceno = (tlacitko: string) => waitFor(() => expect(screen.getByRole("button", { name: tlacitko })).toBeEnabled());

it("je zakrytý; v přípravě nabídne 7 dlaždic s pN a barvou", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  expect(screen.queryByTestId("dlazdice")).toBeNull();
  odkryj();
  const dlazdice = screen.getAllByTestId("dlazdice");
  expect(dlazdice).toHaveLength(7);
  expect(dlazdice[0]!.textContent).toMatch(/p1.*modrá.*Hráč 1/);
});

it("klik na dlaždici vybere Nástupce, pak Rozdat role losuje", async () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  odkryj();
  fireEvent.click(screen.getAllByTestId("dlazdice")[2]!);
  expect(diploApi.nastupce).toHaveBeenCalledWith(zapas.id, "h3");
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={spust} />);
  await odemceno("Rozdat role");
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  expect(diploApi.los).toHaveBeenCalledWith(zapas.id);
});

it("po losu tabulka s roletkami, cíle jen povolené, souhrn složení a rozeslání", async () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  expect(screen.getByRole("combobox", { name: `Role: ${jmeno(kat.hracId)}` })).toHaveValue("kat");
  const cil = screen.getByRole("combobox", { name: `Cíl: ${jmeno(kat.hracId)}` });
  expect(cil).toHaveValue(kat.cilHracId);
  const moznosti = within(cil).getAllByRole("option").map((o) => o.getAttribute("value"));
  expect(moznosti).not.toContain("h1");
  expect(moznosti).not.toContain(kat.hracId);
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(kat.hracId)}` }), { target: { value: "garda" } });
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, kat.hracId, { role: "garda" });
  expect(screen.getByText("Složení odpovídá pravidlům.")).toBeTruthy();
  await odemceno("Rozeslat role");
  fireEvent.click(screen.getByRole("button", { name: "Rozeslat role" }));
  expect(diploApi.rozeslat).toHaveBeenCalledWith(zapas.id);
});

it("po rozeslání se úprava potvrzuje dialogem", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const sasek = ROLE_LOS.find((r) => r.role === "sasek")!;
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(sasek.hracId)}` }), { target: { value: "kat" } });
  expect(window.confirm).toHaveBeenCalled();
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, sasek.hracId, { role: "kat", potvrzeno: true });
});

it("odchylka složení je vidět", () => {
  const tri = ROLE_LOS.map((r) => (r.role === "kat" ? { ...r, role: "najezdnik" as const, cilHracId: null } : r));
  render(<PultGm zapas={zapas} data={gmData("losovano", tri, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.getByText("3× Nájezdník (má být 2×), chybí Kat")).toBeTruthy();
});

// Dokud server neodpoví, GM nesmí kliknout podruhé — jinak by dvě rychlá
// kliknutí na „Rozdat role“ losovala dvakrát.
it("během běžící akce jsou tlačítka zamčená a po doběhnutí zase volná", async () => {
  let dokonci!: () => void;
  const ceka = (fn: () => Promise<unknown>) => new Promise<void>((resolve) => { dokonci = () => void fn().then(() => resolve()); });
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={ceka} />);
  odkryj();
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeDisabled();
  expect(screen.getAllByTestId("dlazdice")[0]).toBeDisabled();
  await act(async () => dokonci());
  await odemceno("Rozdat role");
});

it("bez Nástupce nejde rozdat; GM mezi dlaždicemi není a vybraná je označená", () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  odkryj();
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeDisabled();
  expect(screen.queryByText("Hráč 7")).toBeNull();
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={spust} />);
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeEnabled();
  const vybrane = screen.getAllByTestId("dlazdice").filter((d) => d.classList.contains("vybrana"));
  expect(vybrane).toHaveLength(1);
  expect(vybrane[0]!.textContent).toContain("Hráč 3");
});

it("Zpět na výběr Nástupce: po losu rovnou, po rozeslání jen s potvrzením", async () => {
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  fireEvent.click(screen.getByRole("button", { name: "Zpět na výběr Nástupce" }));
  expect(potvrzeni).not.toHaveBeenCalled();
  expect(diploApi.zpet).toHaveBeenCalledWith(zapas.id, false);
  vi.mocked(diploApi.zpet).mockClear();
  await odemceno("Zpět na výběr Nástupce");
  rerender(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  fireEvent.click(screen.getByRole("button", { name: "Zpět na výběr Nástupce" }));
  expect(potvrzeni).toHaveBeenCalled();
  expect(diploApi.zpet).not.toHaveBeenCalled();
  potvrzeni.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Zpět na výběr Nástupce" }));
  expect(diploApi.zpet).toHaveBeenCalledWith(zapas.id, true);
});

it("odmítnutý dialog po rozeslání roli nezmění", () => {
  vi.spyOn(window, "confirm").mockReturnValue(false);
  vi.mocked(diploApi.role).mockClear();
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const sasek = ROLE_LOS.find((r) => r.role === "sasek")!;
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(sasek.hracId)}` }), { target: { value: "kat" } });
  expect(diploApi.role).not.toHaveBeenCalled();
});

// Po rozeslání už není co losovat — zůstává jen úprava, návrat a přehled.
it("po rozeslání zmizí Přelosovat a Rozeslat, přehled se dá zkopírovat", () => {
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.queryByRole("button", { name: "Přelosovat" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Rozeslat role" })).toBeNull();
  expect(screen.getByRole("button", { name: "Kopírovat přehled rolí" })).toBeTruthy();
  expect(screen.getByText("Rozesláno")).toBeTruthy();
});

// Velká minimapa se všemi starty a jmény hráčů (spec §8.1); GM na šedé
// start nemá, takže značek je sedm.
it("odkrytý pult ukáže velkou minimapu se všemi starty a jmény", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  expect(screen.queryByRole("img")).toBeNull();
  odkryj();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
  const starty = screen.getAllByTestId("start");
  expect(starty).toHaveLength(7);
  expect(starty.find((s) => s.classList.contains("barva-1"))!.textContent).toBe("Hráč 1");
});
