import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VYCHOZI_NASTAVENI } from "../../../src/shared/lobbyKontrola.js";
import { NastaveniLobby } from "./NastaveniLobby.js";

const nic = () => {};

it("bez uloženého nastavení nabídne výchozí: Arabia, Normal, 200, Conquest, bez cheatů", () => {
  render(<NastaveniLobby zive={undefined} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  expect(screen.getByLabelText(/location/i)).toHaveValue("10875");
  expect(screen.getByLabelText(/map size/i)).toHaveValue("");
  expect(screen.getByLabelText(/game speed/i)).toHaveValue("2");
  expect(screen.getByLabelText(/population/i)).toHaveValue(200);
  expect(screen.getByLabelText(/allow cheats/i)).not.toBeChecked();
  // Bez snímku není co načítat.
  expect(screen.getByRole("button", { name: /načíst uložené/i })).toBeDisabled();
});

// Nastavení se propisuje samo, po krátkém odkladu — žádné „Uložit“, aby se
// změna dostala do kontroly lobby a k druhému adminovi.
it("živé hodnoty převezme a každou změnu pošle sama", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ mapaId: 10878, populace: 150 }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);
  expect(screen.getByLabelText(/location/i)).toHaveValue("10878");

  fireEvent.change(screen.getByLabelText(/location/i), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText(/map size/i), { target: { value: "168" } });
  fireEvent.change(screen.getByLabelText(/game speed/i), { target: { value: "3" } });
  fireEvent.click(screen.getByLabelText(/allow cheats/i));

  await waitFor(() => expect(onZmena).toHaveBeenCalled());
  // Několik kliknutí rychle za sebou = jedno odeslání s posledním stavem.
  expect(onZmena).toHaveBeenCalledTimes(1);
  expect(onZmena).toHaveBeenLastCalledWith({ ...VYCHOZI_NASTAVENI, mapaId: null, velikost: 168, rychlost: 3, populace: 150, cheaty: true });
});

it("změna ze serveru (druhý admin) se převezme, když tu nic nečeká", () => {
  const { rerender } = render(<NastaveniLobby zive={{ populace: 150 }} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  rerender(<NastaveniLobby zive={{ populace: 300 }} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  expect(screen.getByLabelText(/population/i)).toHaveValue(300);
});

// Rozložení kopíruje herní panel: řádky v pořadí hry, pak Team Settings a
// Advanced Settings. Mimo hlavní kontrolu jde všechno nastavit na „–“ (je to
// jedno); AI Difficulty a Lock Teams tak začínají. Zaškrtávátko jde dokola
// vypnuto → zapnuto → „–“, Allow Cheats jen vypnuto ↔ zapnuto.
it("volby mimo hlavní kontrolu jde nastavit na „–“, zaškrtávátka mají tři stavy", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={undefined} ulozene={null} onZmena={onZmena} onUlozit={nic} />);
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

  await waitFor(() => expect(onZmena).toHaveBeenCalled());
  expect(onZmena).toHaveBeenLastCalledWith({ ...VYCHOZI_NASTAVENI, sadaCivilizaci: 2, primeri: 20, lockTeams: false, recordGame: null, cheaty: false });
});

// Uložit = snímek na serveru (jen zavolá rodiče). Načíst uložené a Reset
// nasadí jiné živé nastavení hned, bez odkladu.
it("Uložit dělá snímek, Načíst uložené a Reset nasadí živé nastavení hned", () => {
  const onZmena = vi.fn();
  const onUlozit = vi.fn();
  render(<NastaveniLobby zive={{ populace: 300 }} ulozene={{ populace: 150 }} onZmena={onZmena} onUlozit={onUlozit} />);

  fireEvent.click(screen.getByRole("button", { name: /uložit nastavení lobby/i }));
  expect(onUlozit).toHaveBeenCalledTimes(1);
  expect(onZmena).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /načíst uložené/i }));
  expect(screen.getByLabelText(/population/i)).toHaveValue(150);
  expect(onZmena).toHaveBeenLastCalledWith({ ...VYCHOZI_NASTAVENI, populace: 150 });

  fireEvent.click(screen.getByRole("button", { name: /reset nastavení/i }));
  expect(screen.getByLabelText(/population/i)).toHaveValue(200);
  expect(onZmena).toHaveBeenLastCalledWith(VYCHOZI_NASTAVENI);
});

it("bez Team Together je Team Positions zašedlé a nastavené na „–“", () => {
  render(<NastaveniLobby zive={{ teamPositions: true }} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  const positions = screen.getByLabelText(/team positions/i) as HTMLInputElement;
  expect(positions).toBeEnabled();
  fireEvent.click(screen.getByLabelText(/team together/i)); // zapnuto → –
  expect(positions).toBeEnabled();
  fireEvent.click(screen.getByLabelText(/team together/i)); // – → vypnuto
  expect(positions).toBeDisabled();
  expect(positions.indeterminate).toBe(true);
});

it("AI Difficulty je seřazená podle obtížnosti", () => {
  render(<NastaveniLobby zive={undefined} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  const volby = Array.from((screen.getByLabelText(/ai difficulty/i) as HTMLSelectElement).options).map((o) => o.text);
  expect(volby).toEqual(["–", "Easiest", "Standard", "Moderate", "Hard", "Hardest", "Extreme"]);
});
