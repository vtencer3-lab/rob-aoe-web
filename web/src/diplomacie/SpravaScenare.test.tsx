import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { SpravaScenare } from "./SpravaScenare.js";

vi.mock("./api.js", () => ({
  diploApi: {
    verze: vi.fn(),
    nahrat: vi.fn(async () => ({ id: 5, aktivni: false, chybaRozboru: null, chybaSondy: null, vlastniMinimapa: null })),
    aktivovat: vi.fn(async () => ({ ok: true })),
    prevzitMinimapu: vi.fn(async () => ({ ok: true })),
    smazat: vi.fn(async () => ({ ok: true })),
    pribalSondu: vi.fn(async () => ({ ok: true, sonda: { cilu: 42, oznaceno: 42, chyba: null, zastarala: false, varovani: [] } })),
    souborUrl: (id: number | "aktivni", original = false) => `/api/diplo/scenar/${id}/soubor${original ? "?original=1" : ""}`,
    minimapaUrl: (id: number) => `/api/diplo/scenar/${id}/minimapa.webp`,
  },
}));
import { diploApi } from "./api.js";

/** Aktivní verze s rozborem a starší, kterou se nepodařilo přečíst. */
const V2: ScenarVerze = { id: 3, jmenoSouboru: "LLC v2.aoe2scenario", jmenoHry: "ROB_DIPLO_3.aoe2scenario", nahrano: "2026-10-01T10:00:00.000Z", nahralJmeno: "Jin", poznamka: "nové cíle", aktivni: true, rozbor: ROZBOR, chybaRozboru: null, minimapaOtisk: null, minimapaVlastni: false, sonda: null };
const V1: ScenarVerze = { id: 2, jmenoSouboru: "LLC v1.aoe2scenario", jmenoHry: "ROB_DIPLO_2.aoe2scenario", nahrano: "2026-09-30T10:00:00.000Z", nahralJmeno: "Jin", poznamka: null, aktivni: false, rozbor: null, chybaRozboru: "scénář nemá právě jednoho GM", minimapaOtisk: null, minimapaVlastni: false, sonda: null };

const hlidej = async (fn: () => Promise<unknown>) => {
  await fn();
};

beforeEach(() => {
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [V2, V1] });
});
// Volání mocků se jinak hromadí přes testy.
afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

const rozbal = async () => {
  render(<SpravaScenare hlidej={hlidej} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  await screen.findByText("LLC v2.aoe2scenario");
};

// Pole „Co je nového“ uživatel 2. 10. 2026 zrušil: formulář ho nemá a řádky
// verzí poznámku (i starou z databáze) neukazují.
it("vypíše verze, nečitelnou nejde aktivovat, nahrání pošle jen soubor (bez poznámky)", async () => {
  render(<SpravaScenare hlidej={hlidej} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  expect(await screen.findByText("LLC v2.aoe2scenario")).toBeTruthy();
  expect(screen.getByText(/nepodařilo se přečíst/)).toBeTruthy();
  expect(screen.queryAllByRole("button", { name: "Nastavit jako aktivní" })).toHaveLength(0);
  expect(screen.queryByLabelText("Co je nového")).toBeNull();
  expect(screen.queryByText(/nové cíle/)).toBeNull();
  const soubor = new File(["1.59"], "LLC v3.aoe2scenario");
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [soubor] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(diploApi.nahrat).toHaveBeenCalledWith(soubor);
});

// Hostovi a do lobby jde verze pod jménem pro hru (ROB_DIPLO_<pořadí>),
// takže jméno originálu nemusí být jiné a upozornění na stejné jméno odpadlo.
// Řádek má jméno jako text, ne odkaz — stahuje se tlačítky. Nejnovější nahoře.
it("verze nejnovější nahoře, jméno originálu jako text a vedle jméno pro hru", async () => {
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [V1, V2] });
  await rozbal();
  expect(screen.getAllByTestId("verze-scenare").map((r) => r.querySelector(".jmeno-verze")?.textContent)).toEqual(["LLC v2.aoe2scenario", "LLC v1.aoe2scenario"]);
  expect(screen.queryByRole("link", { name: "LLC v2.aoe2scenario" })).toBeNull();
  expect(screen.getByText("(ROB_DIPLO_3)")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v2.aoe2scenario")] } });
  expect(screen.queryByText(/Doporučuju jiné jméno/)).toBeNull();
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

// Náhled aktivní verze: minimapa se všemi starty a tatáž pravidla hry jako na
// kartě hráče (cíle i limity z rozboru) — autor hned vidí, že web scénář
// pochopil. Starší čitelnou verzi jde nastavit jako aktivní a seznam se pak
// načte znovu.
it("náhled aktivní verze a aktivace starší čitelné verze", async () => {
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [V2, { ...V1, rozbor: ROZBOR, chybaRozboru: null }] });
  await rozbal();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC v2.aoe2scenario" }).getAttribute("src")).toBe("/api/diplo/scenar/3/minimapa.webp");
  expect(screen.getAllByTestId("start")).toHaveLength(7);
  // Pravidla jsou rozložená jako pro hráče (kartičky rovnou, bez rozbalování).
  expect(screen.getByText("Zabij 650 nepratelskych jednotek")).toBeTruthy();
  expect(screen.getByText("Nejvýš 30 vesničanů")).toBeTruthy();
  const tlacitka = screen.getAllByRole("button", { name: "Nastavit jako aktivní" });
  expect(tlacitka).toHaveLength(1);
  fireEvent.click(tlacitka[0]!);
  expect(diploApi.aktivovat).toHaveBeenCalledWith(2);
  await waitFor(() => expect(diploApi.verze).toHaveBeenCalledTimes(2));
});

// Po nahrání se řekne, co se stalo (aktivní / zůstává dosavadní / nečitelný
// soubor), formulář se vyprázdní a seznam se načte znovu.
it("po nahrání ukáže výsledek, vyprázdní formulář a načte seznam znovu", async () => {
  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 5, aktivni: true, chybaRozboru: null, chybaSondy: null, vlastniMinimapa: null });
  await rozbal();
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v3.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText("Nahráno a nastaveno jako aktivní.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Nahrát" })).toBeDisabled();
  expect(diploApi.verze).toHaveBeenCalledTimes(2);

  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 6, aktivni: false, chybaRozboru: "chybí hlavička", chybaSondy: null, vlastniMinimapa: null });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v4.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText(/Soubor je uložený, ale nepodařilo se ho přečíst: chybí hlavička/)).toBeTruthy();
});

// Zastaralou sondu přebalí server sám (3. 10. 2026), tlačítko „Přibalit
// automatizace“ zmizelo. „Stáhnout scénář“ je zamčené jen tehdy, když
// přibalení sondy selhalo.
const stazeni = () => {
  const kliky: { href: string; download: string }[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    kliky.push({ href: this.getAttribute("href") ?? "", download: this.download });
  });
  return kliky;
};
const SONDA = { cilu: 42, oznaceno: 42, chyba: null, zastarala: false, varovani: [] };

it("Stáhnout scénář jde i se zastaralou sondou (server ji přebalí), jen se selhanou ne", async () => {
  const kliky = stazeni();
  const sDnesni: ScenarVerze = { ...V2, sonda: SONDA };
  const zastarala: ScenarVerze = { ...V1, rozbor: ROZBOR, chybaRozboru: null, sonda: { ...SONDA, zastarala: true, varovani: ["počet označených triggerů (41) nesedí na 7 hráčů bez GM"] } };
  const sChybou: ScenarVerze = { ...V1, id: 1, jmenoSouboru: "LLC v0.aoe2scenario", jmenoHry: "ROB_DIPLO_1.aoe2scenario", sonda: { ...SONDA, cilu: 0, oznaceno: 0, chyba: "ValueError: bez sondy" } };
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [sDnesni, zastarala, sChybou] });
  await rozbal();
  expect(screen.queryByText(/sonda:/)).toBeNull();
  expect(screen.queryByRole("link", { name: "originál" })).toBeNull();
  const stahnout = screen.getAllByRole("button", { name: "Stáhnout scénář" });
  expect(screen.queryByRole("button", { name: "Přibalit automatizace" })).toBeNull();
  expect(stahnout.map((b) => [b.className, (b as HTMLButtonElement).disabled])).toEqual([
    ["cta", false],
    ["cta", false],
    ["cta", true],
  ]);
  // Důvod chybějící sondy a varování přibalení zůstávají jako krátká věta.
  expect(screen.getByText(/ValueError: bez sondy/)).toBeTruthy();
  expect(screen.getByText(/nesedí na 7 hráčů bez GM/)).toBeTruthy();

  fireEvent.click(stahnout[0]!);
  expect(kliky).toEqual([{ href: "/api/diplo/scenar/3/soubor", download: "ROB_DIPLO_3.aoe2scenario" }]);
});

it("Stáhnout originál se ptá, že originál nepošle průběh hry; stáhne ho pod jménem od autora", async () => {
  const kliky = stazeni();
  await rozbal();
  fireEvent.click(screen.getAllByRole("button", { name: "Stáhnout originál" })[0]!);
  expect(screen.getByTestId("potvrzeni")).toHaveTextContent("Tahle verze nebude automaticky posílat průběh hry na stránku. Opravdu stáhnout?");
  fireEvent.click(screen.getByRole("button", { name: "Zpět" }));
  expect(screen.queryByTestId("potvrzeni")).toBeNull();
  expect(kliky).toEqual([]);
  fireEvent.click(screen.getAllByRole("button", { name: "Stáhnout originál" })[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Stáhnout" }));
  expect(kliky).toEqual([{ href: "/api/diplo/scenar/3/soubor?original=1", download: "LLC v2.aoe2scenario" }]);
  expect(screen.queryByTestId("potvrzeni")).toBeNull();
});

it("Smazat se potvrzuje a pak seznam načte znovu", async () => {
  await rozbal();
  fireEvent.click(screen.getAllByRole("button", { name: "Smazat" })[1]!);
  expect(screen.getByTestId("potvrzeni")).toHaveTextContent("Smazat verzi LLC v1.aoe2scenario? Nejde vrátit.");
  fireEvent.click(screen.getByRole("button", { name: "Zpět" }));
  expect(diploApi.smazat).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByRole("button", { name: "Smazat" })[1]!);
  fireEvent.click(within(screen.getByTestId("potvrzeni")).getByRole("button", { name: "Smazat" }));
  expect(diploApi.smazat).toHaveBeenCalledWith(2);
  await waitFor(() => expect(diploApi.verze).toHaveBeenCalledTimes(2));
});

// Odmítnutí smazání (409) bylo vidět jen v obecné chybě nahoře nad panelem
// akce, daleko od správy — uživatel měl za to, že mazání nefunguje
// (2. 10. 2026). Věta serveru je teď přímo pod řádkem verze a drží se do
// další akce ve správě.
it("odmítnuté smazání ukáže větu serveru pod řádkem verze až do další akce", async () => {
  const VETA = "ROB_DIPLO_2.aoe2scenario hraje běžící zápas #3 — smazat ji půjde, až bude dohraný nebo zrušený.";
  vi.mocked(diploApi.smazat).mockRejectedValueOnce(new Error(VETA));
  // Skutečné chování hlidej z App: chybu spolkne a ukáže ji jinde.
  const globalni: string[] = [];
  const hlidejApp = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      globalni.push((e as Error).message);
    }
  };
  render(<SpravaScenare hlidej={hlidejApp} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  await screen.findByText("LLC v1.aoe2scenario");
  fireEvent.click(screen.getAllByRole("button", { name: "Smazat" })[1]!);
  fireEvent.click(within(screen.getByTestId("potvrzeni")).getByRole("button", { name: "Smazat" }));
  const radky = screen.getAllByTestId("verze-scenare");
  expect(await within(radky[1]!).findByRole("alert")).toHaveTextContent(VETA);
  expect(within(radky[1]!).getByRole("alert")).toHaveClass("chyba-smazani");
  expect(within(radky[0]!).queryByRole("alert")).toBeNull();
  expect(globalni).toEqual([]);
  // Seznam se po odmítnutí nenačítá znovu; věta zůstává, dokud se nic nestane.
  expect(diploApi.verze).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("chyba-smazani")).toBeTruthy();
  // Další akce (tady Stáhnout scénář) ji uklidí.
  stazeni();
  fireEvent.click(screen.getAllByRole("button", { name: "Stáhnout scénář" })[0]!);
  expect(screen.queryByTestId("chyba-smazani")).toBeNull();
});

it("nahrání bez sondy to řekne", async () => {
  await rozbal();
  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 7, aktivni: false, chybaRozboru: null, chybaSondy: "Krok sondy se nespustil: ENOENT", vlastniMinimapa: null });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v5.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText("Nahráno. Aktivní zůstává dosavadní verze. Sondu se nepodařilo přibalit: Krok sondy se nespustil: ENOENT")).toBeTruthy();
});

// Vlastní minimapa (obrázek ze hry) platí, dokud uživatel neřekne jinak:
// nahrání řekne, jestli ji nová verze převzala, a verzi bez ní ji jde
// převzít tlačítkem od poslední dřívější verze, která ji má.
it("nahrání řekne, jestli se vlastní minimapa převzala", async () => {
  await rozbal();
  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 8, aktivni: false, chybaRozboru: null, chybaSondy: null, vlastniMinimapa: { zdrojId: 3, prevzata: false } });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v6.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText("Nahráno. Aktivní zůstává dosavadní verze. Vlastní minimapa nepřevzata — mapa se změnila.")).toBeTruthy();

  vi.mocked(diploApi.nahrat).mockResolvedValueOnce({ id: 9, aktivni: false, chybaRozboru: null, chybaSondy: null, vlastniMinimapa: { zdrojId: 3, prevzata: true } });
  fireEvent.change(screen.getByLabelText("Soubor scénáře"), { target: { files: [new File(["1.59"], "LLC v7.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByText("Nahráno. Aktivní zůstává dosavadní verze. Vlastní minimapa převzata z verze 3.")).toBeTruthy();
});

it("verze bez vlastní minimapy ji převezme tlačítkem z poslední dřívější verze, která ji má", async () => {
  const sObrazkem: ScenarVerze = { ...V1, id: 1, jmenoSouboru: "LLC.aoe2scenario", rozbor: ROZBOR, chybaRozboru: null, minimapaVlastni: true };
  const novejsiSObrazkem: ScenarVerze = { ...sObrazkem, id: 2, jmenoSouboru: "LLC_2.aoe2scenario" };
  // Verze 3 (bez obrázku) a nečitelná verze 4 — ta mapu nemá, tlačítko nedostane.
  const necitelna: ScenarVerze = { ...V1, id: 4, jmenoSouboru: "LLC_4.aoe2scenario" };
  vi.mocked(diploApi.verze).mockResolvedValue({ verze: [necitelna, V2, novejsiSObrazkem, sObrazkem] });
  await rozbal();
  const tlacitka = screen.getAllByRole("button", { name: /Převzít vlastní minimapu/ });
  expect(tlacitka.map((t) => t.textContent)).toEqual(["Převzít vlastní minimapu z verze 2"]);
  fireEvent.click(tlacitka[0]!);
  expect(diploApi.prevzitMinimapu).toHaveBeenCalledWith(3, 2);
  await waitFor(() => expect(diploApi.verze).toHaveBeenCalledTimes(2));
});

// Odmítnuté nahrání (409 „Tahle verze už je nahraná“) bylo stejně jako
// smazání vidět jen nahoře nad panelem akce — uživatel měl za to, že
// nahrávání nefunguje (3. 10. 2026). Věta serveru je teď u formuláře.
it("odmítnuté nahrání ukáže větu serveru u formuláře, ne nahoře", async () => {
  const VETA = "Tahle verze už je nahraná (č. 2).";
  vi.mocked(diploApi.nahrat).mockRejectedValueOnce(new Error(VETA));
  const globalni: string[] = [];
  const hlidejApp = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      globalni.push((e as Error).message);
    }
  };
  const { container } = render(<SpravaScenare hlidej={hlidejApp} />);
  fireEvent.click(await screen.findByText("Scénář Diplomacie"));
  await screen.findByText("LLC v1.aoe2scenario");
  const vstup = container.querySelector('input[type="file"]') as HTMLInputElement;
  fireEvent.change(vstup, { target: { files: [new File(["x"], "LLC.aoe2scenario")] } });
  fireEvent.click(screen.getByRole("button", { name: "Nahrát" }));
  expect(await screen.findByTestId("chyba-nahrani")).toHaveTextContent(VETA);
  expect(globalni).toEqual([]);
});
