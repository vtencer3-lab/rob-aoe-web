import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VYCHOZI_NASTAVENI } from "../../../src/shared/lobbyKontrola.js";
import { NastaveniLobby } from "./NastaveniLobby.js";

it("bez uloženého nastavení nabídne výchozí: Arabia, Normal, 200, Conquest, bez cheatů", () => {
  const onUlozit = vi.fn();
  render(<NastaveniLobby ulozene={undefined} onUlozit={onUlozit} />);
  expect(screen.getByLabelText(/mapa/i)).toHaveValue("10875");
  expect(screen.getByLabelText(/velikost/i)).toHaveValue("");
  expect(screen.getByLabelText(/rychlost/i)).toHaveValue("2");
  expect(screen.getByLabelText(/populace/i)).toHaveValue(200);
  expect(screen.getByLabelText(/cheaty/i)).not.toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));
  expect(onUlozit).toHaveBeenCalledWith(VYCHOZI_NASTAVENI);
});

it("uložené hodnoty převezme a změny pošle", () => {
  const onUlozit = vi.fn();
  render(<NastaveniLobby ulozene={{ mapaId: 10878, populace: 150 }} onUlozit={onUlozit} />);
  expect(screen.getByLabelText(/mapa/i)).toHaveValue("10878");

  fireEvent.change(screen.getByLabelText(/mapa/i), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(/velikost/i), { target: { value: "168" } });
  fireEvent.change(screen.getByLabelText(/rychlost/i), { target: { value: "3" } });
  fireEvent.click(screen.getByLabelText(/cheaty/i));
  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));

  expect(onUlozit).toHaveBeenCalledWith({ ...VYCHOZI_NASTAVENI, mapaId: null, velikost: 168, rychlost: 3, populace: 150, cheaty: true });
});

// Vedlejší volby jsou sbalené pod „Další nastavení“, ale ukládají se stejně.
it("další nastavení jde měnit ve sbalené části", () => {
  const onUlozit = vi.fn();
  render(<NastaveniLobby ulozene={undefined} onUlozit={onUlozit} />);
  expect(screen.getByTestId("dalsi-nastaveni-form")).not.toHaveAttribute("open");

  fireEvent.change(screen.getByLabelText(/civilization set/i), { target: { value: "0" } });
  fireEvent.change(screen.getByLabelText(/treaty length/i), { target: { value: "20" } });
  fireEvent.click(screen.getByLabelText(/lock teams/i));
  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));

  expect(onUlozit).toHaveBeenCalledWith({ ...VYCHOZI_NASTAVENI, sadaCivilizaci: 0, primeri: 20, lockTeams: false });
});
