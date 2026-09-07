import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SpravaAkce } from "./SpravaAkce.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// Dokud tahle obrazovka neexistovala, POST /api/akce neměl na webu žádného
// volajícího: Rob se přihlásil, uviděl „Právě neběží žádná akce.“ a víc se
// nedalo dělat — panel režie se vykresluje až uvnitř existující akce.
it("bez akce nabídne založení a pošle název", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce akce={null} onZalozit={onZalozit} onStav={vi.fn()} onNastaveniLobby={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "  Čtvrtek  " } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));

  expect(onZalozit).toHaveBeenCalledWith("Čtvrtek");
});

it("prázdný název neodešle", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce akce={null} onZalozit={onZalozit} onStav={vi.fn()} onNastaveniLobby={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));

  expect(onZalozit).not.toHaveBeenCalled();
});

it("s běžící akcí nabídne ukončení a nastavení lobby, ne zakládání", () => {
  render(
    <SpravaAkce akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onZalozit={vi.fn()} onStav={vi.fn()} onNastaveniLobby={vi.fn()} />,
  );

  expect(screen.getByRole("button", { name: "Ukončit akci" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /uložit nastavení lobby/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Založit akci" })).not.toBeInTheDocument();
});

it("ukončení akce se ptá a při odmítnutí nic nepošle", () => {
  const onStav = vi.fn();
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <SpravaAkce akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onZalozit={vi.fn()} onStav={onStav} onNastaveniLobby={vi.fn()} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ukončit akci" }));
  expect(potvrzeni).toHaveBeenCalled();
  expect(onStav).not.toHaveBeenCalled();

  potvrzeni.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Ukončit akci" }));
  expect(onStav).toHaveBeenCalledWith("konec");
});

it("zkušební hráče nabídne jen, když je server povolil", () => {
  const akce = { id: 1, nazev: "večer", stav: "bezi" };
  const { rerender } = render(<SpravaAkce akce={akce} onZalozit={vi.fn()} onStav={vi.fn()} onNastaveniLobby={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /zkušební hráč/i })).not.toBeInTheDocument();

  const onPridat = vi.fn();
  const onOdebrat = vi.fn();
  rerender(<SpravaAkce akce={akce} onZalozit={vi.fn()} onStav={vi.fn()} onNastaveniLobby={vi.fn()} zkusebni={{ onPridat, onOdebrat }} />);
  fireEvent.click(screen.getByRole("button", { name: /\+ zkušební hráč/i }));
  fireEvent.click(screen.getByRole("button", { name: /odebrat zkušební/i }));
  expect(onPridat).toHaveBeenCalled();
  expect(onOdebrat).toHaveBeenCalled();
});
