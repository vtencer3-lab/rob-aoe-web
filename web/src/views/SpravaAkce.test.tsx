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
  render(<SpravaAkce akce={null} onZalozit={onZalozit} onStav={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "  Čtvrtek  " } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));

  expect(onZalozit).toHaveBeenCalledWith("Čtvrtek");
});

it("prázdný název neodešle", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce akce={null} onZalozit={onZalozit} onStav={vi.fn()} />);

  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));

  expect(onZalozit).not.toHaveBeenCalled();
});

it("s běžící akcí nabídne jediné tlačítko — ukončení", () => {
  render(
    <SpravaAkce akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onZalozit={vi.fn()} onStav={vi.fn()} />,
  );

  expect(screen.getByRole("button", { name: "Ukončit akci" })).toBeInTheDocument();
  expect(screen.getAllByRole("button")).toHaveLength(1);
});

it("ukončení akce se ptá a při odmítnutí nic nepošle", () => {
  const onStav = vi.fn();
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(
    <SpravaAkce akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onZalozit={vi.fn()} onStav={onStav} />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Ukončit akci" }));
  expect(potvrzeni).toHaveBeenCalled();
  expect(onStav).not.toHaveBeenCalled();

  potvrzeni.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Ukončit akci" }));
  expect(onStav).toHaveBeenCalledWith("konec");
});
