import { render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, ZapasView } from "../../src/shared/types.js";
import { App } from "./App.js";
import { api } from "./api.js";
import { stavDiplo, ZAPAS } from "./diplomacie/fixtury.js";
import { rezimKlienta } from "./rezimy/index.js";
import { useAkceStav } from "./useAkceStav.js";

// Push-to-talk ve vlastní kartě zápasu (uživatel 2. 10. 2026): admin mluví
// z režie, v kartě hráče tlačítko dostane jen ten, koho pustí mód — GM
// Diplomacie. Vlastní soubor, ať se netluče s ostatními testy App.

vi.mock("./emoty.js", async (puvodni) => ({ ...(await puvodni<typeof import("./emoty.js")>()), useEmoty: () => new Map() }));
vi.mock("./api.js", async (puvodni) => ({
  ...(await puvodni<typeof import("./api.js")>()),
  api: {
    me: vi.fn(),
    nastaveni: vi.fn().mockResolvedValue({ verze: "0.0.0", zkusebniHraci: false }),
    kontrolaLobby: vi.fn().mockResolvedValue({ nalezeno: false, kontroly: [] }),
    hledatLobby: vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null }),
    aktivita: vi.fn().mockResolvedValue({ ok: true }),
    hlas: vi.fn().mockResolvedValue({ ok: true }),
  },
}));
vi.mock("./useAkceStav.js", () => ({ useAkceStav: vi.fn() }));

function nastav(ja: string, zapas: ZapasView, rezim: "diplomacie" | "klasicky" = "diplomacie") {
  vi.mocked(api.me).mockResolvedValue({ hrac: { hracId: ja, alias: `Hráč ${ja.slice(1)}`, platformaJmeno: null, jeAdmin: false } });
  const stav: AkceStavPayload = {
    akce: { id: 1, nazev: "Diplo", stav: "bezi", rezim },
    prihlaseni: [],
    zapasy: [zapas],
    ...(rezim === "diplomacie" ? { rezim: { id: "diplomacie" as const, data: stavDiplo("priprava", []) } } : {}),
  };
  vi.mocked(useAkceStav).mockReturnValue({ stav, spojeno: true, obnov: vi.fn().mockResolvedValue(undefined), novaVerze: null });
}

/** GM (h7) je ve fixtuře i hostem; tady hostuje h1, ať má GM kartu hráče. */
const HOSTUJE_H1: ZapasView = { ...ZAPAS, ucastnici: ZAPAS.ucastnici.map((u) => ({ ...u, jeHost: u.hracId === "h1" })) };

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

it("GM Diplomacie má v chatu své karty push-to-talk, bez ztlumení adminů", async () => {
  nastav("h7", HOSTUJE_H1);
  render(<App />);
  const chat = await screen.findByTestId("chat");
  const ptt = within(chat).getByTestId("push-to-talk");
  expect(within(ptt).getByRole("button", { name: "Mluvit" })).toBeInTheDocument();
  // Ztlumení ostatních adminů je nástroj admina; GM by jím neztlumil nic.
  expect(within(ptt).queryByRole("button", { name: /ztlumit ostatní adminy/i })).not.toBeInTheDocument();
});

it("GM, který zároveň hostuje, má push-to-talk i na obrazovce hosta", async () => {
  nastav("h7", ZAPAS);
  render(<App />);
  expect(within(await screen.findByTestId("chat")).getByTestId("push-to-talk")).toBeInTheDocument();
});

it("hráč, který není GM, push-to-talk nemá", async () => {
  nastav("h2", HOSTUJE_H1);
  render(<App />);
  expect(await screen.findByTestId("chat")).toBeInTheDocument();
  expect(screen.queryByTestId("push-to-talk")).not.toBeInTheDocument();
});

it("v klasickém večeru push-to-talk nemá ani hráč na šedé", async () => {
  nastav("h7", HOSTUJE_H1, "klasicky");
  render(<App />);
  expect(await screen.findByTestId("chat")).toBeInTheDocument();
  expect(screen.queryByTestId("push-to-talk")).not.toBeInTheDocument();
});

// Server GM do dohraného zápasu nepustí (háček smiMluvitDoZapasu), tak ani
// tlačítko nenabízí.
it("do dohraného zápasu GM push-to-talk nedostane", () => {
  const stav: AkceStavPayload = { akce: { id: 1, nazev: "Diplo", stav: "bezi", rezim: "diplomacie" }, prihlaseni: [], zapasy: [], rezim: { id: "diplomacie", data: stavDiplo("priprava", []) } };
  const kontext = (zapas: ZapasView) => ({ zapas, stav, ja: "h7", hlidej: async () => {} });
  expect(rezimKlienta("diplomacie").smiMluvitDoZapasu?.(kontext(ZAPAS))).toBe(true);
  expect(rezimKlienta("diplomacie").smiMluvitDoZapasu?.(kontext({ ...ZAPAS, stav: "dohrano" }))).toBe(false);
});
