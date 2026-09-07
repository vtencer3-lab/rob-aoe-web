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
    { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, poradi: 0, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, jeHost: false, poradi: 0, kliknulPripojit: null },
  ],
};

it("ukáže zrcadlo lobby se všemi barvami a týmy", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  const radky = screen.getAllByTestId("radek-lobby");
  expect(radky).toHaveLength(4);
  expect(radky[0]).toHaveTextContent("modrá");
  expect(radky[2]).toHaveTextContent("červená");
});



it("odešle vložený odkaz", async () => {
  const onVlozitOdkaz = vi.fn();
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  expect(onVlozitOdkaz).toHaveBeenCalledWith(1, "aoe2de://0/234230181");
});


it("v zrcadle lobby pojmenuje hráče bez aliasu jménem ze Steamu", () => {
  const bezAliasu: ZapasView = {
    ...zaklad,
    ucastnici: [
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, poradi: 0, kliknulPripojit: null },
      { steamId: "76561199091641101", alias: null, steamName: "TibbarZmr", tym: 2, barva: 2, jeHost: false, poradi: 0, kliknulPripojit: null },
    ],
  };
  render(
    <ObrazovkaHosta zapas={bezAliasu} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );

  const radky = screen.getAllByTestId("radek-lobby");
  expect(radky[1]).toHaveTextContent("TibbarZmr");
  expect(radky[1]).not.toHaveTextContent("76561199091641101");
});

it("nabídne kopírování názvu lobby i hesla", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);

  await userEvent.click(screen.getByRole("button", { name: /kopírovat název lobby/i }));
  expect(writeText).toHaveBeenLastCalledWith("ROB-07");

  await userEvent.click(screen.getByRole("button", { name: /kopírovat heslo/i }));
  expect(writeText).toHaveBeenLastCalledWith("k7rm2xq9");
});

// Hláška patří k poli, ne na začátek stránky. Host ji vkládá uprostřed
// streamu a nahoru se nedívá — dvakrát to skončilo tím, že chybu nikdo neviděl.
it("ukáže odmítnutí odkazu u pole, ne někde nahoře", async () => {
  const onVlozitOdkaz = vi
    .fn()
    .mockRejectedValue(new Error("Tohle je divácký odkaz (aoe2de://1/…)."));
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://1/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  const hlaska = await screen.findByTestId("chyba-odkazu");
  expect(hlaska).toHaveTextContent(/divácký odkaz/i);
});

it("po povedeném uložení žádnou chybu nedrží", async () => {
  const onVlozitOdkaz = vi.fn().mockResolvedValue(undefined);
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  expect(screen.queryByTestId("chyba-odkazu")).not.toBeInTheDocument();
});

// Host taky hraje. Svoji barvu ale doteď viděl jen jako jeden řádek dole
// v zrcadle, zatímco každý druhý účastník dostal přes půl obrazovky pruh —
// host dostane ObrazovkaHosta *místo* KartaHrace, ne k ní.
it("ukáže hostovi jeho vlastní barvu jako pruh, ne jen řádek v zrcadle", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("modrá");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("1");
});

it("pruh nese barvu toho, kdo se dívá", () => {
  const cerveny = {
    ...zaklad,
    ucastnici: [
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 2 as const, barva: 2 as const, jeHost: true, poradi: 0, kliknulPripojit: null },
      { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1 as const, barva: 1 as const, jeHost: false, poradi: 0, kliknulPripojit: null },
    ],
  };
  render(<ObrazovkaHosta zapas={cerveny} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
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
  const onVlozitOdkaz = vi.fn();
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/1");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));
  expect(onVlozitOdkaz).toHaveBeenCalledWith(1, "aoe2de://0/1");
});

it("posadí do dialogu jen ty tři hodnoty, které web řídí", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getByTestId("pole-nazev-lobby")).toHaveTextContent("ROB-07");
  expect(screen.getByTestId("pole-heslo")).toHaveTextContent("k7rm2xq9");
  expect(screen.getByTestId("pole-players")).toHaveTextContent("4");
});

// Zbytek dialogu je namalovaný v obrázku a je ve hře správně už tak: Public,
// zaškrtnuté Allow Spectators, Unranked, None, Default, Definitive Set.
// Přepisovat je nemá co.
it("do ostatních polí dialogu nic nevkládá", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  expect(screen.getAllByTestId(/^pole-/)).toHaveLength(3);
});

it("obrázek dialogu je jen dekorace, čtečka na něm nic nehledá", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  const obrazek = screen.getByTestId("obrazek-dialogu");
  expect(obrazek).toHaveAttribute("alt", "");
  expect(obrazek.getAttribute("src")).toMatch(/create-lobby/);
});

// Kdyby se obrázek nenačetl, nebo se na něj někdo nedíval, nesmí s ním zmizet
// zadání. Všechno podstatné proto musí být i v textu pod ním.
it("pokyny přežijí i bez obrázku", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />);
  const text = screen.getByTestId("dialog-legenda");
  expect(text).toHaveTextContent("ROB-07");
  expect(text).toHaveTextContent("k7rm2xq9");
  expect(text).toHaveTextContent(/Public/);
  expect(text).toHaveTextContent(/Allow Spectators/);
  expect(text).toHaveTextContent(/po založení.*nezměníš/i);
});

it("host má tlačítko na spuštění hry a po nalezení lobby i odkaz do ní", () => {
  const { rerender } = render(
    <ObrazovkaHosta zapas={{ ...zaklad, lobbyId: null, joinUri: null }} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );
  expect(screen.getByTestId("spustit-hru")).toHaveAttribute("href", "steam://run/813780");
  expect(screen.queryByTestId("do-lobby")).not.toBeInTheDocument();

  rerender(
    <ObrazovkaHosta zapas={{ ...zaklad, lobbyId: "504953429", joinUri: "aoe2de://0/504953429" }} ja="ja" onVlozitOdkaz={vi.fn()} onHledatLobby={nehledat} onKontrolaLobby={nekontroluj} />,
  );
  expect(screen.getByTestId("do-lobby")).toHaveAttribute("href", "aoe2de://0/504953429");
});
