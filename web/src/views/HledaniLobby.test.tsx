import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { HledaniLobbyVysledek } from "../../../src/shared/types.js";
import { HledaniLobby } from "./HledaniLobby.js";

const nalezena: HledaniLobbyVysledek = {
  nalezeno: true,
  lobbyId: "504953429",
  nazev: "ROB-01",
  maHeslo: true,
  povolujeDivaky: true,
};

it("klik zavolá hledání s id zápasu a ohlásí nález", async () => {
  const onHledat = vi.fn().mockResolvedValue(nalezena);
  render(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena={false} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat lobby/i }));

  expect(onHledat).toHaveBeenCalledWith(7);
  expect(await screen.findByRole("status")).toHaveTextContent(/lobby nalezena/i);
});

it("nenalezená lobby poradí, že musí být veřejná", async () => {
  const onHledat = vi.fn().mockResolvedValue({ ...nalezena, nalezeno: false, lobbyId: null });
  render(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena={false} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat lobby/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/veřejná/i);
});

it("chybu ze serveru ukáže u tlačítka", async () => {
  const onHledat = vi.fn().mockRejectedValue(new Error("Seznam lobby se nepodařilo stáhnout."));
  render(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena={false} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat lobby/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/nepodařilo stáhnout/i);
});

it("v automatickém režimu se ptá hned a pak opakovaně, dokud běží", async () => {
  const onHledat = vi.fn().mockResolvedValue({ ...nalezena, nalezeno: false, lobbyId: null });
  const { unmount } = render(
    <HledaniLobby zapasId={7} onHledat={onHledat} nalezena={false} automaticky intervalMs={30} />,
  );

  expect(await screen.findByRole("status")).toHaveTextContent(/hledám/i);
  await waitFor(() => expect(onHledat.mock.calls.length).toBeGreaterThanOrEqual(3), { timeout: 2000 });
  expect(await screen.findByRole("status")).toHaveTextContent(/hledám dál/i);

  unmount();
  const poOdpojeni = onHledat.mock.calls.length;
  await new Promise((r) => setTimeout(r, 120));
  expect(onHledat.mock.calls.length).toBe(poOdpojeni);
});

it("bez automatického režimu se samo neptá", async () => {
  const onHledat = vi.fn().mockResolvedValue(nalezena);
  render(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena={false} intervalMs={30} />);
  await new Promise((r) => setTimeout(r, 100));
  expect(onHledat).not.toHaveBeenCalled();
});

it("nalezená lobby: tlačítko zašedlé, stav se jménem z posledního hledání a ikona odkazu", async () => {
  const onHledat = vi.fn().mockResolvedValue(nalezena);
  const { rerender } = render(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena={false} automaticky intervalMs={30} />);
  await screen.findByRole("status");
  rerender(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena odkaz="aoe2de://0/504953429" automaticky intervalMs={30} />);
  expect(screen.getByRole("button", { name: /vyhledat lobby/i })).toBeDisabled();
  expect(screen.getByTestId("lobby-nalezena")).toHaveTextContent("Lobby nalezena („ROB-01“)");
  expect(screen.getByRole("button", { name: /kopírovat odkaz do lobby/i })).toBeInTheDocument();
  const pred = onHledat.mock.calls.length;
  await new Promise((r) => setTimeout(r, 100));
  expect(onHledat.mock.calls.length).toBe(pred);
});

// Stránka načtená s už nalezenou lobby jméno nezná — jedno hledání navíc
// ho doplní, ale dál se pak nehledá.
it("s nalezenou lobby bez jména se zeptá jednou a jméno doplní", async () => {
  const onHledat = vi.fn().mockResolvedValue(nalezena);
  render(<HledaniLobby zapasId={7} onHledat={onHledat} nalezena odkaz="aoe2de://0/504953429" automaticky intervalMs={30} />);
  expect(await screen.findByTestId("lobby-nalezena")).toHaveTextContent("Lobby nalezena („ROB-01“)");
  await new Promise((r) => setTimeout(r, 100));
  expect(onHledat).toHaveBeenCalledTimes(1);
});
