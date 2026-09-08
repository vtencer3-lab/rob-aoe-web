import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SpravaAkce } from "./SpravaAkce.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const zaklad = { onZalozit: vi.fn(), onStav: vi.fn(), onNastaveniLobby: vi.fn(), onUlozitNastaveni: vi.fn() };

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

// Panel jako herní lobby: název akce v záhlaví, vpravo Ukončit, vlevo
// sestava (children), vpravo nastavení.
it("s běžící akcí ukáže název, ukončení, sestavu i nastavení lobby, ne zakládání", () => {
  render(
    <SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }}>
      <p>SESTAVA</p>
    </SpravaAkce>,
  );

  expect(screen.getByTestId("nazev-akce")).toHaveTextContent("Čtvrtek");
  expect(screen.getByRole("button", { name: "Ukončit akci" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /uložit nastavení lobby/i })).toBeInTheDocument();
  expect(screen.getByText("SESTAVA")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Založit akci" })).not.toBeInTheDocument();
});

it("ukončení akce se ptá a při odmítnutí nic nepošle", () => {
  const onStav = vi.fn();
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  render(<SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onStav={onStav} />);

  fireEvent.click(screen.getByRole("button", { name: "Ukončit akci" }));
  expect(potvrzeni).toHaveBeenCalled();
  expect(onStav).not.toHaveBeenCalled();

  potvrzeni.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Ukončit akci" }));
  expect(onStav).toHaveBeenCalledWith("konec");
});

// Zkušební hráči: server je musí povolit a admin zapnout debug mód. Bez
// debug módu jsou tlačítka schovaná, ať v ostrém večeru nezavazí.
it("zkušební hráče nabídne jen se souhlasem serveru a v debug módu", () => {
  const akce = { id: 1, nazev: "večer", stav: "bezi" };
  const onPridat = vi.fn();
  const onOdebrat = vi.fn();
  const { rerender } = render(<SpravaAkce {...zaklad} akce={akce} ladeni />);
  expect(screen.queryByRole("button", { name: /zkušební hráč/i })).not.toBeInTheDocument();

  rerender(<SpravaAkce {...zaklad} akce={akce} zkusebni={{ onPridat, onOdebrat }} />);
  expect(screen.queryByRole("button", { name: /zkušební hráč/i })).not.toBeInTheDocument();

  rerender(<SpravaAkce {...zaklad} akce={akce} zkusebni={{ onPridat, onOdebrat }} ladeni />);
  fireEvent.click(screen.getByRole("button", { name: /\+ zkušební hráč/i }));
  fireEvent.click(screen.getByRole("button", { name: /odebrat zkušební/i }));
  expect(onPridat).toHaveBeenCalled();
  expect(onOdebrat).toHaveBeenCalled();
});
