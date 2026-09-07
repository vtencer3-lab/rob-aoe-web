import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { ObrazovkaHosta } from "./ObrazovkaHosta.js";

/** Automatické hledání volá onHledatLobby hned po vykreslení; mock musí vracet odpověď. */
const nekontroluj = vi.fn().mockResolvedValue({ nalezeno: false, kontroly: [] });
const nehledat = vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null });

const zaklad: ZapasView = {
  id: 1,
  poradi: 7,
  stav: "vyhlaseny",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
  ],
};

it("nabídne kopírování názvu lobby i hesla", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);

  await userEvent.click(screen.getByRole("button", { name: /kopírovat název lobby/i }));
  expect(writeText).toHaveBeenLastCalledWith("ROB-07");

  await userEvent.click(screen.getByRole("button", { name: /kopírovat heslo/i }));
  expect(writeText).toHaveBeenLastCalledWith("k7rm2xq9");
});

// Hláška patří k poli, ne na začátek stránky. Host ji vkládá uprostřed
// streamu a nahoru se nedívá — dvakrát to skončilo tím, že chybu nikdo neviděl.
it("ukáže hostovi jeho vlastní barvu jako pruh, ne jen řádek v zrcadle", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("modrá");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("1");
});

it("pruh nese barvu toho, kdo se dívá", () => {
  const cerveny = {
    ...zaklad,
    ucastnici: [
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 2 as const, barva: 2 as const, civ: null, jeHost: true, poradi: 0, kliknulPripojit: null },
      { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1 as const, barva: 1 as const, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
    ],
  };
  render(<ObrazovkaHosta zapas={cerveny} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("červená");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("2");
});


// Nejcennější řádek celého dialogu: co je nad ním, se po založení lobby už
// opravit nedá. Heslo a diváci ano. Host to jinak zjistí až tím, že zakládá
// znovu uprostřed streamu.

// Zrcadlí se celý dialog, ale web řídí jen pět polí. U zbytku ukazuje, jak to
// v dialogu vypadá — ne příkaz. Kdyby to nešlo rozeznat, host by pro jistotu
// nastavoval i věci, o kterých nikdo nerozhodl.

// Spodní tlačítka dialogu se dokreslují kvůli podobě. Opravdová tlačítka to
// být nesmí: host by na Create Lobby klikl a čekal, že se něco stane.

// Uložit odkaz je jediné opravdové tlačítko poblíž dialogu a musí zůstat
// dosažitelné i po tom, co dialog obrostl dekorací.
it("skutečné ovládání zůstává funkční", async () => {
  const onHledatLobby = vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null });
  render(<ObrazovkaHosta zapas={{ ...zaklad, lobbyId: null, joinUri: null }} ja="ja" onHledatLobby={onHledatLobby} onKontrolaLobby={nekontroluj} />);
  await userEvent.click(screen.getByRole("button", { name: /vyhledat lobby/i }));
  expect(onHledatLobby).toHaveBeenCalledWith(1);
  expect(screen.getByRole("button", { name: /kopírovat název lobby/i })).toBeInTheDocument();
});

it("posadí do dialogu jen ty tři hodnoty, které web řídí", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getByTestId("pole-nazev-lobby")).toHaveTextContent("ROB-07");
  expect(screen.getByTestId("pole-heslo")).toHaveTextContent("k7rm2xq9");
  expect(screen.getByTestId("pole-players")).toHaveTextContent("4");
});

// Zbytek dialogu je namalovaný v obrázku a je ve hře správně už tak: Public,
// zaškrtnuté Allow Spectators, Unranked, None, Default, Definitive Set.
// Přepisovat je nemá co.
it("do ostatních polí dialogu nic nevkládá", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getAllByTestId(/^pole-/)).toHaveLength(3);
});

it("obrázek dialogu popisuje pro čtečku tři hodnoty, které web řídí", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  const obrazek = screen.getByTestId("obrazek-dialogu");
  expect(obrazek.getAttribute("alt")).toMatch(/Lobby Name ROB-07/);
  expect(obrazek.getAttribute("src")).toMatch(/create-lobby/);
});

// Kdyby se obrázek nenačetl, nebo se na něj někdo nedíval, nesmí s ním zmizet
// zadání. Všechno podstatné proto musí být i v textu pod ním.
it("host má tlačítko na spuštění hry a po nalezení lobby i odkaz do ní", () => {
  const { rerender } = render(
    <ObrazovkaHosta zapas={{ ...zaklad, lobbyId: null, joinUri: null }} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );
  expect(screen.getByTestId("spustit-hru")).toHaveAttribute("href", "steam://run/813780");
  expect(screen.queryByTestId("do-lobby")).not.toBeInTheDocument();

  rerender(
    <ObrazovkaHosta zapas={{ ...zaklad, lobbyId: "504953429", joinUri: "aoe2de://0/504953429" }} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );
  expect(screen.getByTestId("do-lobby")).toHaveAttribute("href", "aoe2de://0/504953429");
});

it("po nalezení lobby je hledání zašedlé a vedle něj stav s ikonou odkazu", () => {
  render(
    <ObrazovkaHosta zapas={{ ...zaklad, lobbyId: "504953429", joinUri: "aoe2de://0/504953429", fazeLobby: "lobby" }} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );
  expect(screen.getByRole("button", { name: /vyhledat lobby/i })).toBeDisabled();
  expect(screen.getByTestId("lobby-nalezena")).toHaveTextContent(/lobby nalezena/i);
  expect(screen.getByRole("button", { name: /kopírovat odkaz do lobby/i })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: /kontrola lobby/i })).toBeInTheDocument();
});

it("když lobby ze seznamu zmizí, tlačítko hledání zase ožije", () => {
  render(
    <ObrazovkaHosta zapas={{ ...zaklad, lobbyId: "504953429", joinUri: "aoe2de://0/504953429", fazeLobby: "hraje_se" }} ja="ja" onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );
  expect(screen.getByRole("button", { name: /vyhledat lobby/i })).toBeEnabled();
});
