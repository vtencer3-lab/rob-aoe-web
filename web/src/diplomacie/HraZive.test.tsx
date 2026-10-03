import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { HraZapasu } from "../../../src/shared/diplomacie/hra.js";
import { losujRole } from "../../../src/shared/diplomacie/los.js";
import type { DiploData, RoleHrace, StavDiplo } from "../../../src/shared/diplomacie/typy.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { PultGm } from "./PultGm.js";

vi.mock("./api.js", () => ({
  diploApi: {
    nastupce: vi.fn(async () => ({ ok: true })),
    los: vi.fn(async () => ({ ok: true })),
    role: vi.fn(async () => ({ ok: true })),
    rozeslat: vi.fn(async () => ({ ok: true })),
    zpet: vi.fn(async () => ({ ok: true })),
    minimapaUrl: () => "/m.webp",
  },
}));

const TED = Date.parse("2026-10-02T20:00:10.000Z");
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TED);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

const spust = async (fn: () => Promise<unknown>) => {
  await fn();
};
const ROLE = losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h4", () => 0);

/** Snímek hry přijatý před 4 s: cíl mají všichni kromě h4, h3 je vyřazený, h1 nese dvě relikvie. */
const HRA: HraZapasu = {
  cas: 3723,
  prijato: new Date(TED - 4000).toISOString(),
  rozdano: true,
  nastupceHracId: "h4",
  hraci: ["h1", "h2", "h3", "h4", "h5", "h6", "h8"].map((hracId) => ({
    hracId,
    cil: hracId === "h4" ? null : { text: "zabito : {} /650 jednotek", limit: 650, hodnota: hracId === "h2" ? 3 : 0 },
    relikvie: hracId === "h1" ? 2 : 0,
    zije: hracId !== "h3",
  })),
};

/** Data, jak je vidí GM `h7`; `hra` jen když ji test podá. */
const gmData = (stav: StavDiplo, role: RoleHrace[], nastupce: string | null, hra?: HraZapasu): DiploData => {
  const data = stavDiplo(stav, role);
  return { ...data, zapasy: data.zapasy.map((z) => ({ ...z, nastupceHracId: nastupce, ...(hra ? { hra } : {}) })) };
};
const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Pult GM — klikni pro odkrytí" }));

it("bez dat ze hry pult nic navíc nekreslí — v přípravě ani v tabulce rolí", () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [], null)} hlidej={spust} />);
  odkryj();
  for (const id of ["stari-hry", "nastupce-ze-hry", "radek-hry"]) expect(screen.queryByTestId(id)).toBeNull();
  rerender(<PultGm zapas={zapas} data={gmData("losovano", ROLE, "h4")} hlidej={spust} />);
  for (const id of ["stari-hry", "nastupce-ze-hry", "radek-hry"]) expect(screen.queryByTestId(id)).toBeNull();
});

it("v přípravě řekne, koho určila hra — jméno s barvou — a jeho dlaždice je vybraná", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h4", HRA)} hlidej={spust} />);
  odkryj();
  const veta = screen.getByTestId("nastupce-ze-hry");
  expect(veta).toHaveTextContent("Nástupce určila hra: Hráč 4");
  expect(veta.querySelector("strong .swatch")).toHaveClass("barva-4");
  const vybrane = screen.getAllByTestId("dlazdice").filter((d) => d.classList.contains("vybrana"));
  expect(vybrane).toHaveLength(1);
  expect(vybrane[0]!.textContent).toMatch(/žlutá.*Hráč 4/);
});

it("GM hru přepsal: věta dál jmenuje hráče ze hry, vybraná je dlaždice GM", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h2", HRA)} hlidej={spust} />);
  odkryj();
  expect(screen.getByTestId("nastupce-ze-hry")).toHaveTextContent("Nástupce určila hra: Hráč 4");
  expect(screen.getAllByTestId("dlazdice").find((d) => d.classList.contains("vybrana"))!.textContent).toMatch(/červená.*Hráč 2/);
  // Předvýběr hry nese korunu a záři i tehdy, když GM vybral jinak.
  const zeHry = screen.getAllByTestId("dlazdice").filter((d) => d.classList.contains("ze-hry"));
  expect(zeHry).toHaveLength(1);
  expect(zeHry[0]!.textContent).toMatch(/žlutá.*Hráč 4/);
  expect(zeHry[0]!.querySelector("img")).toHaveAttribute("alt", "Nástupce podle hry");
});

it("dokud hra Nástupce neurčila, věta chybí; stáří dat je vidět i tak", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [], null, { ...HRA, rozdano: false, nastupceHracId: null })} hlidej={spust} />);
  odkryj();
  expect(screen.queryByTestId("nastupce-ze-hry")).toBeNull();
  expect(screen.getByTestId("stari-hry")).toHaveTextContent("ze hry před 4 s · herní čas 1:02:03");
});

// Hra z jiného scénáře, než zápas hraje: server podle ní Nástupce nenastaví
// a GM se v pultu dozví proč.
it("varování k datům ze hry ukáže pod stářím dat; bez varování nic", () => {
  const varovani = "Hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „LLC.aoe2scenario“ — Nástupce se podle ní nenastavuje.";
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [], null, { ...HRA, varovani })} hlidej={spust} />);
  odkryj();
  expect(screen.getByTestId("varovani-hry")).toHaveTextContent(varovani);
  expect(screen.getByTestId("varovani-hry")).toHaveClass("varovani");
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], null, HRA)} hlidej={spust} />);
  expect(screen.queryByTestId("varovani-hry")).toBeNull();
});

it("stáří dat tiká samo a po delším tichu hlásí, že hra mlčí", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h4", HRA)} hlidej={spust} />);
  odkryj();
  expect(screen.getByTestId("stari-hry")).toHaveTextContent("ze hry před 4 s");
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(screen.getByTestId("stari-hry")).toHaveTextContent("ze hry před 7 s");
  act(() => {
    vi.advanceTimersByTime(120_000);
  });
  expect(screen.getByTestId("stari-hry")).toHaveTextContent("hra mlčí 2 min");
});

// Data může posílat most na PC GM i na PC diváka; divákova jsou opožděná
// o zpoždění pro diváky, tak GM musí vidět, odkud jsou.
it("stáří dat říká, odkud jsou: od GM, nebo od diváka", () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [], "h4", { ...HRA, zdroj: "gm" })} hlidej={spust} />);
  odkryj();
  expect(screen.getByTestId("stari-hry")).toHaveTextContent("ze hry (GM) před 4 s · herní čas 1:02:03");
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h4", { ...HRA, zdroj: "divak" })} hlidej={spust} />);
  expect(screen.getByTestId("stari-hry")).toHaveTextContent("ze hry (divák) před 4 s · herní čas 1:02:03");
});

it("v tabulce rolí má každý hráč řádek s cílem a postupem, relikviemi a vyřazením", () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE, "h4", HRA)} hlidej={spust} />);
  odkryj();
  // Hlavička řádku zůstává jen jméno — podle něj řádek hledá čtečka i ostatní testy.
  // Řádek ze hry je hned pod řádkem hráče a jde přes celou tabulku.
  const radek = (jmeno: string) => screen.getByRole("rowheader", { name: jmeno }).closest("tr")!.nextElementSibling as HTMLElement;
  expect(radek("Hráč 2")).toHaveTextContent("zabito: 3/650 jednotek · relikvie 0");
  expect(radek("Hráč 1")).toHaveTextContent("zabito: 0/650 jednotek · relikvie 2");
  expect(radek("Hráč 3")).toHaveTextContent("zabito: 0/650 jednotek · relikvie 0 · vyřazen");
  expect(radek("Hráč 4")).toHaveTextContent("bez cíle · relikvie 0");
  expect(radek("Hráč 4")).toHaveClass("radek-hry");
  expect(radek("Hráč 4").querySelector("td")).toHaveAttribute("colspan", "4");
  expect(screen.getAllByTestId("radek-hry")).toHaveLength(7);
  expect(screen.getByTestId("stari-hry")).toBeTruthy();
  // Věta o Nástupci patří k výběru v přípravě; po rozdání rolí ho nese tabulka.
  expect(screen.queryByTestId("nastupce-ze-hry")).toBeNull();
});
