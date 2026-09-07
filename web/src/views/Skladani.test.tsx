import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlayerView } from "../../../src/shared/types.js";
import { Skladani } from "./Skladani.js";

function hrac(steamId: string, alias: string, elo: number | null = null): PlayerView {
  return {
    steamId,
    alias,
    steamName: null,
    avatarUrl: null,
    country: null,
    elo1v1: elo,
    eloNejvyssi: null,
    odehranoHer: null,
    steamHodiny: null,
    posledniZapas: null,
    statyStazenyV: null,
    statyChyba: null,
  };
}

const prihlaseni = [hrac("a", "TenceR", 1136), hrac("b", "Pepa"), hrac("c", "Marek"), hrac("d", "Lukas")];

beforeEach(() => {
  localStorage.clear();
});

function vybraniJmena() {
  return within(screen.getByTestId("vybrani"))
    .getAllByRole("listitem")
    .map((li) => within(li).getByTitle(/vyřadíš/i).textContent?.replace(/\s*\(.*\)$/, ""));
}

it("kliknutí na hráče ho přesune mezi vybrané, s barvou a týmem", () => {
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^Pepa/ }));

  expect(vybraniJmena()).toEqual(["Pepa"]);
  expect(screen.getByRole("button", { name: /barva pepa: modrá/i })).toHaveTextContent("1");
  expect(screen.getByRole("button", { name: /tým pepa: bez týmu/i })).toHaveTextContent("–");
});

it("další vybraný dostane první volnou barvu a jde na konec vybraných", () => {
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^Marek/ }));
  fireEvent.click(screen.getByRole("button", { name: /^TenceR/ }));

  expect(vybraniJmena()).toEqual(["Marek", "TenceR"]);
  expect(screen.getByRole("button", { name: /barva tencer: červená/i })).toBeInTheDocument();
});

it("levé tlačítko jde barvou i týmem dopředu, pravé zpátky, dokola", () => {
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^Pepa/ }));

  const barva = () => screen.getByRole("button", { name: /barva pepa/i });
  fireEvent.click(barva());
  expect(barva()).toHaveTextContent("2");
  fireEvent.contextMenu(barva());
  fireEvent.contextMenu(barva());
  expect(barva()).toHaveTextContent("8");

  const tym = () => screen.getByRole("button", { name: /tým pepa/i });
  fireEvent.click(tym());
  expect(tym()).toHaveTextContent("1");
  fireEvent.contextMenu(tym());
  fireEvent.contextMenu(tym());
  expect(tym()).toHaveTextContent("4");
});

it("vytvoří zápas se sestavou v pořadí slotů a hlásí formát", () => {
  const onVytvoritZapas = vi.fn();
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={onVytvoritZapas} />);
  fireEvent.click(screen.getByRole("button", { name: /^TenceR/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Pepa/ }));
  // Pepa má výchozí barvu 2; oba bez týmu = 1v1.
  expect(screen.getByTestId("souhrn-sestavy")).toHaveTextContent("Formát: 1v1");

  fireEvent.click(screen.getByRole("button", { name: /vytvořit zápas \(2\)/i }));
  expect(onVytvoritZapas).toHaveBeenCalledWith([
    { steamId: "a", tym: 0, barva: 1 },
    { steamId: "b", tym: 0, barva: 2 },
  ]);
});

it("neplatnou sestavu nepustí a řekne proč", () => {
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^TenceR/ }));
  expect(screen.getByRole("button", { name: /vytvořit zápas/i })).toBeDisabled();
  expect(screen.getByTestId("souhrn-sestavy")).toHaveTextContent(/aspoň 2/);

  fireEvent.click(screen.getByRole("button", { name: /^Pepa/ }));
  // Pepovi dej stejnou barvu jako TenceR: sdílená civilizace bez týmu = chyba.
  fireEvent.contextMenu(screen.getByRole("button", { name: /barva pepa/i }));
  expect(screen.getByTestId("souhrn-sestavy")).toHaveTextContent(/stejném týmu/);
});

it("kliknutí na vybraného ho vrátí mezi nevybrané na konec", () => {
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^TenceR/ }));
  fireEvent.click(screen.getByTitle(/vyřadíš/i));

  expect(screen.queryAllByTestId("vybrani")[0]!.children).toHaveLength(0);
  const nevybrani = within(screen.getByTestId("nevybrani")).getAllByRole("listitem");
  expect(nevybrani[nevybrani.length - 1]).toHaveTextContent("TenceR");
});

it("přetažení mění pořadí jen uvnitř skupiny", () => {
  render(<Skladani prihlaseni={prihlaseni} onVytvoritZapas={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /^TenceR/ }));
  fireEvent.click(screen.getByRole("button", { name: /^Pepa/ }));
  const [prvni, druhy] = within(screen.getByTestId("vybrani")).getAllByRole("listitem");

  fireEvent.dragStart(druhy!);
  fireEvent.dragOver(prvni!);
  fireEvent.drop(prvni!);
  expect(vybraniJmena()).toEqual(["Pepa", "TenceR"]);

  // Tažení z vybraných na nevybraného nic neudělá.
  const [marek] = within(screen.getByTestId("nevybrani")).getAllByRole("listitem");
  fireEvent.dragStart(within(screen.getByTestId("vybrani")).getAllByRole("listitem")[0]!);
  fireEvent.drop(marek!);
  expect(vybraniJmena()).toEqual(["Pepa", "TenceR"]);
  expect(within(screen.getByTestId("nevybrani")).getAllByRole("listitem")).toHaveLength(2);
});
