import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, ZapasView } from "../../../src/shared/types.js";
import { Rezie } from "./Rezie.js";

const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "bezi",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: "aoe2de://1/234230181",
  viteznyTym: null,
  ucastnici: [
    { steamId: "a", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, kliknulPripojit: "2026-09-03T12:00:00.000Z" },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

const stav: AkceStavPayload = {
  akce: { id: 1, nazev: "večer", stav: "bezi" },
  prihlaseni: [],
  zapasy: [zapas],
};

const props = {
  onVytvoritZapas: vi.fn(),
  onStav: vi.fn(),
  onVysledek: vi.fn(),
  onHost: vi.fn(),
};

it("stav účastníka pojmenuje jako kliknutí, ne jako přítomnost v lobby", () => {
  render(<Rezie stav={stav} {...props} />);
  expect(screen.getByText(/klikl na připojení/i)).toBeInTheDocument();
  expect(screen.queryByText(/je v lobby/i)).not.toBeInTheDocument();
});

// KRITICKÉ: Spectate se odemyká výhradně podle spectatorUri, tedy podle toho, že host
// vložil odkaz z lobby. Ověřeno na živé hře — aoe2de://1/<id> funguje jak v otevřené,
// nenaplněné lobby (Rob vidí nastavení a může upozornit na špatně založenou hru), tak
// za běhu zápasu. Jakýkoliv další zámek by Roba brzdil přesně ve chvíli, kdy je
// nejužitečnější; proto tu žádný není.
it("spectate se odemkne, jakmile host vloží odkaz do lobby", () => {
  render(<Rezie stav={stav} {...props} />);
  const odkaz = screen.getByTestId("spectate");
  expect(odkaz).toHaveAttribute("aria-disabled", "false");
  expect(odkaz).toHaveAttribute("href", "aoe2de://1/234230181");
});


// Potvrzení hosta je jen informační stavový řádek, nikdy zámek — proto k němu neexistuje
// žádné tlačítko na "odemčení i bez potvrzení". Spectate se nikdy na potvrzení nezamyká.


it("záložní údaje jsou vidět pořád", () => {
  render(<Rezie stav={stav} {...props} />);
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
  expect(screen.getByText("234230181")).toBeInTheDocument();
});

it("bez čísla lobby spectate vůbec nenabízí", () => {
  const bez = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<Rezie stav={bez} {...props} />);
  expect(screen.getByTestId("spectate")).toHaveAttribute("aria-disabled", "true");
});

// Tlačítko na přehození hosta je u každého, kdo hostem není, a setHost vynuluje
// lobby_id — jeden chybný klik u běžícího zápasu zabije odkaz všem hráčům
// i Robův vlastní Spectate. Semantika je správná, chybělo zábradlí.
afterEach(() => {
  vi.restoreAllMocks();
});

function klikniNaHostuje(index = 0) {
  const tlacitka = screen.getAllByRole("button", { name: /udělat hostem/i });
  fireEvent.click(tlacitka[index]!);
}

it("přehození hosta u zápasu s odkazem se ptá a při odmítnutí nic neudělá", () => {
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onHost = vi.fn();
  render(<Rezie stav={stav} {...props} onHost={onHost} />);

  klikniNaHostuje();

  expect(potvrzeni).toHaveBeenCalledTimes(1);
  expect(potvrzeni.mock.calls[0]![0]).toMatch(/234230181/);
  expect(onHost).not.toHaveBeenCalled();
});

it("po potvrzení se host přehodí", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const onHost = vi.fn();
  render(<Rezie stav={stav} {...props} onHost={onHost} />);

  klikniNaHostuje();

  expect(onHost).toHaveBeenCalledWith(1, "b");
});

it("bez odkazu do lobby se na nic neptá — není co ztratit", () => {
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onHost = vi.fn();
  const bezOdkazu = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<Rezie stav={bezOdkazu} {...props} onHost={onHost} />);

  klikniNaHostuje();

  expect(potvrzeni).not.toHaveBeenCalled();
  expect(onHost).toHaveBeenCalledWith(1, "b");
});

// Tlačítko u toho, kdo už hostuje, nedávalo smysl — nabízelo akci, která by
// nic nezměnila, a vedle textového „(host)“ uprostřed věty se dvě stejná
// tlačítka pletla. Hostitele teď nese odznak, ostatní tlačítko.
it("u hosta tlačítko na přehození vůbec není", () => {
  render(<Rezie stav={stav} {...props} />);

  const tlacitka = screen.getAllByRole("button", { name: /udělat hostem/i });
  expect(tlacitka).toHaveLength(zapas.ucastnici.length - 1);
});

it("hostitele označí odznak, a právě jeden", () => {
  render(<Rezie stav={stav} {...props} />);

  const odznaky = screen.getAllByTestId("odznak-host");
  expect(odznaky).toHaveLength(1);
  expect(odznaky[0]!.closest("li")).toHaveTextContent("TenceR");
});
