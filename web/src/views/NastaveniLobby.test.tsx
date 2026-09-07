import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VYCHOZI_NASTAVENI } from "../../../src/shared/lobbyKontrola.js";
import { NastaveniLobby } from "./NastaveniLobby.js";

it("bez uloženého nastavení nabídne výchozí: Arabia, Normal, 200, Conquest, bez cheatů", () => {
  const onUlozit = vi.fn();
  render(<NastaveniLobby ulozene={undefined} onUlozit={onUlozit} />);
  expect(screen.getByLabelText(/location/i)).toHaveValue("10875");
  expect(screen.getByLabelText(/map size/i)).toHaveValue("");
  expect(screen.getByLabelText(/game speed/i)).toHaveValue("2");
  expect(screen.getByLabelText(/population/i)).toHaveValue(200);
  expect(screen.getByLabelText(/allow cheats/i)).not.toBeChecked();

  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));
  expect(onUlozit).toHaveBeenCalledWith(VYCHOZI_NASTAVENI);
});

it("uložené hodnoty převezme a změny pošle", () => {
  const onUlozit = vi.fn();
  render(<NastaveniLobby ulozene={{ mapaId: 10878, populace: 150 }} onUlozit={onUlozit} />);
  expect(screen.getByLabelText(/location/i)).toHaveValue("10878");

  fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(/map size/i), { target: { value: "168" } });
  fireEvent.change(screen.getByLabelText(/game speed/i), { target: { value: "3" } });
  fireEvent.click(screen.getByLabelText(/allow cheats/i));
  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));

  expect(onUlozit).toHaveBeenCalledWith({ ...VYCHOZI_NASTAVENI, mapaId: null, velikost: 168, rychlost: 3, populace: 150, cheaty: true });
});

// Rozložení kopíruje herní panel: řádky v pořadí hry, pak Team Settings a
// Advanced Settings. Mimo hlavní kontrolu jde všechno nastavit na „–“ (je to
// jedno); AI Difficulty a Lock Teams tak začínají. Zaškrtávátko jde dokola
// vypnuto → zapnuto → „–“, Allow Cheats jen vypnuto ↔ zapnuto.
it("volby mimo hlavní kontrolu jde nastavit na „–“, zaškrtávátka mají tři stavy", () => {
  const onUlozit = vi.fn();
  render(<NastaveniLobby ulozene={undefined} onUlozit={onUlozit} />);
  expect(screen.getByLabelText(/ai difficulty/i)).toHaveValue("");
  const lockTeams = screen.getByLabelText(/lock teams/i) as HTMLInputElement;
  expect(lockTeams.indeterminate).toBe(true);
  expect(screen.getByRole("group", { name: /team settings/i })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: /advanced settings/i })).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/chronicles/i));
  fireEvent.change(screen.getByLabelText(/treaty length/i), { target: { value: "20" } });
  fireEvent.click(lockTeams); // – → vypnuto
  fireEvent.click(screen.getByLabelText(/record game/i)); // zapnuto → –
  fireEvent.click(screen.getByLabelText(/allow cheats/i)); // vypnuto → zapnuto
  fireEvent.click(screen.getByLabelText(/allow cheats/i)); // zapnuto → vypnuto (žádné „–“)
  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));

  expect(onUlozit).toHaveBeenCalledWith({ ...VYCHOZI_NASTAVENI, sadaCivilizaci: 2, primeri: 20, lockTeams: false, recordGame: null, cheaty: false });
});
