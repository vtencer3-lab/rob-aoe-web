import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { KartaHrace } from "./KartaHrace.js";

const nehledat = vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null });

const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  stav: "lobby_otevrena",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: null,
  vitez: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, civ: null, elo1v1: 1136, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
  ],
};

it("ukáže barvu a tým velkým písmem", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("modrá");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("tým 1");
});

it("řekne, s kým se sdílí civilizace", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByText(/sdílíš/)).toHaveTextContent("Pepa_CZ");
});

it("v 1v1 o sdílení civilizace nemluví", () => {
  const jeden: ZapasView = {
    ...zapas,
    ucastnici: [zapas.ucastnici[0]!, zapas.ucastnici[2]!],
  };
  render(<KartaHrace zapas={jeden} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.queryByText(/sdílíš/i)).not.toBeInTheDocument();
});

// Název lobby a číslo z karty zmizely (7. 9. 2026) stejně jako z režie:
// tlačítko do hry stačí, zůstává jen heslo uprostřed.
it("ukáže heslo, ale ne název ani číslo lobby", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
  expect(screen.queryByText("ROB-07")).not.toBeInTheDocument();
  expect(screen.queryByText("234230181")).not.toBeInTheDocument();
  expect(screen.getByTestId("titulek-zapasu")).toHaveTextContent("Zápas #7");
  expect(screen.getByRole("heading", { name: /připojuješ se/i })).toBeInTheDocument();
  expect(screen.getByTestId("fajfka-lobby")).toBeInTheDocument();
});

it("dokud host nevložil odkaz, čeká se", () => {
  const bezLobby: ZapasView = { ...zapas, stav: "vyhlaseny", lobbyId: null, joinUri: null };
  render(<KartaHrace zapas={bezLobby} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.queryByRole("link", { name: /připojit/i })).not.toBeInTheDocument();
  expect(screen.getByText(/čeká se na hosta/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /vyhledat lobby/i })).toBeInTheDocument();
  expect(screen.queryByText(/jakmile ji host založí|lobby zatím není vidět|v lobby si nastav/i)).not.toBeInTheDocument();
  expect(screen.queryByTestId("fajfka-lobby")).not.toBeInTheDocument();
});

// Strany zápasu vedle sebe jako řádky ze skládání, jen ke čtení, s VS mezi
// nimi; vlastní řádek je zvýrazněný a civilizace se nedá rozkliknout.
it("ukáže strany zápasu vedle sebe s VS", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByText("VS")).toBeInTheDocument();
  const radky = screen.getAllByTestId("radek-strany");
  expect(radky).toHaveLength(4);
  expect(radky[0]).toHaveClass("ja");
  expect(radky[2]!.querySelector(".elo")).toHaveTextContent("(1136)");
  expect(screen.queryByText(/proti vám/i)).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /civilizace marek/i })).toBeDisabled();
});

it("s odkazem už hledat nenabízí", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.queryByRole("button", { name: /vyhledat lobby/i })).not.toBeInTheDocument();
});

it("odkaz na připojení míří do hry", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByRole("link", { name: /připojit/i })).toHaveAttribute(
    "href",
    "aoe2de://0/234230181",
  );
});

it("kliknutí na připojení se ohlásí serveru", async () => {
  const onPripojit = vi.fn();
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={onPripojit} onHledatLobby={nehledat} />);
  screen.getByRole("link", { name: /připojit/i }).click();
  expect(onPripojit).toHaveBeenCalledWith(1);
});

// Druhý Steam účet bez hodnocené hry alias nemá. Bez fallbacku na steamName
// stojí v „Proti vám“ syrové 64bitové číslo.
it("spoluhráče i soupeře bez aliasu pojmenuje jménem ze Steamu", () => {
  const bezAliasu: ZapasView = {
    ...zapas,
    ucastnici: [
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
      { steamId: "76561199091641101", alias: null, steamName: "TibbarZmr", tym: 1, barva: 1, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
      { steamId: "c", alias: null, steamName: "Marecek", tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
      { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
    ],
  };
  render(<KartaHrace zapas={bezAliasu} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);

  expect(screen.getAllByText(/TibbarZmr/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Marecek/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/76561199091641101/)).not.toBeInTheDocument();
});
