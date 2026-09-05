import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { ObrazovkaHosta } from "./ObrazovkaHosta.js";

const zaklad: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "vyhlaseny",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  viteznyTym: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

it("diktuje nastavení, které jinak lidi kazí", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("pole-Visibility")).toHaveTextContent("Public");
  expect(screen.getByTestId("pole-Allow Spectators")).toHaveTextContent("✓");
  expect(screen.getByTestId("pole-Lobby Name")).toHaveTextContent("ROB-07");
  expect(screen.getByTestId("pole-Set Password")).toHaveTextContent("k7rm2xq9");
});

it("ukáže zrcadlo lobby se všemi barvami a týmy", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  const radky = screen.getAllByTestId("radek-lobby");
  expect(radky).toHaveLength(4);
  expect(radky[0]).toHaveTextContent("modrá");
  expect(radky[2]).toHaveTextContent("červená");
});



it("odešle vložený odkaz", async () => {
  const onVlozitOdkaz = vi.fn();
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  expect(onVlozitOdkaz).toHaveBeenCalledWith(1, "aoe2de://0/234230181");
});


it("v zrcadle lobby pojmenuje hráče bez aliasu jménem ze Steamu", () => {
  const bezAliasu: ZapasView = {
    ...zaklad,
    ucastnici: [
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
      { steamId: "76561199091641101", alias: null, steamName: "TibbarZmr", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    ],
  };
  render(
    <ObrazovkaHosta zapas={bezAliasu} ja="ja" onVlozitOdkaz={vi.fn()} />,
  );

  const radky = screen.getAllByTestId("radek-lobby");
  expect(radky[1]).toHaveTextContent("TibbarZmr");
  expect(radky[1]).not.toHaveTextContent("76561199091641101");
});

it("nabídne kopírování názvu lobby i hesla", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);

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
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://1/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  const hlaska = await screen.findByTestId("chyba-odkazu");
  expect(hlaska).toHaveTextContent(/divácký odkaz/i);
});

it("po povedeném uložení žádnou chybu nedrží", async () => {
  const onVlozitOdkaz = vi.fn().mockResolvedValue(undefined);
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  expect(screen.queryByTestId("chyba-odkazu")).not.toBeInTheDocument();
});

// Host taky hraje. Svoji barvu ale doteď viděl jen jako jeden řádek dole
// v zrcadle, zatímco každý druhý účastník dostal přes půl obrazovky pruh —
// host dostane ObrazovkaHosta *místo* KartaHrace, ne k ní.
it("ukáže hostovi jeho vlastní barvu jako pruh, ne jen řádek v zrcadle", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("modrá");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("1");
});

it("pruh nese barvu toho, kdo se dívá", () => {
  const cerveny = {
    ...zaklad,
    ucastnici: [
      { steamId: "ja", alias: "TenceR", steamName: null, tym: 2 as const, barva: 2 as const, jeHost: true, kliknulPripojit: null },
      { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1 as const, barva: 1 as const, jeHost: false, kliknulPripojit: null },
    ],
  };
  render(<ObrazovkaHosta zapas={cerveny} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("moje-barva")).toHaveTextContent("červená");
  expect(screen.getByTestId("muj-tym")).toHaveTextContent("2");
});

it("zrcadlí dialog Create Lobby pod jeho vlastním názvem", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("dialog-titulek")).toHaveTextContent("Create Lobby");
});

// Anglické názvy schválně: host je očima porovnává s anglickým dialogem hry.
// Pořadí taky — v dialogu jdou přesně takhle pod sebou.
it("drží pořadí a názvy všech polí ze hry", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  const nazvy = screen.getAllByTestId("nazev-pole").map((e) => e.textContent);
  expect(nazvy).toEqual([
    "Lobby Name",
    "Lobby Type",
    "Visibility",
    "Players",
    "Co-Op Campaign",
    "Set Password",
    "Allow Spectators",
    "Hide Civilizations",
    "Spectator Delay",
    "Server",
    "Data Mod",
  ]);
});

it("vyplní název, heslo a počet hráčů z webu", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("pole-Lobby Name")).toHaveTextContent("ROB-07");
  expect(screen.getByTestId("pole-Set Password")).toHaveTextContent("k7rm2xq9");
  expect(screen.getByTestId("pole-Players")).toHaveTextContent("4");
  expect(screen.getByTestId("pole-Visibility")).toHaveTextContent("Public");
});

// Nejcennější řádek celého dialogu: co je nad ním, se po založení lobby už
// opravit nedá. Heslo a diváci ano. Host to jinak zjistí až tím, že zakládá
// znovu uprostřed streamu.
it("varuje, že horní nastavení už po založení nezměníš", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("varovani-neni-zpet")).toHaveTextContent(
    /can not be changed after game creation/i,
  );
});

it("ukáže Allow Spectators jako zaškrtnuté", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  expect(screen.getByTestId("pole-Allow Spectators")).toHaveTextContent("✓");
});

// Zrcadlí se celý dialog, ale web řídí jen pět polí. U zbytku ukazuje, jak to
// v dialogu vypadá — ne příkaz. Kdyby to nešlo rozeznat, host by pro jistotu
// nastavoval i věci, o kterých nikdo nerozhodl.
it("pozná se, co web diktuje a co je jen podoba dialogu", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  for (const rizene of ["Lobby Name", "Visibility", "Players", "Set Password", "Allow Spectators"]) {
    expect(screen.getByTestId(`pole-${rizene}`)).toHaveAttribute("data-diktovano", "ano");
  }
  for (const cizi of ["Lobby Type", "Co-Op Campaign", "Hide Civilizations", "Spectator Delay", "Server", "Data Mod"]) {
    expect(screen.getByTestId(`pole-${cizi}`)).toHaveAttribute("data-diktovano", "ne");
  }
});

// Spodní tlačítka dialogu se dokreslují kvůli podobě. Opravdová tlačítka to
// být nesmí: host by na Create Lobby klikl a čekal, že se něco stane.
it("dokreslí i spodní tlačítka, ale klikatelná nejsou", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} />);
  const lista = screen.getByTestId("dialog-tlacitka");
  expect(lista).toHaveTextContent("Create Lobby");
  expect(lista).toHaveTextContent("Cancel");
  expect(screen.queryByRole("button", { name: "Cancel" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Create Lobby" })).not.toBeInTheDocument();
});

// Uložit odkaz je jediné opravdové tlačítko poblíž dialogu a musí zůstat
// dosažitelné i po tom, co dialog obrostl dekorací.
it("skutečné ovládání zůstává funkční", async () => {
  const onVlozitOdkaz = vi.fn();
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} />);
  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/1");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));
  expect(onVlozitOdkaz).toHaveBeenCalledWith(1, "aoe2de://0/1");
});
