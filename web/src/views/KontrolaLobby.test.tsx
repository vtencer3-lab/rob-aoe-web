import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { KontrolaLobby } from "./KontrolaLobby.js";

const vysledek: KontrolaLobbyVysledek = {
  nalezeno: true,
  kontroly: [
    { klic: "divaci", ok: true, text: "Diváci povoleni" },
    { klic: "hraci", ok: false, text: "Chybí Pepa" },
    { klic: "mapa", ok: false, text: "Mapa: Black Forest, má být Arabia" },
  ],
};

it("klik zkontroluje a vypíše fajfky a křížky se souhrnem", async () => {
  const onKontrola = vi.fn().mockResolvedValue(vysledek);
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} />);

  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));

  expect(onKontrola).toHaveBeenCalledWith(3);
  const radky = await screen.findAllByRole("listitem");
  expect(radky).toHaveLength(3);
  expect(radky[0]).toHaveClass("ok");
  expect(radky[1]).toHaveClass("spatne");
  expect(screen.getByTestId("kontrola-souhrn")).toHaveTextContent("2 věci k opravě");
});

it("bez chyb říká, že lobby je v pořádku", async () => {
  const onKontrola = vi.fn().mockResolvedValue({ nalezeno: true, kontroly: [{ klic: "divaci", ok: true, text: "Diváci povoleni" }] });
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByTestId("kontrola-souhrn")).toHaveTextContent(/v pořádku/i);
});

it("lobby mimo seznam a chyba serveru mají vlastní hlášky", async () => {
  const onKontrola = vi.fn().mockResolvedValueOnce({ nalezeno: false, kontroly: [] }).mockRejectedValueOnce(new Error("Seznam lobby se nepodařilo stáhnout."));
  render(<KontrolaLobby zapasId={3} onKontrola={onKontrola} />);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByRole("status")).toHaveTextContent(/není/i);
  await userEvent.click(screen.getByRole("button", { name: /zkontrolovat lobby/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/nepodařilo/i);
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
