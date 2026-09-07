import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlayerView, SestavaVstup } from "../../../src/shared/types.js";
import { useSkladani } from "../skladani.js";
import { SeznamPrihlasenych } from "./SeznamPrihlasenych.js";
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

/** Stejné propojení jako v App: jeden stav pro tabulku (nevybraní) i panel (vybraní). */
function Panel({ onVytvoritZapas = vi.fn() }: { onVytvoritZapas?: (s: SestavaVstup[]) => void }) {
  const skladani = useSkladani(prihlaseni);
  return (
    <>
      <SeznamPrihlasenych prihlaseni={prihlaseni} skladani={skladani} />
      <Skladani skladani={skladani} onVytvoritZapas={onVytvoritZapas} />
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
});

const vyber = (jmeno: string) => fireEvent.click(screen.getByRole("button", { name: `Vybrat hráče ${jmeno}` }));
const vybraniJmena = () =>
  within(screen.getByTestId("vybrani"))
    .getAllByRole("listitem")
    .map((li) => li.querySelector(".jmeno")!.textContent?.replace(/\s*\(.*\)$/, ""));
const nevybraniJmena = () =>
  screen.getAllByRole("row").slice(1).map((r) => r.querySelectorAll("td")[1]!.textContent);

it("tlačítko „+“ přesune hráče z tabulky do sestavy s barvou a týmem", () => {
  render(<Panel />);
  vyber("Pepa");

  expect(vybraniJmena()).toEqual(["Pepa"]);
  expect(nevybraniJmena()).toEqual(["TenceR", "Marek", "Lukas"]);
  expect(screen.getByRole("button", { name: /barva pepa: modrá/i })).toHaveTextContent("1");
  expect(screen.getByRole("button", { name: /tým pepa: 1/i })).toHaveTextContent("1");
});

it("výchozí tým se střídá 1, 2, 1, 2 a barva je první volná", () => {
  render(<Panel />);
  vyber("Marek");
  vyber("TenceR");
  vyber("Pepa");

  expect(vybraniJmena()).toEqual(["Marek", "TenceR", "Pepa"]);
  expect(screen.getByRole("button", { name: /tým tencer: 2/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /tým pepa: 1/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /barva pepa: zelená/i })).toBeInTheDocument();
});

it("levé tlačítko jde barvou i týmem dopředu, pravé zpátky, dokola", () => {
  render(<Panel />);
  vyber("Pepa");

  const barva = () => screen.getByRole("button", { name: /barva pepa/i });
  fireEvent.click(barva());
  expect(barva()).toHaveTextContent("2");
  fireEvent.contextMenu(barva());
  fireEvent.contextMenu(barva());
  expect(barva()).toHaveTextContent("8");

  const tym = () => screen.getByRole("button", { name: /tým pepa/i });
  fireEvent.click(tym());
  expect(tym()).toHaveTextContent("2");
  fireEvent.contextMenu(tym());
  fireEvent.contextMenu(tym());
  expect(tym()).toHaveTextContent("–");
});

it("vytvoří zápas se sestavou v pořadí slotů a hlásí formát", () => {
  const onVytvoritZapas = vi.fn();
  render(<Panel onVytvoritZapas={onVytvoritZapas} />);
  vyber("TenceR");
  vyber("Pepa");
  expect(screen.getByTestId("souhrn-sestavy")).toHaveTextContent("Formát: 1v1");

  fireEvent.click(screen.getByRole("button", { name: /vytvořit zápas \(2\)/i }));
  expect(onVytvoritZapas).toHaveBeenCalledWith([
    { steamId: "a", tym: 1, barva: 1, civ: null },
    { steamId: "b", tym: 2, barva: 2, civ: null },
  ]);
  expect(nevybraniJmena()).toHaveLength(4);
});

it("neplatnou sestavu nepustí a řekne proč", () => {
  render(<Panel />);
  vyber("TenceR");
  expect(screen.getByRole("button", { name: /vytvořit zápas/i })).toBeDisabled();
  expect(screen.getByTestId("souhrn-sestavy")).toHaveTextContent(/aspoň 2/);

  vyber("Pepa");
  // Pepovi dej stejnou barvu jako TenceR (2 → 1): sdílená civilizace v jiném týmu = chyba.
  fireEvent.contextMenu(screen.getByRole("button", { name: /barva pepa/i }));
  expect(screen.getByTestId("souhrn-sestavy")).toHaveTextContent(/stejném týmu/);
});

it("křížek vrátí hráče do tabulky na konec", () => {
  render(<Panel />);
  vyber("TenceR");
  fireEvent.click(screen.getByRole("button", { name: /vyřadit tencer/i }));

  expect(screen.getByTestId("vybrani").children).toHaveLength(0);
  expect(nevybraniJmena()).toEqual(["Pepa", "Marek", "Lukas", "TenceR"]);
});

it("přetažení mění pořadí jen uvnitř skupiny", () => {
  render(<Panel />);
  vyber("TenceR");
  vyber("Pepa");
  const [prvni, druhy] = within(screen.getByTestId("vybrani")).getAllByRole("listitem");

  fireEvent.dragStart(druhy!);
  fireEvent.dragOver(prvni!);
  fireEvent.drop(prvni!);
  expect(vybraniJmena()).toEqual(["Pepa", "TenceR"]);

  // Řádky tabulky nevybraných se řadí mezi sebou…
  const [marek, lukas] = screen.getAllByRole("row").slice(1);
  fireEvent.dragStart(lukas!);
  fireEvent.drop(marek!);
  expect(nevybraniJmena()).toEqual(["Lukas", "Marek"]);

  // …ale tažení z vybraných na řádek tabulky nic neudělá.
  fireEvent.dragStart(within(screen.getByTestId("vybrani")).getAllByRole("listitem")[0]!);
  fireEvent.drop(screen.getAllByRole("row")[1]!);
  expect(vybraniJmena()).toEqual(["Pepa", "TenceR"]);
  expect(nevybraniJmena()).toEqual(["Lukas", "Marek"]);
});
