import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlayerView, ZapasView } from "../../../src/shared/types.js";
import { EditaceZapasu, ODKLAD_PROPISU_MS } from "./EditaceZapasu.js";

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
  nastaveni: { mapaId: 10895, populace: 150, aiObtiznost: 3, maxHracu: 8 },
  ucastnici: [
    { steamId: "a", alias: "Adam", steamName: null, tym: 1, barva: 1, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
    { steamId: "b", alias: "Bára", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 1, kliknulPripojit: null },
  ],
};
const prihlaseni = [hrac("a", "Adam"), hrac("b", "Bára"), hrac("c", "Cyril")];

function otevri(prepis: Partial<Parameters<typeof EditaceZapasu>[0]> = {}) {
  const props = { zapas, prihlaseni, onNastaveni: vi.fn(), onNazev: vi.fn(), onSestava: vi.fn(), onZavrit: vi.fn(), ...prepis };
  render(<EditaceZapasu {...props} />);
  return props;
}

it("platná změna sestavy odejde sama po odkladu; Uložit ji pošle hned a zavře", async () => {
  vi.useFakeTimers();
  try {
    const p = otevri();
    expect(screen.getByRole("dialog", { name: /úprava zápasu #2/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset nastavení/i })).not.toBeInTheDocument();
    // Přidání AI dá 1v1v1 — platná sestava. Nejdřív se čeká, po 1,2 s odejde.
    fireEvent.click(screen.getByRole("button", { name: /přidat ai/i }));
    // Po krocích: React s falešnými časovači vykreslí změnu až mezi kroky,
    // a teprve pak vznikne 1,2sekundový časovač propisu.
    await vi.advanceTimersByTimeAsync(300);
    await vi.advanceTimersByTimeAsync(300);
    expect(p.onSestava).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i++) await vi.advanceTimersByTimeAsync(ODKLAD_PROPISU_MS / 2);
    expect(p.onSestava).toHaveBeenCalledTimes(1);
    expect(vi.mocked(p.onSestava).mock.calls[0]![0]).toHaveLength(3);
    // Uložit už neposílá totéž znovu, jen zavře.
    fireEvent.click(screen.getByTestId("ulozit-zapas"));
    expect(p.onSestava).toHaveBeenCalledTimes(1);
    expect(p.onZavrit).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("neplatnou sestavu okno nepustí: zvýrazní chybu, klik vedle nezavře, křížek se ptá a Ano vrátí původní", async () => {
  vi.useFakeTimers();
  try {
    const p = otevri();
    // Odebrat Báru → jeden hráč, to není zápas.
    fireEvent.click(screen.getByRole("button", { name: /vyřadit bára ze sestavy/i }));
    await vi.advanceTimersByTimeAsync(ODKLAD_PROPISU_MS + 100);
    expect(p.onSestava).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("editace-stin"));
    expect(p.onZavrit).not.toHaveBeenCalled();
    expect(screen.getByTestId("souhrn-sestavy")).toHaveClass("chyba");

    fireEvent.click(screen.getByRole("button", { name: /^zavřít$/i }));
    const dotaz = screen.getByRole("alertdialog", { name: /zahodit všechny změny/i });
    fireEvent.click(screen.getByRole("button", { name: /^ne$/i }));
    expect(dotaz).not.toBeInTheDocument();
    expect(p.onZavrit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /^zavřít$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^ano$/i }));
    // Nic z návrhu neodešlo (byl neplatný), takže se ani nic nevrací; okno se zavře.
    expect(p.onSestava).not.toHaveBeenCalled();
    expect(p.onZavrit).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("Pre-Lobby je vnořené okno a jméno lobby se uloží po dopsání", () => {
  const p = otevri();
  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));
  const pole = screen.getByTestId("prelobby-nazev");
  expect(pole).toHaveValue("ROB-02");
  fireEvent.change(pole, { target: { value: " ROB-finále " } });
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(p.onNazev).toHaveBeenCalledWith("ROB-finále");
  expect(screen.queryByRole("button", { name: /vygenerovat jiné heslo/i })).not.toBeInTheDocument();
});

it("hráči se stejnou barvou v různých týmech se zvýrazní, nastavení lobby ne", () => {
  const konflikt = { ...zapas, ucastnici: [
    { steamId: "a", alias: "Adam", steamName: null, tym: 1 as const, barva: 1 as const, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
    { steamId: "b", alias: "Bára", steamName: null, tym: 2 as const, barva: 1 as const, civ: null, jeHost: false, poradi: 1, kliknulPripojit: null },
    { steamId: "c", alias: "Cyril", steamName: null, tym: 2 as const, barva: 2 as const, civ: null, jeHost: false, poradi: 2, kliknulPripojit: null },
  ], nastaveni: { maxHracu: 2, aiObtiznost: null } };
  const p = otevri({ zapas: konflikt });
  fireEvent.click(screen.getByTestId("ulozit-zapas"));
  expect(p.onZavrit).not.toHaveBeenCalled();
  expect(document.querySelector('[data-tah-id="a"]')).toHaveClass("chyba");
  expect(document.querySelector('[data-tah-id="b"]')).toHaveClass("chyba");
  expect(document.querySelector('[data-tah-id="c"]')).not.toHaveClass("chyba");
  expect(document.querySelector('[data-klic="aiObtiznost"]')).not.toHaveClass("chyba");
  expect(document.querySelector(".prava .prelobby-tlacitko")).not.toHaveClass("chyba");
});
