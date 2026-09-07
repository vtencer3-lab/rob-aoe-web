import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { KartaHrace } from "./KartaHrace.js";

const nehledat = vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null });

const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "lobby_otevrena",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: null,
  viteznyTym: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

it("ukáže barvu a tým velkým písmem", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("modrá");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("1");
});

it("řekne, s kým se sdílí civilizace", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByText(/Pepa_CZ/)).toBeInTheDocument();
});

it("v 1v1 o sdílení civilizace nemluví", () => {
  const jeden: ZapasView = {
    ...zapas,
    format: "1v1",
    ucastnici: [zapas.ucastnici[0]!, zapas.ucastnici[2]!],
  };
  render(<KartaHrace zapas={jeden} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.queryByText(/sdílíš/i)).not.toBeInTheDocument();
});

it("ukáže záložní cestu — název lobby, heslo i číslo", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
  expect(screen.getByText("234230181")).toBeInTheDocument();
});

it("dokud host nevložil odkaz, čeká se", () => {
  const bezLobby: ZapasView = { ...zapas, stav: "vyhlaseny", lobbyId: null, joinUri: null };
  render(<KartaHrace zapas={bezLobby} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.queryByRole("link", { name: /připojit/i })).not.toBeInTheDocument();
  expect(screen.getByText(/čeká se na hosta/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /vyhledat hru/i })).toBeInTheDocument();
  expect(screen.queryByText(/nejde odkaz|nefunguje tlačítko/i)).not.toBeInTheDocument();
  expect(screen.getByText(/jakmile ji host založí/i)).toBeInTheDocument();
});

it("s odkazem už hledat nenabízí", () => {
  render(<KartaHrace zapas={zapas} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);
  expect(screen.queryByRole("button", { name: /vyhledat hru/i })).not.toBeInTheDocument();
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
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
      { steamId: "76561199091641101", alias: null, steamName: "TibbarZmr", tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
      { steamId: "c", alias: null, steamName: "Marecek", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
      { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    ],
  };
  render(<KartaHrace zapas={bezAliasu} ja="ja" onPripojit={vi.fn()} onHledatLobby={nehledat} />);

  expect(screen.getByText(/TibbarZmr/)).toBeInTheDocument();
  expect(screen.getByText(/Marecek/)).toBeInTheDocument();
  expect(screen.queryByText(/76561199091641101/)).not.toBeInTheDocument();
});
