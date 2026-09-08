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
function Panel({
  onVytvoritZapas = vi.fn(),
  sadaCivilizaci = null,
}: {
  onVytvoritZapas?: (s: SestavaVstup[]) => void;
  sadaCivilizaci?: number | null;
}) {
  const skladani = useSkladani(prihlaseni);
  return (
    <>
      <SeznamPrihlasenych prihlaseni={prihlaseni} skladani={skladani} />
      <Skladani skladani={skladani} onVytvoritZapas={onVytvoritZapas} sadaCivilizaci={sadaCivilizaci} />
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

// Civilizace se vybírá z vlastního seznamu s erby (nativní select obrázky
// neumí). Vybraná hodnota se propíše do sestavy a seznam se zavře.
it("civilizaci vybere ze seznamu s erby", () => {
  render(<Panel />);
  vyber("TenceR");
  const tlacitko = screen.getByRole("button", { name: /civilizace tencer/i });
  expect(tlacitko).toHaveTextContent(/libovolná civ/i);
  fireEvent.click(tlacitko);
  const seznam = screen.getByRole("listbox", { name: /civilizace tencer/i });
  expect(seznam.querySelectorAll("img").length).toBeGreaterThan(50);
  fireEvent.click(screen.getByRole("option", { name: /koreans/i }));
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /civilizace tencer/i })).toHaveTextContent("Koreans");
});

// Nabídka civilizací se řídí Civilization Setem z nastavení akce: s „Age of
// Empires II“ nemá co dělat ve výběru Sparta z Chronicles a naopak.
it("nabídne jen civilizace ze zvolené sady", () => {
  render(<Panel sadaCivilizaci={1} />);
  vyber("TenceR");
  fireEvent.click(screen.getByRole("button", { name: /civilizace tencer/i }));
  const seznam = screen.getByRole("listbox", { name: /civilizace tencer/i });
  expect(within(seznam).getByRole("option", { name: /koreans/i })).toBeInTheDocument();
  expect(within(seznam).queryByRole("option", { name: /spartans/i })).not.toBeInTheDocument();
  // Three Kingdoms mají v datech hry era "base", takže do AoE II patří.
  expect(within(seznam).getByRole("option", { name: /jurchens/i })).toBeInTheDocument();
});

it("s Chronicles nabídne jen je a „libovolnou“", () => {
  render(<Panel sadaCivilizaci={2} />);
  vyber("TenceR");
  fireEvent.click(screen.getByRole("button", { name: /civilizace tencer/i }));
  const seznam = screen.getByRole("listbox", { name: /civilizace tencer/i });
  expect(within(seznam).getAllByRole("option")).toHaveLength(7); // 6 civilizací + libovolná
  expect(within(seznam).getByRole("option", { name: /spartans/i })).toBeInTheDocument();
  expect(within(seznam).queryByRole("option", { name: /koreans/i })).not.toBeInTheDocument();
});

// Rob může sadu přepnout až potom, co civilizaci předepsal. Vyhodit ji ze
// seznamu by znamenalo, že z rozbalené nabídky nejde poznat, co je nastavené.
it("vybranou civilizaci mimo sadu ze seznamu nevyhodí", () => {
  const { rerender } = render(<Panel sadaCivilizaci={2} />);
  vyber("TenceR");
  fireEvent.click(screen.getByRole("button", { name: /civilizace tencer/i }));
  fireEvent.click(screen.getByRole("option", { name: /spartans/i }));
  expect(screen.getByRole("button", { name: /civilizace tencer/i })).toHaveTextContent("Spartans");

  rerender(<Panel sadaCivilizaci={1} />);
  fireEvent.click(screen.getByRole("button", { name: /civilizace tencer/i }));
  const seznam = screen.getByRole("listbox", { name: /civilizace tencer/i });
  expect(within(seznam).getByRole("option", { name: /spartans/i })).toBeInTheDocument();
  expect(within(seznam).queryByRole("option", { name: /athenians/i })).not.toBeInTheDocument();
});

// ELO má vlastní sloupec s pevnou šířkou, ať se jména a erby zarovnají.
it("ELO stojí ve vlastním sloupci vedle jména", () => {
  render(<Panel />);
  vyber("TenceR");
  const radek = screen.getByRole("button", { name: /barva tencer/i }).closest("li")!;
  expect(radek.querySelector(".jmeno")).toHaveTextContent(/^TenceR$/);
  expect(radek.querySelector(".elo")).toHaveTextContent("(1136)");
});

it("najetí na jméno vybraného hráče ukáže kartu se statistikami", () => {
  render(<Panel />);
  vyber("TenceR");
  fireEvent.pointerEnter(screen.getByTestId("jmeno-vybraneho"));
  expect(screen.getByTestId("staty-hrace")).toHaveTextContent("TenceR");
  fireEvent.pointerLeave(screen.getByTestId("jmeno-vybraneho"));
  expect(screen.queryByTestId("staty-hrace")).not.toBeInTheDocument();
});

// Pod seznamem je součet 1v1 ELO za tým; kdo ELO nemá, do součtu nejde a je
// u týmu jmenovaný, ať Rob ví, že číslo není celé.
it("ukáže součet ELO za tým a jmenuje hráče bez ELO", () => {
  render(<Panel />);
  vyber("TenceR"); // tým 1, 1136
  vyber("Pepa"); // tým 2, bez ELO
  vyber("Marek"); // tým 1, bez ELO
  const tymy = screen.getByTestId("elo-tymu").querySelectorAll(".tym");
  expect(tymy).toHaveLength(2);
  expect(tymy[0]).toHaveTextContent("Tým 1");
  expect(tymy[0]).toHaveTextContent("1136");
  expect(tymy[0]).toHaveTextContent(/bez ELO: Marek/);
  expect(tymy[1]).toHaveTextContent("Tým 2");
  expect(tymy[1]).toHaveTextContent("0");
});
