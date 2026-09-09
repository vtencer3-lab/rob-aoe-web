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

// Staré akce mají v nastavení uložené null z doby, kdy obě zaškrtávátka měla
// i „je to jedno“. Okno je nesmí ukazovat neurčitá — diváci zapnutí, skryté
// civilizace vypnuté.
it("uložené „je to jedno“ u diváků a civilizací se srovná na pevné hodnoty", async () => {
  const { fireEvent } = await import("@testing-library/react");
  render(
    <SpravaAkce
      {...zaklad}
      akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi", nastaveniLobby: { povolitDivaky: null, skrytCivilizace: null } }}
    >
      <p>SESTAVA</p>
    </SpravaAkce>,
  );
  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));

  expect(screen.getByLabelText(/allow spectators/i)).toBeChecked();
  const civ = screen.getByLabelText(/hide civilizations/i) as HTMLInputElement;
  expect(civ).not.toBeChecked();
  expect(civ.indeterminate).toBe(false);
});

// Bez diváků nemá Robovo vysílání koho pustit dovnitř, takže odškrtnout
// Allow Spectators nejde: zaškrtávátko zůstane zapnuté a ozve se totéž co
// u Private — zatřesení, nadávka a stopa.
it("Allow Spectators nejde odškrtnout a okno vynadá", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const onNastaveniLobby = vi.fn();
  const prehrat = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(prehrat);
  render(
    <SpravaAkce {...zaklad} onNastaveniLobby={onNastaveniLobby} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }}>
      <p>SESTAVA</p>
    </SpravaAkce>,
  );
  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));
  const divaci = screen.getByLabelText(/allow spectators/i);
  expect(divaci).toBeChecked();

  fireEvent.click(divaci);

  expect(divaci).toBeChecked();
  expect(screen.getByTestId("prelobby-nadavka")).toHaveTextContent("A tak jseš debil, nebo co?");
  expect(prehrat).toHaveBeenCalled();
  expect(onNastaveniLobby).not.toHaveBeenCalled();
});

// K Private patří i zvuk. Prohlížeč v testu zvuk nepřehraje, takže se
// kontroluje, že se o to okno aspoň pokusilo.
it("Private spustí i zvukovou hlášku", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const prehrat = vi.fn().mockResolvedValue(undefined);
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(prehrat);
  render(
    <SpravaAkce {...zaklad} akce={{ id: 1, nazev: "Čtvrtek", stav: "bezi" }}>
      <p>SESTAVA</p>
    </SpravaAkce>,
  );
  fireEvent.click(screen.getByRole("button", { name: /pre-lobby nastavení/i }));

  fireEvent.change(screen.getByLabelText(/visibility/i), { target: { value: "1" } });

  expect(prehrat).toHaveBeenCalled();
});
