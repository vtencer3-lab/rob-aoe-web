import { render, screen } from "@testing-library/react";
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
  render(<HledaniLobby zapasId={7} onHledat={onHledat} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat hru/i }));

  expect(onHledat).toHaveBeenCalledWith(7);
  expect(await screen.findByRole("status")).toHaveTextContent(/lobby nalezena/i);
});

it("bez diváků varuje, že se Rob dovnitř nedostane", async () => {
  const onHledat = vi.fn().mockResolvedValue({ ...nalezena, povolujeDivaky: false, maHeslo: false });
  render(<HledaniLobby zapasId={7} onHledat={onHledat} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat hru/i }));

  const hlaska = await screen.findByRole("status");
  expect(hlaska).toHaveTextContent(/allow spectators/i);
  expect(hlaska).toHaveTextContent(/nemá heslo/i);
});

it("nenalezená lobby poradí, že musí být veřejná", async () => {
  const onHledat = vi.fn().mockResolvedValue({ ...nalezena, nalezeno: false, lobbyId: null });
  render(<HledaniLobby zapasId={7} onHledat={onHledat} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat hru/i }));

  expect(await screen.findByRole("status")).toHaveTextContent(/veřejná/i);
});

it("chybu ze serveru ukáže u tlačítka", async () => {
  const onHledat = vi.fn().mockRejectedValue(new Error("Seznam lobby se nepodařilo stáhnout."));
  render(<HledaniLobby zapasId={7} onHledat={onHledat} />);

  await userEvent.click(screen.getByRole("button", { name: /vyhledat hru/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent(/nepodařilo stáhnout/i);
});

it("popisek tlačítka jde přepsat", () => {
  render(<HledaniLobby zapasId={7} onHledat={vi.fn()} popisek="Vyhledat moji lobby" />);
  expect(screen.getByRole("button", { name: /vyhledat moji lobby/i })).toBeInTheDocument();
});
