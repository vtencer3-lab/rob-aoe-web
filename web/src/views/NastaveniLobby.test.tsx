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

// V režimu Empire Wars je Empire Wars dané samotným režimem: hra
// zaškrtávátko v Advanced Settings odškrtne a znepřístupní. Panel to má
// zrcadlit, ať Rob nenastaví kombinaci, která ve hře nejde.
it("Game Mode Empire Wars odškrtne a zamkne zaškrtávátko Empire Wars", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ rezim: 0, empireWars: true }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);
  const zaskrtavatko = screen.getByLabelText(/empire wars mode/i) as HTMLInputElement;
  expect(zaskrtavatko).toBeEnabled();

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "13" } });

  expect(zaskrtavatko).toBeDisabled();
  expect(zaskrtavatko).not.toBeChecked();
  await waitFor(() => expect(onZmena).toHaveBeenLastCalledWith(expect.objectContaining({ rezim: 13, empireWars: false })));
});

// Ověřeno naživo 9. 9. 2026 z vlastní lobby: přepnutí na Empire Wars
// přehodilo i Starting Age na Feudal a Victory na Standard.
it("Empire Wars nasadí i Feudal a Standard victory, jak to dělá hra", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ rezim: 0, pocatecniVek: 0, vitezstvi: 1 }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "13" } });

  expect(screen.getByLabelText(/starting age/i)).toHaveValue("3");
  expect(screen.getByLabelText(/victory/i)).toHaveValue("9");
  await waitFor(() =>
    expect(onZmena).toHaveBeenLastCalledWith(expect.objectContaining({ rezim: 13, pocatecniVek: 3, vitezstvi: 9, empireWars: false })),
  );
});

// Ověřeno naživo: přechod na Empire Wars odškrtne i Regicide, Antiquity
// nechá být, a ani jedno z nich (na rozdíl od Empire Wars) nezamkne.
it("Empire Wars odškrtne modifikátory hry, Antiquity nechá být", async () => {
  const onZmena = vi.fn();
  render(
    <NastaveniLobby
      zive={{ rezim: 0, regicide: true, cheaty: true, turbo: true, fullTechTree: true, suddenDeath: true, antiquity: true }}
      ulozene={null}
      onZmena={onZmena}
      onUlozit={nic}
    />,
  );

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "13" } });

  for (const popis of [/regicide mode/i, /allow cheats/i, /turbo mode/i, /full tech tree/i, /sudden death mode/i]) {
    expect(screen.getByLabelText(popis)).not.toBeChecked();
    // Odškrtnout ano, zamknout ne — ve hře se s nimi dá dál hýbat.
    expect(screen.getByLabelText(popis)).toBeEnabled();
  }
  expect(screen.getByLabelText(/antiquity mode/i)).toBeChecked();
  await waitFor(() =>
    expect(onZmena).toHaveBeenLastCalledWith(
      expect.objectContaining({ regicide: false, cheaty: false, turbo: false, fullTechTree: false, suddenDeath: false, antiquity: true }),
    ),
  );
});

// Starting Age a Victory hra v Empire Wars nezamyká — jen je přepne.
it("Starting Age a Victory zůstanou v Empire Wars nastavitelné", () => {
  render(<NastaveniLobby zive={{ rezim: 13 }} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  expect(screen.getByLabelText(/starting age/i)).toBeEnabled();
  expect(screen.getByLabelText(/victory/i)).toBeEnabled();
});

it("odchod z Empire Wars nastavení nevrací — jen odemkne zaškrtávátko", () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ rezim: 13, pocatecniVek: 3, vitezstvi: 9 }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "0" } });

  expect(screen.getByLabelText(/empire wars mode/i)).toBeEnabled();
  expect(screen.getByLabelText(/starting age/i)).toHaveValue("3");
});

it("odchod z Empire Wars zaškrtávátko zase odemkne", () => {
  render(<NastaveniLobby zive={{ rezim: 13 }} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  expect(screen.getByLabelText(/empire wars mode/i)).toBeDisabled();

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "0" } });
  expect(screen.getByLabelText(/empire wars mode/i)).toBeEnabled();
});

// Treaty Length není volné číslo: hra nabízí jen [None] a pak pětiminutové
// kroky do hodiny, po nich rovnou 90 minut. Volné pole svádělo k hodnotě,
// kterou ve hře nejde nastavit.
it("Treaty Length je nabídka, ne volné číslo", () => {
  render(<NastaveniLobby zive={{ primeri: 30 }} ulozene={null} onZmena={vi.fn()} onUlozit={nic} />);
  const pole = screen.getByLabelText(/treaty length/i) as HTMLSelectElement;
  expect(pole.tagName).toBe("SELECT");
  expect(pole).toHaveValue("30");

  const volby = Array.from(pole.options).map((o) => o.text);
  expect(volby).toEqual(["–", "[None]", "5 Minutes", "10 Minutes", "15 Minutes", "20 Minutes", "25 Minutes", "30 Minutes", "35 Minutes", "40 Minutes", "45 Minutes", "50 Minutes", "55 Minutes", "60 Minutes", "90 Minutes"]);
});

it("výběr příměří pošle minuty jako číslo", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ primeri: 0 }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);

  fireEvent.change(screen.getByLabelText(/treaty length/i), { target: { value: "90" } });

  await waitFor(() => expect(onZmena).toHaveBeenLastCalledWith(expect.objectContaining({ primeri: 90 })));
});

// Totéž co Empire Wars, ověřeno naživo: režim Regicide svoje zaškrtávátko
// odškrtne a zamkne. Ostatního nastavení se nedotýká.
it("Game Mode Regicide odškrtne a zamkne zaškrtávátko Regicide", async () => {
  const onZmena = vi.fn();
  render(<NastaveniLobby zive={{ rezim: 0, regicide: true, cheaty: true }} ulozene={null} onZmena={onZmena} onUlozit={nic} />);

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "1" } });

  expect(screen.getByLabelText(/regicide mode/i)).toBeDisabled();
  expect(screen.getByLabelText(/regicide mode/i)).not.toBeChecked();
  // Zamyká se jen zaškrtávátko režimu; ostatní jdou dál přepnout.
  expect(screen.getByLabelText(/empire wars mode/i)).toBeEnabled();
  await waitFor(() => expect(onZmena).toHaveBeenLastCalledWith(expect.objectContaining({ rezim: 1, regicide: false, cheaty: false })));
});

// Sudden Death: zamkne svoje zaškrtávátko jako Empire Wars a Regicide,
// shodí modifikátory a přehodí Victory na Conquest (ověřeno naživo —
// lobby po přepnutí poslala 81 = 1).
it("Game Mode Sudden Death zamkne svoje zaškrtávátko a nasadí Conquest", async () => {
  const onZmena = vi.fn();
  render(
    <NastaveniLobby zive={{ rezim: 0, vitezstvi: 9, cheaty: true, turbo: true, antiquity: true }} ulozene={null} onZmena={onZmena} onUlozit={nic} />,
  );

  fireEvent.change(screen.getByLabelText(/game mode/i), { target: { value: "11" } });

  expect(screen.getByLabelText(/sudden death mode/i)).toBeDisabled();
  expect(screen.getByLabelText(/sudden death mode/i)).not.toBeChecked();
  expect(screen.getByLabelText(/victory/i)).toHaveValue("1");
  expect(screen.getByLabelText(/allow cheats/i)).not.toBeChecked();
  // Antiquity zůstává i tady.
  expect(screen.getByLabelText(/antiquity mode/i)).toBeChecked();
  await waitFor(() =>
    expect(onZmena).toHaveBeenLastCalledWith(expect.objectContaining({ rezim: 11, vitezstvi: 1, cheaty: false, turbo: false, antiquity: true })),
  );
});
