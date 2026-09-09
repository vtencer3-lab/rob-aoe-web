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
  expect(screen.getByRole("button", { name: /reset nastavení/i })).toBeInTheDocument();
  expect(screen.getByText("SESTAVA")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Založit akci" })).not.toBeInTheDocument();
});

// Pre-Lobby je okno „Create Lobby“ ze hry: modální, s ztmavlým okolím a
// zavírá se kliknutím vedle. Zakládání lobby je krok mimo běžné nastavování.
it("Pre-Lobby nastavení otevře modální okno a klik mimo ho zavře", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(
    <SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi", pristiNazevLobby: "ROB-03", pristiHeslo: "4207" }}>
      <p>SESTAVA</p>
    </SpravaAkce>,
  );
  expect(screen.queryByTestId("prelobby")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));

  const okno = screen.getByTestId("prelobby");
  expect(okno).toHaveAttribute("aria-modal", "true");
  // Jméno a heslo příští lobby jsou k opsání do hry.
  expect(screen.getByTestId("prelobby-nazev")).toHaveValue("ROB-03");
  expect(screen.getByTestId("prelobby-heslo")).toHaveValue("4207");
  // Herní řádky sedí.
  for (const popis of [/lobby type/i, /visibility/i, /players/i, /co-op campaign/i, /allow spectators/i, /hide civilizations/i, /spectator delay/i, /server/i, /data mod/i]) {
    expect(screen.getByLabelText(popis)).toBeInTheDocument();
  }

  fireEvent.click(screen.getByTestId("prelobby-stin"));
  expect(screen.queryByTestId("prelobby")).toBeNull();
});

// Private lobby zakáže diváky, takže by neměl kdo sledovat večer. Vybrat ji
// jde, ale hra si to nenechá: vrátí se Public, řádek se zatřese a nad
// formulářem se objeví, co si o tom web myslí.
it("Private ve Visibility se nenastaví a okno vynadá", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const onNastaveniLobby = vi.fn();
  render(
    <SpravaAkce {...zaklad} onNastaveniLobby={onNastaveniLobby} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }}>
      <p>SESTAVA</p>
    </SpravaAkce>,
  );
  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));
  expect(screen.queryByTestId("prelobby-nadavka")).toBeNull();

  fireEvent.change(screen.getByLabelText(/visibility/i), { target: { value: "1" } });

  expect(screen.getByTestId("prelobby-nadavka")).toHaveTextContent("A tak jseš debil, nebo co?");
  // Zůstalo Public a na server nic nešlo.
  expect(screen.getByLabelText(/visibility/i)).toHaveValue("0");
  expect(onNastaveniLobby).not.toHaveBeenCalled();
});
