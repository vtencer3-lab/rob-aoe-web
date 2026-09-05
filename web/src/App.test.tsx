import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, UcastnikView, ZapasView } from "../../src/shared/types.js";
import { App } from "./App.js";
import { api } from "./api.js";
import { useAkceStav } from "./useAkceStav.js";

vi.mock("./api.js", () => ({
  api: {
    me: vi.fn(),
    akce: vi.fn(),
    prihlasit: vi.fn(),
    odhlasit: vi.fn(),
    odhlasitSe: vi.fn(),
    pripojeni: vi.fn(),
    vlozitOdkaz: vi.fn(),
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
  jeHost,
  kliknulPripojit: null,
});

const zapas = (ucastnici: UcastnikView[]): ZapasView => ({
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
  ucastnici,
});

function nastavStav(payload: AkceStavPayload) {
  vi.mocked(useAkceStav).mockReturnValue({ stav: payload, spojeno: true });
}

beforeEach(() => {
  vi.clearAllMocks();
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

  expect(await screen.findByRole("button", { name: /uložit odkaz/i })).toBeInTheDocument();
  expect(screen.queryByText(/v lobby si nastav/i)).not.toBeInTheDocument();
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

  expect(await screen.findByText(/v lobby si nastav/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /uložit odkaz/i })).not.toBeInTheDocument();
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
  expect(screen.queryByRole("button", { name: /uložit odkaz/i })).not.toBeInTheDocument();
  expect(screen.queryByText(/v lobby si nastav/i)).not.toBeInTheDocument();
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

  expect(await screen.findByText(/v lobby si nastav/i)).toBeInTheDocument();
  expect(screen.queryByTestId("verejny-zapas")).not.toBeInTheDocument();
});

// Dohraný zápas z karty vypadne, protože mojeZapasy() filtruje `dohrano`.
// Bez veřejného řádku by hráči po zapsání výsledku zmizel z obrazovky beze
// stopy a nedozvěděl by se, jak zápas dopadl.
it("hráči po zapsání výsledku zápas nezmizí", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false },
  });
  const dohrany = { ...zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)]), stav: "dohrano", viteznyTym: 1 as const };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [dohrany] });

  render(<App />);

  expect(await screen.findByTestId("verejny-zapas")).toHaveTextContent("vyhrál tým 1");
});
