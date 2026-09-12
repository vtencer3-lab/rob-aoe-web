import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { Chat } from "./Chat.js";

const zapas = (zpravy: ZapasView["zpravy"]): ZapasView => ({
  id: 7,
  poradi: 2,
  stav: "bezi",
  nazevLobby: "ROB-02",
  heslo: "",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  ucastnici: [],
  zpravy,
});

it("kreslí zprávy s barvou slotu, admini svou barvou a září", () => {
  render(
    <Chat
      ja="a"
      onOdeslat={vi.fn()}
      zapas={zapas([
        { id: 1, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3, tym: 1, text: "jdu", poslano: "2026-09-12T12:00:00.000Z" },
        { id: 2, steamId: "76561198147631465", jmeno: "Rob", jeAdmin: true, barva: null, tym: null, text: "zakládám", poslano: "2026-09-12T12:01:00.000Z" },
        { id: 3, steamId: "x", jmeno: "Jiný admin", jeAdmin: true, barva: null, tym: null, text: "ok", poslano: "2026-09-12T12:02:00.000Z" },
      ])}
    />,
  );
  const radky = screen.getAllByTestId("zprava");
  expect(radky).toHaveLength(3);
  expect(radky[0]).toHaveClass("moje");
  expect(radky[0]!.querySelector(".autor")).toHaveClass("barva-3");
  expect(radky[1]!.querySelector(".autor")).toHaveClass("admin", "rob");
  expect(radky[2]!.querySelector(".autor")).toHaveClass("admin", "admin-jiny");
  expect(radky[1]).toHaveTextContent("zakládám");
});

it("prázdný chat vyzve k první zprávě a prázdnou neodešle", () => {
  const onOdeslat = vi.fn();
  render(<Chat ja="a" onOdeslat={onOdeslat} zapas={zapas([])} />);
  expect(screen.getByText(/zatím ticho/i)).toBeInTheDocument();
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i });
  expect(screen.getByRole("button", { name: /odeslat/i })).toBeDisabled();
  fireEvent.change(pole, { target: { value: "   " } });
  fireEvent.submit(pole.closest("form")!);
  expect(onOdeslat).not.toHaveBeenCalled();
});

it("Enter odešle oříznutý text a pole vyprázdní", async () => {
  const onOdeslat = vi.fn(async () => undefined);
  render(<Chat ja="a" onOdeslat={onOdeslat} zapas={zapas([])} />);
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i });
  fireEvent.change(pole, { target: { value: "  za chvíli  " } });
  fireEvent.submit(pole.closest("form")!);
  await vi.waitFor(() => expect(onOdeslat).toHaveBeenCalledWith("za chvíli"));
  await vi.waitFor(() => expect(pole).toHaveValue(""));
});
