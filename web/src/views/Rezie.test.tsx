import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { AkceStavPayload, ZapasView } from "../../../src/shared/types.js";
import { Rezie } from "./Rezie.js";

const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "lobby_otevrena",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: "aoe2de://1/234230181",
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: "a", alias: "TenceR", tym: 1, barva: 1, jeHost: true, kliknulPripojit: "2026-09-03T12:00:00.000Z" },
    { steamId: "b", alias: "Pepa_CZ", tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
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

// KRITICKÉ: Spectate se odemyká podle spectatorUri (host vložil odkaz z lobby), NE podle
// hostPotvrdil. To bylo ověřeno na živé hře — aoe2de://1/<id> funguje jak v otevřené,
// nenaplněné lobby (Rob vidí seating a může upozornit na špatně nastavenou hru), tak
// za běhu zápasu. Čekat na potvrzení hosta by Roba zbytečně brzdilo přesně ve chvíli,
// kdy je nejužitečnější. Proto tenhle fixture (hostPotvrdil: null, spectatorUri vyplněný)
// musí dát odemčený odkaz.
it("spectate se odemkne, jakmile host vloží odkaz do lobby — nečeká na jeho potvrzení", () => {
  render(<Rezie stav={stav} {...props} />);
  const odkaz = screen.getByTestId("spectate");
  expect(odkaz).toHaveAttribute("aria-disabled", "false");
  expect(odkaz).toHaveAttribute("href", "aoe2de://1/234230181");
});

it("potvrzení hosta spectate dál nechává odemčené a mířící na divácký odkaz", () => {
  const potvrzeny = { ...stav, zapasy: [{ ...zapas, hostPotvrdil: "2026-09-03T12:00:00.000Z" }] };
  render(<Rezie stav={potvrzeny} {...props} />);
  const odkaz = screen.getByTestId("spectate");
  expect(odkaz).toHaveAttribute("aria-disabled", "false");
  expect(odkaz).toHaveAttribute("href", "aoe2de://1/234230181");
});

// Potvrzení hosta je jen informační stavový řádek, nikdy zámek — proto k němu neexistuje
// žádné tlačítko na "odemčení i bez potvrzení". Spectate se nikdy na potvrzení nezamyká.
it("potvrzení hosta je jen stavový řádek — žádné tlačítko na odemčení neexistuje", () => {
  render(<Rezie stav={stav} {...props} />);
  expect(screen.queryByRole("button", { name: /odemknout/i })).not.toBeInTheDocument();
  expect(screen.getByText(/host zatím nepotvrdil/i)).toBeInTheDocument();
});

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
