import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SpravaAkce } from "./SpravaAkce.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const zaklad = { onZalozit: vi.fn(), onNastaveniLobby: vi.fn(), onUlozitNastaveni: vi.fn() };

// Dokud tahle obrazovka neexistovala, POST /api/akce neměl na webu žádného
// volajícího: Rob se přihlásil, uviděl „Právě neběží žádná akce.“ a víc se
// nedalo dělat — panel režie se vykresluje až uvnitř existující akce.
it("bez akce nabídne založení a pošle název", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce {...zaklad} akce={null} onZalozit={onZalozit} />);

  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "  Čtvrtek  " } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));

  expect(onZalozit).toHaveBeenCalledWith("Čtvrtek");
});

it("prázdný název neodešle", () => {
  const onZalozit = vi.fn();
  render(<SpravaAkce {...zaklad} akce={null} onZalozit={onZalozit} />);

  fireEvent.change(screen.getByLabelText(/Název akce/), { target: { value: "   " } });
  fireEvent.click(screen.getByRole("button", { name: "Založit akci" }));

  expect(onZalozit).not.toHaveBeenCalled();
});

// Panel jako herní lobby: název akce v záhlaví, vlevo sestava (children),
// vpravo nastavení. „Ukončit akci“ je od 0.22.0 nahoře u tabulky přihlášených.
it("s běžící akcí ukáže název, sestavu i nastavení lobby, ne zakládání", () => {
  render(
    <SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }}>
      <p>SESTAVA</p>
    </SpravaAkce>,
  );

  expect(screen.getByRole("heading", { name: "Nastavení Lobby" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Ukončit akci" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /uložit preset lobby/i })).toBeInTheDocument();
  expect(screen.getByText("SESTAVA")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Založit akci" })).not.toBeInTheDocument();
});
