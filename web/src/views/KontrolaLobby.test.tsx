import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { KontrolaLobby } from "./KontrolaLobby.js";

const vysledek: KontrolaLobbyVysledek = {
  nalezeno: true,
  kontroly: [
    { klic: "divaci", stav: "ok", text: "Diváci povoleni", sekce: "hlavni" },
    { klic: "heslo", stav: "varovani", text: "Lobby nemá heslo", sekce: "hlavni" },
    { klic: "hraci", stav: "spatne", text: "Chybí Pepa", sekce: "hlavni" },
    { klic: "mapa", stav: "spatne", text: "Mapa: Black Forest, má být Arabia", sekce: "hlavni" },
    { klic: "lockTeams", stav: "spatne", text: "Lock Teams: vypnuto, má být zapnuto", sekce: "dalsi" },
    { klic: "recordGame", stav: "ok", text: "Record Game: zapnuto", sekce: "dalsi" },
    { klic: "aiObtiznost", stav: "jedno", text: "AI Difficulty: Hard", sekce: "dalsi" },
  ],
};

it("klik zkontroluje a vypíše čtyři stavy; souhrn počítá červené z obou sekcí", async () => {
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
  expect(screen.getByTestId("kontrola-souhrn")).toHaveTextContent("3 věci k opravě");
  expect(screen.queryByTestId("fajfka-kontrola")).not.toBeInTheDocument();
  // Další nastavení ve vlastní, rozbalené sekci s počtem odchylek; „–“ je šedé.
  const dalsi = screen.getByTestId("dalsi-nastaveni");
  expect(dalsi).toHaveAttribute("open");
  expect(dalsi).toHaveTextContent(/1 jinak/);
  const radky = dalsi.querySelectorAll("li");
  expect(radky).toHaveLength(3);
  expect(radky[2]).toHaveClass("jedno");
});

// Sbalení „Dalšího nastavení“ musí přežít další kontrolu — jinak by se při
// každém kliknutí (a každých 5 s) zase rozbalilo.
it("sbalené další nastavení zůstane sbalené i po další kontrole", async () => {
  const onKontrola = vi.fn().mockResolvedValue(vysledek);
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  const dalsi = await screen.findByTestId("dalsi-nastaveni");
  await userEvent.click(dalsi.querySelector("summary")!);
  expect(dalsi).not.toHaveAttribute("open");
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  await waitFor(() => expect(onKontrola).toHaveBeenCalledTimes(2));
  expect(screen.getByTestId("dalsi-nastaveni")).not.toHaveAttribute("open");
  // A seznam během kontroly nezmizel.
  expect(screen.getByTestId("kontroly")).toBeInTheDocument();
});

// Upozornění (heslo) a „je to jedno“ fajfku neberou; jen červená.
it("bez červené je lobby v pořádku i s upozorněním a šedým „je to jedno“", async () => {
  const onVerdikt = vi.fn();
  const onKontrola = vi.fn().mockResolvedValue({
    nalezeno: true,
    kontroly: [
      { klic: "divaci", stav: "ok", text: "Diváci povoleni", sekce: "hlavni" },
      { klic: "heslo", stav: "varovani", text: "Lobby nemá heslo", sekce: "hlavni" },
      { klic: "lockTeams", stav: "jedno", text: "Lock Teams: vypnuto", sekce: "dalsi" },
    ],
  });
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} onVerdikt={onVerdikt} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByTestId("kontrola-souhrn")).toHaveTextContent(/v pořádku/i);
  expect(screen.getByTestId("fajfka-kontrola")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /kontrola lobby/i })).toBeInTheDocument();
  expect(onVerdikt).toHaveBeenLastCalledWith(true);
});

it("červená v dalším nastavení fajfku bere", async () => {
  const onKontrola = vi.fn().mockResolvedValue({
    nalezeno: true,
    kontroly: [
      { klic: "divaci", stav: "ok", text: "Diváci povoleni", sekce: "hlavni" },
      { klic: "lockTeams", stav: "spatne", text: "Lock Teams: vypnuto, má být zapnuto", sekce: "dalsi" },
    ],
  });
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByTestId("kontrola-souhrn")).toHaveTextContent("1 věc k opravě");
  expect(screen.queryByTestId("fajfka-kontrola")).not.toBeInTheDocument();
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

// Pre-lobby má vlastní rozbalovací sekci vedle „Dalšího nastavení“ — je to
// nastavení z okna zakládání, které Rob za večer řeší jednou.
it("pre-lobby řádky ukáže ve vlastní sekci", async () => {
  const onKontrola = vi.fn().mockResolvedValue({
    nalezeno: true,
    kontroly: [
      { klic: "divaci", stav: "ok", text: "Diváci povoleni", sekce: "hlavni" },
      { klic: "maxHracu", stav: "spatne", text: "Max. hráčů: 8, má být 4", sekce: "prelobby" },
      { klic: "region", stav: "jedno", text: "Region: westeurope", sekce: "prelobby" },
    ],
  });
  render(<KontrolaLobby zapasId={1} onKontrola={onKontrola} automaticky />);

  const sekce = await screen.findByTestId("kontroly-prelobby");
  expect(sekce).toHaveTextContent("Max. hráčů: 8, má být 4");
  expect(sekce).toHaveTextContent("Region: westeurope");
  // Do hlavní sekce se nepletou.
  expect(screen.getByTestId("kontroly")).not.toHaveTextContent("Max. hráčů");
});
