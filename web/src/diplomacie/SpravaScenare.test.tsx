import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { SpravaScenare } from "./SpravaScenare.js";

vi.mock("./api.js", () => ({
  diploApi: {
    verze: vi.fn(),
    nahrat: vi.fn(async () => ({ id: 5, aktivni: false, chybaRozboru: null })),
    aktivovat: vi.fn(async () => ({ ok: true })),
    souborUrl: (id: number | "aktivni") => `/api/diplo/scenar/${id}/soubor`,
    minimapaUrl: (id: number) => `/api/diplo/scenar/${id}/minimapa.webp`,
  },
}));
import { diploApi } from "./api.js";

/** Aktivní verze s rozborem a starší, kterou se nepodařilo přečíst. */
const V2: ScenarVerze = { id: 3, jmenoSouboru: "LLC v2.aoe2scenario", nahrano: "2026-10-01T10:00:00.000Z", nahralJmeno: "Jin", poznamka: "nové cíle", aktivni: true, rozbor: ROZBOR, chybaRozboru: null };
const V1: ScenarVerze = { id: 2, jmenoSouboru: "LLC v1.aoe2scenario", nahrano: "2026-09-30T10:00:00.000Z", nahralJmeno: "Jin", poznamka: null, aktivni: false, rozbor: null, chybaRozboru: "scénář nemá právě jednoho GM" };

const hlidej = async (fn: () => Promise<unknown>) => {
  await fn();
};

beforeEach(() => {
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [V2, V1] });
});
// Volání mocků se jinak hromadí přes testy.
afterEach(() => {
  vi.clearAllMocks();
});

const rozbal = async () => {
  render(<SpravaScenare hlidej={hlidej} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  await screen.findByText("LLC v2.aoe2scenario");
};

it("vypíše verze, nečitelnou nejde aktivovat, nahrání pošle soubor a poznámku", async () => {
  render(<SpravaScenare hlidej={hlidej} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  expect(await screen.findByText("LLC v2.aoe2scenario")).toBeTruthy();
  expect(screen.getByText(/nepodařilo se přečíst/)).toBeTruthy();
  expect(screen.queryAllByRole("button", { name: "Nastavit jako aktivní" })).toHaveLength(0);
  const soubor = new File(["1.59"], "LLC v3.aoe2scenario");
  fireEvent.change(screen.getByLabelText("Co je nového"), { target: { value: "opravy" } });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [soubor] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(diploApi.nahrat).toHaveBeenCalledWith(soubor, "opravy");
});

it("stejné jméno jako existující verze upozorní", async () => {
  render(<SpravaScenare hlidej={hlidej} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  await screen.findByText("LLC v2.aoe2scenario");
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v2.aoe2scenario")] } });
  expect(screen.getByText(/Doporučuju jiné jméno/)).toBeTruthy();
});

// Seznam se načítá až po rozbalení: sbalená správa nemá na stránce co dělat
// a Rob ji má v panelu pořád, i když scénář měsíc nikdo nemění.
it("sbalená nic nenačítá; bez souboru nejde nahrát", async () => {
  render(<SpravaScenare hlidej={hlidej} />);
  expect(diploApi.verze).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText("Scénář Diplomacie"));
  await screen.findByText("LLC v2.aoe2scenario");
  expect(diploApi.verze).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Nahrát" })).toBeDisabled();
});

// Náhled aktivní verze: minimapa se všemi starty a přečtené cíle — autor hned
// vidí, že web scénář pochopil. Starší čitelnou verzi jde nastavit jako
// aktivní a seznam se pak načte znovu.
it("náhled aktivní verze a aktivace starší čitelné verze", async () => {
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [V2, { ...V1, rozbor: ROZBOR, chybaRozboru: null }] });
  await rozbal();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC v2.aoe2scenario" }).getAttribute("src")).toBe("/api/diplo/scenar/3/minimapa.webp");
  expect(screen.getAllByTestId("start")).toHaveLength(7);
  expect(screen.getByText("zabij 650 nepratelskych jednotek")).toBeTruthy();
  expect(screen.getByText("nové cíle", { exact: false })).toBeTruthy();
  expect(screen.getByRole("link", { name: "LLC v1.aoe2scenario" }).getAttribute("href")).toBe("/api/diplo/scenar/2/soubor");
  const tlacitka = screen.getAllByRole("button", { name: "Nastavit jako aktivní" });
  expect(tlacitka).toHaveLength(1);
  fireEvent.click(tlacitka[0]!);
  expect(diploApi.aktivovat).toHaveBeenCalledWith(2);
  await waitFor(() => expect(diploApi.verze).toHaveBeenCalledTimes(2));
});

// Po nahrání se řekne, co se stalo (aktivní / zůstává dosavadní / nečitelný
// soubor), formulář se vyprázdní a seznam se načte znovu.
it("po nahrání ukáže výsledek, vyprázdní formulář a načte seznam znovu", async () => {
  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 5, aktivni: true, chybaRozboru: null });
  await rozbal();
  fireEvent.change(screen.getByLabelText("Co je nového"), { target: { value: "opravy" } });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v3.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText("Nahráno a nastaveno jako aktivní.")).toBeTruthy();
  expect(screen.getByLabelText("Co je nového")).toHaveValue("");
  expect(screen.getByRole("button", { name: "Nahrát" })).toBeDisabled();
  expect(diploApi.verze).toHaveBeenCalledTimes(2);

  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 6, aktivni: false, chybaRozboru: "chybí hlavička" });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v4.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText(/Soubor je uložený, ale nepodařilo se ho přečíst: chybí hlavička/)).toBeTruthy();
});
