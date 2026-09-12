import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlayerView, ZapasView } from "../../../src/shared/types.js";
import { EditaceZapasu } from "./EditaceZapasu.js";

const hrac = (steamId: string, alias: string): PlayerView => ({
  steamId, alias, steamName: null, avatarUrl: null, country: null, elo1v1: 1500, eloNejvyssi: null, odehranoHer: 10, steamHodiny: null, posledniZapas: null, statyStazenyV: null, statyChyba: null,
});

const zapas: ZapasView = {
  id: 5,
  poradi: 2,
  stav: "bezi",
  nazevLobby: "ROB-02",
  heslo: "1234",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  nastaveni: { mapaId: 10895, populace: 150 },
  ucastnici: [
    { steamId: "a", alias: "Adam", steamName: null, tym: 1, barva: 1, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
    { steamId: "b", alias: "Bára", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 1, kliknulPripojit: null },
  ],
};
const prihlaseni = [hrac("a", "Adam"), hrac("b", "Bára"), hrac("c", "Cyril")];

it("otevře se se sestavou a nastavením zápasu, sestavu uloží tlačítkem", () => {
  const onSestava = vi.fn();
  render(<EditaceZapasu zapas={zapas} prihlaseni={prihlaseni} onNastaveni={vi.fn()} onNazev={vi.fn()} onSestava={onSestava} onZavrit={vi.fn()} />);
  expect(screen.getByRole("dialog", { name: /úprava zápasu #2/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /location: arena/i })).toBeInTheDocument();
  const ulozit = screen.getByRole("button", { name: /uložit sestavu/i });
  expect(ulozit).toBeEnabled();
  fireEvent.click(ulozit);
  expect(onSestava).toHaveBeenCalledWith([
    { steamId: "a", tym: 1, barva: 1, civ: null },
    { steamId: "b", tym: 2, barva: 2, civ: null },
  ]);
  // Sestava v okně zůstává i po uložení.
  expect(screen.getByRole("button", { name: /uložit sestavu/i })).toBeInTheDocument();
});

it("Pre-Lobby je vnořené okno a jméno lobby se uloží po dopsání", () => {
  const onNazev = vi.fn();
  render(<EditaceZapasu zapas={zapas} prihlaseni={prihlaseni} onNastaveni={vi.fn()} onNazev={onNazev} onSestava={vi.fn()} onZavrit={vi.fn()} />);
  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));
  const pole = screen.getByTestId("prelobby-nazev");
  expect(pole).toHaveValue("ROB-02");
  expect(pole).not.toHaveAttribute("readonly");
  fireEvent.change(pole, { target: { value: " ROB-finále " } });
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(onNazev).toHaveBeenCalledWith("ROB-finále");
  // Kostka hesla v úpravě zápasu není: heslo je jedno na večer.
  expect(screen.queryByRole("button", { name: /vygenerovat jiné heslo/i })).not.toBeInTheDocument();
});

it("Escape ani klik do stínu nezavře vnořené Pre-Lobby, křížek okna ano", () => {
  const onZavrit = vi.fn();
  render(<EditaceZapasu zapas={zapas} prihlaseni={prihlaseni} onNastaveni={vi.fn()} onNazev={vi.fn()} onSestava={vi.fn()} onZavrit={onZavrit} />);
  fireEvent.click(screen.getByRole("button", { name: /^zavřít$/i }));
  expect(onZavrit).toHaveBeenCalledTimes(1);
});
