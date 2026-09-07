import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, UcastnikView, ZapasView } from "../../src/shared/types.js";
import { App } from "./App.js";
import { api } from "./api.js";
import { useAkceStav } from "./useAkceStav.js";

vi.mock("./api.js", () => ({
  api: {
    me: vi.fn(),
    nastaveni: vi.fn().mockResolvedValue({ verze: "0.0.0", zkusebniHraci: false }),
    pridatZkusebniho: vi.fn(),
    odebratZkusebni: vi.fn(),
    akce: vi.fn(),
    prihlasit: vi.fn(),
    odhlasit: vi.fn(),
    odhlasitSe: vi.fn(),
    pripojeni: vi.fn(),
    vlozitOdkaz: vi.fn(),
    kontrolaLobby: vi.fn().mockResolvedValue({ nalezeno: false, kontroly: [] }),
    nastaveniLobby: vi.fn(),
    ulozitNastaveniLobby: vi.fn(),
    skladani: vi.fn().mockResolvedValue({ akce: { id: 1 } }),
    smazatZapas: vi.fn(),
    hledatLobby: vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null }),
    vytvoritAkce: vi.fn(),
    akceStav: vi.fn(),
    vytvoritZapas: vi.fn(),
    zapasStav: vi.fn(),
    vysledek: vi.fn(),
    zmenitHosta: vi.fn(),
  },
}));

vi.mock("./useAkceStav.js", () => ({
  useAkceStav: vi.fn(),
}));

const u = (steamId: string, tym: 1 | 2, barva: 1 | 2, jeHost = false): UcastnikView => ({
  steamId,
  alias: steamId.toUpperCase(),
  steamName: null,
  tym,
  barva,
  civ: null,
  jeHost,
  poradi: 0,
  kliknulPripojit: null,
});

const zapas = (ucastnici: UcastnikView[]): ZapasView => ({
  id: 1,
  poradi: 7,
  stav: "vyhlaseny",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  ucastnici,
});

function nastavStav(payload: AkceStavPayload) {
  vi.mocked(useAkceStav).mockReturnValue({ stav: payload, spojeno: true });
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  vi.mocked(api.me).mockReset();
});

it("host vidí obrazovku hosta, ne kartu hráče", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "host1", alias: "Host", steamName: null, jeAdmin: false } });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)])],
  });

  render(<App />);

  expect(await screen.findByTestId("spustit-hru")).toBeInTheDocument();
  expect(screen.queryByText(/připojuješ se/i)).not.toBeInTheDocument();
});

it("nehostující účastník vidí kartu hráče, ne obrazovku hosta", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false },
  });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)])],
  });

  render(<App />);

  expect(await screen.findByText(/připojuješ se/i)).toBeInTheDocument();
  expect(screen.queryByTestId("spustit-hru")).not.toBeInTheDocument();
});

it("kdo v žádném zápase nehraje, nevidí ani jednu obrazovku", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "divak", alias: "Divak", steamName: null, jeAdmin: false },
  });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)])],
  });

  render(<App />);

  expect(await screen.findByText("Akce 1")).toBeInTheDocument();
  expect(screen.queryByTestId("spustit-hru")).not.toBeInTheDocument();
  expect(screen.queryByText(/připojuješ se/i)).not.toBeInTheDocument();
});

it("admin vidí panel režie", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [],
  });

  render(<App />);

  expect(await screen.findByRole("button", { name: /vytvořit zápas/i })).toBeInTheDocument();
});

it("neadmin panel režie nevidí", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "hrac1", alias: "Hrac", steamName: null, jeAdmin: false } });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [],
  });

  render(<App />);

  expect(await screen.findByText("Akce 1")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /vytvořit zápas/i })).not.toBeInTheDocument();
});

// Přesně stav, ve kterém web po nasazení stojí každý den do chvíle, než Rob
// večer začne: přihlášený admin, žádná akce. Než tahle větev existovala,
// neměl odsud jak akci založit — panel režie se vykresluje až uvnitř akce,
// takže se z prázdné stránky nedalo dostat nikam.
it("admin bez akce dostane formulář na její založení", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  nastavStav({ akce: null, prihlaseni: [], zapasy: [] });

  render(<App />);

  expect(await screen.findByRole("button", { name: "Založit akci" })).toBeInTheDocument();
});

it("běžný hráč bez akce formulář na založení nevidí", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "hrac1", alias: "Hrac", steamName: null, jeAdmin: false } });
  nastavStav({ akce: null, prihlaseni: [], zapasy: [] });

  render(<App />);

  expect(await screen.findByText("Právě neběží žádná akce.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Založit akci" })).not.toBeInTheDocument();
});

// Server posílá složený zápas každému a jen zaslepí heslo a číslo lobby
// (redigujZapas). Frontend ho ale zahazoval dvěma filtry naráz — anonyma
// vyhodilo `me ?` a neúčastníka `mojeZapasy()` — takže zápas neviděl nikdo
// kromě hráčů a admina. Nahlášené třikrát.
it("anonym vidí, kdo proti komu hraje", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: null });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)])],
  });

  render(<App />);

  const radek = await screen.findByTestId("verejny-zapas");
  expect(radek).toHaveTextContent("HOST1 + B vs C + D");
});

it("anonymovi se přes veřejný řádek neprotečou tajemství", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: null });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("c", 2, 2)])],
  });

  render(<App />);

  await screen.findByTestId("verejny-zapas");
  expect(screen.queryByText("k7rm2xq9")).not.toBeInTheDocument();
});

it("přihlášený divák mimo zápas ho taky vidí", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "divak", alias: "Divak", steamName: null, jeAdmin: false },
  });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("c", 2, 2)])],
  });

  render(<App />);

  expect(await screen.findByTestId("verejny-zapas")).toBeInTheDocument();
});

// Účastník má plnou kartu, veřejný řádek by ji jen zdvojil.
it("účastníkovi se jeho vlastní běžící zápas nezdvojí", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false },
  });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi" },
    prihlaseni: [],
    zapasy: [zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)])],
  });

  render(<App />);

  expect(await screen.findByText(/připojuješ se/i)).toBeInTheDocument();
  expect(screen.queryByTestId("verejny-zapas")).not.toBeInTheDocument();
});

// Dohraný zápas z karty vypadne, protože mojeZapasy() filtruje `dohrano`.
// Bez veřejného řádku by hráči po zapsání výsledku zmizel z obrazovky beze
// stopy a nedozvěděl by se, jak zápas dopadl.
it("hráči po zapsání výsledku zápas nezmizí", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false },
  });
  const dohrany = { ...zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)]), stav: "dohrano", vitez: { tym: 1 } as const };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [dohrany] });

  render(<App />);

  expect(await screen.findByTestId("verejny-zapas")).toHaveTextContent("vyhrál modrý tým");
});

// Přepínače jen pro adminy: „User View“ schová všechno adminské (panel akce,
// režii, „+“ v tabulce), debug mód ukáže tlačítka zkušebních hráčů. Hráč
// nevidí ani jeden přepínač.
it("admin si přepne na pohled uživatele a adminské části zmizí", async () => {
  const { fireEvent } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] }, prihlaseni: [], zapasy: [] });

  render(<App />);

  expect(await screen.findByRole("button", { name: /vytvořit zápas/i })).toBeInTheDocument();
  expect(screen.getByTestId("nazev-akce")).toHaveTextContent("Akce 1");
  expect(screen.getByRole("heading", { name: "Přihlášení hráči" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("switch", { name: /pohled uživatele/i }));
  expect(screen.queryByRole("button", { name: /vytvořit zápas/i })).not.toBeInTheDocument();
  expect(screen.queryByTestId("nazev-akce")).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Akce 1" })).toBeInTheDocument();
  // Přepínač zpátky zůstává, ať se admin dostane ven.
  expect(screen.getByRole("switch", { name: /pohled uživatele/i })).toBeInTheDocument();
});

it("debug mód ukáže tlačítka zkušebních hráčů, které server povolil", async () => {
  const { fireEvent } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  vi.mocked(api.nastaveni).mockResolvedValueOnce({ verze: "0.0.0", zkusebniHraci: true });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] }, prihlaseni: [], zapasy: [] });

  render(<App />);

  await screen.findByRole("button", { name: /vytvořit zápas/i });
  expect(screen.queryByRole("button", { name: /zkušební hráč/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("switch", { name: /debug mód/i }));
  expect(await screen.findByRole("button", { name: /\+ zkušební hráč/i })).toBeInTheDocument();
});

it("hráč žádný přepínač nevidí", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "hrac1", alias: "Hrac", steamName: null, jeAdmin: false } });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [] });

  render(<App />);

  expect(await screen.findByText("Akce 1")).toBeInTheDocument();
  expect(screen.queryByRole("switch")).not.toBeInTheDocument();
});

// Rozpracovaná sestava přichází ze serveru: co druhý admin naklikal, je tu
// bez refreshe, a vlastní kliknutí odchází na server.
it("sestavu bere ze stavu akce a vlastní výběr posílá na server", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  const hrac = (steamId: string, alias: string) => ({ steamId, alias, steamName: null, avatarUrl: null, country: null, elo1v1: null, eloNejvyssi: null, odehranoHer: null, steamHodiny: null, posledniZapas: null, statyStazenyV: null, statyChyba: null });
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [{ steamId: "a", tym: 1, barva: 1, civ: null }] },
    prihlaseni: [hrac("a", "Pepa"), hrac("b", "Marek")],
    zapasy: [],
  });

  render(<App />);

  expect(await screen.findByRole("button", { name: /barva pepa/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Vybrat hráče Marek" }));
  expect(screen.getByRole("button", { name: /barva marek/i })).toBeInTheDocument();
  await waitFor(() => expect(api.skladani).toHaveBeenCalledWith(1, [
    { steamId: "a", tym: 1, barva: 1, civ: null },
    { steamId: "b", tym: 2, barva: 2, civ: null },
  ]));
});

// Historie kroků: vlastní změna sestavy dostane toast se Zpět a Ctrl+Z ji
// vrátí (pošle na server stav před změnou), Ctrl+Y ji znovu udělá.
it("Ctrl+Z vrátí poslední změnu sestavy a Ctrl+Y ji zopakuje", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  const hrac = (steamId: string, alias: string) => ({ steamId, alias, steamName: null, avatarUrl: null, country: null, elo1v1: null, eloNejvyssi: null, odehranoHer: null, steamHodiny: null, posledniZapas: null, statyStazenyV: null, statyChyba: null });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] }, prihlaseni: [hrac("a", "Pepa")], zapasy: [] });

  render(<App />);
  await screen.findByRole("button", { name: "Vybrat hráče Pepa" });
  fireEvent.click(screen.getByRole("button", { name: "Vybrat hráče Pepa" }));
  await waitFor(() => expect(api.skladani).toHaveBeenLastCalledWith(1, [{ steamId: "a", tym: 1, barva: 1, civ: null }]));
  // Běžná změna toast nemá — ten patří až ke kroku zpět/znovu.
  expect(screen.queryByTestId("toasty")).not.toBeInTheDocument();

  fireEvent.keyDown(window, { key: "z", ctrlKey: true });
  expect(await screen.findByTestId("toasty")).toHaveTextContent("Zpět: Pepa přidán do sestavy");
  await waitFor(() => expect(api.skladani).toHaveBeenLastCalledWith(1, []));

  fireEvent.keyDown(window, { key: "y", ctrlKey: true });
  expect(screen.getByTestId("toasty")).toHaveTextContent("Znovu: Pepa přidán do sestavy");
  await waitFor(() => expect(api.skladani).toHaveBeenLastCalledWith(1, [{ steamId: "a", tym: 1, barva: 1, civ: null }]));
});
