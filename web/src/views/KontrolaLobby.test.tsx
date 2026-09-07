import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { KontrolaLobby } from "./KontrolaLobby.js";

const vysledek: KontrolaLobbyVysledek = {
  nalezeno: true,
  kontroly: [
    { klic: "divaci", ok: true, text: "Diváci povoleni", sekce: "hlavni" },
    { klic: "heslo", ok: false, text: "Lobby nemá heslo", sekce: "hlavni", varovani: true },
    { klic: "hraci", ok: false, text: "Chybí Pepa", sekce: "hlavni" },
    { klic: "mapa", ok: false, text: "Mapa: Black Forest, má být Arabia", sekce: "hlavni" },
    { klic: "lockTeams", ok: false, text: "Lock Teams: vypnuto, má být zapnuto", sekce: "dalsi" },
    { klic: "recordGame", ok: true, text: "Record Game: zapnuto", sekce: "dalsi" },
  ],
};

it("klik zkontroluje a vypíše fajfky, křížky a upozornění; souhrn počítá jen chyby hlavní sekce", async () => {
  const onKontrola = vi.fn().mockResolvedValue(vysledek);
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} />);

  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));

  expect(onKontrola).toHaveBeenCalledWith(3);
  await screen.findByTestId("kontroly");
  const hlavni = screen.getByTestId("kontroly").querySelectorAll("li");
  expect(hlavni).toHaveLength(4);
  expect(hlavni[0]).toHaveClass("ok");
  expect(hlavni[1]).toHaveClass("varovani");
  expect(hlavni[2]).toHaveClass("spatne");
  expect(screen.getByTestId("kontrola-souhrn")).toHaveTextContent("2 věci k opravě");
  expect(screen.queryByTestId("fajfka-kontrola")).not.toBeInTheDocument();
  // Další nastavení ve vlastní sbalené sekci s počtem odchylek.
  const dalsi = screen.getByTestId("dalsi-nastaveni");
  expect(dalsi).toHaveTextContent(/1 jinak/);
  expect(dalsi.querySelectorAll("li")).toHaveLength(2);
});

// Heslo je jen upozornění a další nastavení jsou Robova věc: ani jedno nesmí
// hostovi sebrat fajfku, jinak by se „Výborně, můžete hrát“ neukázalo nikdy.
it("bez chyb v hlavní sekci je lobby v pořádku i s upozorněním a odchylkou v dalším nastavení", async () => {
  const onVerdikt = vi.fn();
  const onKontrola = vi.fn().mockResolvedValue({
    nalezeno: true,
    kontroly: [
      { klic: "divaci", ok: true, text: "Diváci povoleni", sekce: "hlavni" },
      { klic: "heslo", ok: false, text: "Lobby nemá heslo", sekce: "hlavni", varovani: true },
      { klic: "lockTeams", ok: false, text: "Lock Teams: vypnuto", sekce: "dalsi" },
    ],
  });
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} onVerdikt={onVerdikt} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByTestId("kontrola-souhrn")).toHaveTextContent(/v pořádku/i);
  expect(screen.getByTestId("fajfka-kontrola")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /kontrola lobby/i })).toBeInTheDocument();
  expect(onVerdikt).toHaveBeenLastCalledWith(true);
});

it("lobby mimo seznam a chyba serveru mají vlastní hlášky a verdikt nemají", async () => {
  const onVerdikt = vi.fn();
  const onKontrola = vi.fn().mockResolvedValueOnce({ nalezeno: false, kontroly: [] }).mockRejectedValueOnce(new Error("Seznam lobby se nepodařilo stáhnout."));
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} onVerdikt={onVerdikt} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByRole("status")).toHaveTextContent(/není/i);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/nepodařilo/i);
  expect(onVerdikt).toHaveBeenCalledWith(null);
  expect(onVerdikt).not.toHaveBeenCalledWith(true);
});

it("v automatickém režimu kontroluje sama a po odpojení přestane", async () => {
  const onKontrola = vi.fn().mockResolvedValue(vysledek);
  const { unmount } = render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} automaticky intervalMs={30} />);
  await waitFor(() => expect(onKontrola.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 2000 });
  unmount();
  const po = onKontrola.mock.calls.length;
  await new Promise((r) => setTimeout(r, 120));
  expect(onKontrola.mock.calls.length).toBe(po);
});
