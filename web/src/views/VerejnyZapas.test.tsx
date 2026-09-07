import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import type { UcastnikView, ZapasView } from "../../../src/shared/types.js";
import { VerejnyZapas } from "./VerejnyZapas.js";

const u = (steamId: string, alias: string | null, tym: 1 | 2, steamName: string | null = null): UcastnikView => ({
  steamId,
  alias,
  steamName,
  tym,
  barva: tym,
  jeHost: false,
  poradi: 0,
  kliknulPripojit: null,
});

// Zaslepený zápas tak, jak ho neúčastníkovi pošle redigujZapas: bez hesla,
// bez čísla lobby, bez odkazů.
const zaslepeny: ZapasView = {
  id: 1,
  poradi: 3,
  stav: "bezi",
  nazevLobby: "ROB-03",
  heslo: "",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  ucastnici: [u("a", "Trokner", 1), u("b", "TibbarZmr", 2)],
};

it("ukáže pořadí, formát a kdo proti komu", () => {
  render(<VerejnyZapas zapas={zaslepeny} />);
  const radek = screen.getByTestId("verejny-zapas");
  expect(radek).toHaveTextContent("Zápas #3");
  expect(radek).toHaveTextContent("1v1");
  expect(radek).toHaveTextContent("běží");
  expect(radek).toHaveTextContent("Trokner vs TibbarZmr");
});

it("u dohraného zápasu řekne, kdo vyhrál", () => {
  render(<VerejnyZapas zapas={{ ...zaslepeny, stav: "dohrano", vitez: { tym: 2 } }} />);
  expect(screen.getByTestId("verejny-zapas")).toHaveTextContent(/vyhrál (červený tým|\w+)/);
});

it("spojí spoluhráče do jedné strany", () => {
  const coop: ZapasView = {
    ...zaslepeny,
    ucastnici: [u("a", "Trokner", 1), u("b", "Pepa", 1), u("c", "Marek", 2), u("d", "Lukas", 2)],
  };
  render(<VerejnyZapas zapas={coop} />);
  const radek = screen.getByTestId("verejny-zapas");
  expect(radek).toHaveTextContent("Coop Kings");
  expect(radek).toHaveTextContent("Trokner + Pepa vs Marek + Lukas");
});

it("pojmenuje hráče bez aliasu jménem ze Steamu, ne Steam ID", () => {
  const bezAliasu = { ...zaslepeny, ucastnici: [u("a", "Trokner", 1), u("76561199091641101", null, 2, "TibbarZmr")] };
  render(<VerejnyZapas zapas={bezAliasu} />);
  const radek = screen.getByTestId("verejny-zapas");
  expect(radek).toHaveTextContent("TibbarZmr");
  expect(radek).not.toHaveTextContent("76561199091641101");
});

// Tenhle řádek vidí i anonym, takže se přes něj nesmí protéct nic, co je
// tajemství — i kdyby server jednou začal posílat nezaslepený zápas.
it("neukáže heslo ani číslo lobby, ani když v datech jsou", () => {
  const neopatrny = { ...zaslepeny, heslo: "k7rm2xq9", lobbyId: "234230181" };
  render(<VerejnyZapas zapas={neopatrny} />);
  const radek = screen.getByTestId("verejny-zapas");
  expect(radek).not.toHaveTextContent("k7rm2xq9");
  expect(radek).not.toHaveTextContent("234230181");
});

it("hráči, který zápas hrál, řekne, jak dopadl", () => {
  const dohrany = { ...zaslepeny, stav: "dohrano", vitez: { tym: 1 } as const };
  render(<VerejnyZapas zapas={dohrany} ja="b" />);
  expect(screen.getByTestId("verejny-zapas")).toHaveTextContent("Prohrál jsi");
});

it("vítězi to řekne taky", () => {
  const dohrany = { ...zaslepeny, stav: "dohrano", vitez: { tym: 1 } as const };
  render(<VerejnyZapas zapas={dohrany} ja="a" />);
  expect(screen.getByTestId("verejny-zapas")).toHaveTextContent("Vyhrál jsi");
});

it("divákovi mimo zápas nic osobního neříká", () => {
  const dohrany = { ...zaslepeny, stav: "dohrano", vitez: { tym: 1 } as const };
  render(<VerejnyZapas zapas={dohrany} ja="nekdo-jiny" />);
  const radek = screen.getByTestId("verejny-zapas");
  expect(radek).not.toHaveTextContent(/vyhrál jsi/i);
  expect(radek).not.toHaveTextContent(/prohrál jsi/i);
});

it("u běžícího zápasu se nikomu nic nepředpovídá", () => {
  render(<VerejnyZapas zapas={zaslepeny} ja="a" />);
  const radek = screen.getByTestId("verejny-zapas");
  expect(radek).not.toHaveTextContent(/vyhrál jsi/i);
  expect(radek).not.toHaveTextContent(/prohrál jsi/i);
});
