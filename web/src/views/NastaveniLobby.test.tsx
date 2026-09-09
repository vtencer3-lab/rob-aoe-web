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
// jedno); AI Difficulty tak začíná. Lock Teams začíná zapnutý — sestavu skládá
// Rob a v lobby se s ní hýbat nemá. Zaškrtávátko jde dokola vypnuto → zapnuto
// → „–“, Allow Cheats jen vypnuto ↔ zapnuto.
it("volby mimo hlavní kontrolu jde nastavit na „–“, zaškrtávátka mají tři stavy", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={undefined} ulozene={null} onZmena={onZmena} onUlozit={nic} />);
  expect(screen.getByLabelText(/ai difficulty/i)).toHaveValue("");
  const lockTeams = screen.getByLabelText(/lock teams/i) as HTMLInputElement;
  expect(lockTeams.checked).toBe(true);
  expect(lockTeams.indeterminate).toBe(false);
  expect(screen.getByRole("group", { name: /team settings/i })).toBeInTheDocument();
  expect(screen.getByRole("group", { name: /advanced settings/i })).toBeInTheDocument();

  fireEvent.click(screen.getByLabelText(/chronicles/i));
  fireEvent.change(screen.getByLabelText(/treaty length/i), { target: { value: "20" } });
  fireEvent.click(lockTeams); // zapnuto → –
  fireEvent.click(screen.getByLabelText(/record game/i)); // zapnuto → –
  fireEvent.click(screen.getByLabelText(/allow cheats/i)); // vypnuto → zapnuto
  fireEvent.click(screen.getByLabelText(/allow cheats/i)); // zapnuto → vypnuto (žádné „–“)

  await waitFor(() => expect(onZmena).toHaveBeenCalled());
  expect(onZmena).toHaveBeenLastCalledWith({ ...VYCHOZI_NASTAVENI, sadaCivilizaci: 2, primeri: 20, lockTeams: null, recordGame: null, cheaty: false });
});

// Reset nasadí výchozí nastavení hned, bez odkladu — na rozdíl od psaní do
// políček, které se posílá se zpožděním.
it("Reset nasadí výchozí nastavení hned", () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ populace: 300 }} ulozene={{ populace: 150 }} onZmena={onZmena} onUlozit={vi.fn()} />);

  fireEvent.click(screen.getByRole("button", { name: /reset nastavení/i }));
  expect(screen.getByLabelText(/population/i)).toHaveValue(200);
  expect(onZmena).toHaveBeenLastCalledWith(VYCHOZI_NASTAVENI);
});

// Preset se neosvědčil a od 9. 9. 2026 je schovaný. Server obě cesty umí
// dál, takže se dá vrátit přepnutím konstanty PRESETY_VIDET.
it("tlačítka na preset zatím nejsou vidět", () => {
  render(<NastaveniLobby zive={{ populace: 300 }} ulozene={{ populace: 150 }} onZmena={vi.fn()} onUlozit={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /uložit preset lobby/i })).toBeNull();
  expect(screen.queryByRole("button", { name: /načíst uložený preset/i })).toBeNull();
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

// Pravé tlačítko jde kruhem pozpátku: po levém (vypnuto → zapnuto) ho pravé
// vrátí na vypnuto; po levém (zapnuto → „–“) ho pravé vrátí na zapnuto.
it("pravé tlačítko na zaškrtávátku dělá opačný krok než levé", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ turbo: false }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);
  const turbo = screen.getByLabelText(/turbo mode/i) as HTMLInputElement;
  fireEvent.click(turbo); // vypnuto → zapnuto
  expect(turbo).toBeChecked();
  fireEvent.contextMenu(turbo.closest("label")!); // zpět na vypnuto
  expect(turbo).not.toBeChecked();
  fireEvent.click(turbo); // zapnuto
  fireEvent.click(turbo); // „–“
  expect(turbo.indeterminate).toBe(true);
  fireEvent.contextMenu(turbo.closest("label")!); // zpět na zapnuto
  expect(turbo).toBeChecked();
  expect(turbo.indeterminate).toBe(false);
  await waitFor(() => expect(onZmena).toHaveBeenCalled());
  expect(onZmena).toHaveBeenLastCalledWith(expect.objectContaining({ turbo: true }));
});
