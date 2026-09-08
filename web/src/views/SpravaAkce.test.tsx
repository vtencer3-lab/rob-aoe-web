import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SpravaAkce } from "./SpravaAkce.js";

afterEach(() => {
  vi.restoreAllMocks();
});

const zaklad = { onZalozit: vi.fn(), onPrejmenovat: vi.fn(), onNastaveniLobby: vi.fn(), onUlozitNastaveni: vi.fn() };

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

  expect(screen.getByTestId("nazev-akce")).toHaveTextContent("Čtvrtek");
  expect(screen.queryByRole("button", { name: "Ukončit akci" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /uložit preset lobby/i })).toBeInTheDocument();
  expect(screen.getByText("SESTAVA")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Založit akci" })).not.toBeInTheDocument();
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

// Večer se často jmenuje podle toho, co se zrovna hraje. Tužka u nadpisu ho
// přepíše bez zakládání nové akce.
it("tužka přepíše název akce, Escape změnu zahodí", () => {
  const onPrejmenovat = vi.fn();
  render(<SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onPrejmenovat={onPrejmenovat} />);

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  const pole = screen.getByLabelText("Název akce");
  fireEvent.change(pole, { target: { value: "Pátek" } });
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(onPrejmenovat).toHaveBeenCalledWith("Pátek");

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  const znovu = screen.getByLabelText("Název akce");
  fireEvent.change(znovu, { target: { value: "Nic z toho" } });
  fireEvent.keyDown(znovu, { key: "Escape" });
  expect(onPrejmenovat).toHaveBeenCalledTimes(1);
});

// Prázdný název by server odmítl; ať Rob nekouká na chybu místo na to, že se
// prostě nic nestalo. Beze změny se taky nic neposílá.
it("prázdný ani nezměněný název se neposílá", () => {
  const onPrejmenovat = vi.fn();
  render(<SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }} onPrejmenovat={onPrejmenovat} />);

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  fireEvent.change(screen.getByLabelText("Název akce"), { target: { value: "   " } });
  fireEvent.blur(screen.getByLabelText("Název akce"));
  expect(onPrejmenovat).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  fireEvent.blur(screen.getByLabelText("Název akce"));
  expect(onPrejmenovat).not.toHaveBeenCalled();
});
