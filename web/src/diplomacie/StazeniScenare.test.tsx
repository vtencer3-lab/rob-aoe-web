import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VERZE } from "./fixtury.js";
import { PodvrzenaSlozka, podvrhniProhlizec, zavrenyDialog, type PodvrzenyProhlizec } from "./slozkaHryTest.js";
import { cestaKeScenarum, StazeniScenare } from "./StazeniScenare.js";

// Složka scénářů je pojmenovaná podle účtu ve hře: Steam ID, nebo XUID bez
// předpony `xbox:`, kterou web používá jen jako své id hráče (spec §5.3).
it("cesta pro Steam a pro Xbox hráče", () => {
  expect(cestaKeScenarum("76561198014056480")).toBe("%USERPROFILE%\\Games\\Age of Empires 2 DE\\76561198014056480\\resources\\_common\\scenario\\");
  expect(cestaKeScenarum("xbox:2533274952064423")).toBe("%USERPROFILE%\\Games\\Age of Empires 2 DE\\2533274952064423\\resources\\_common\\scenario\\");
});

it("host dostane odkaz na verzi zápasu, nebo větu, že scénář chybí", () => {
  const { rerender } = render(<StazeniScenare verze={VERZE} ja="76561198014056480" />);
  expect(screen.getByRole("link", { name: "Stáhnout scénář" }).getAttribute("href")).toMatch(/\/api\/diplo\/scenar\/3\/soubor$/);
  expect(screen.getByText(/přepiš/)).toBeTruthy();
  // Věta o Create Lobby tu není: totéž ukazuje okno Create Lobby hned pod tím.
  expect(screen.queryByText(/Create Lobby/)).toBeNull();
  expect(screen.queryByText("Custom Scenario")).toBeNull();
  rerender(<StazeniScenare verze={null} ja="x" />);
  expect(screen.getByText("Scénář zatím nikdo nenahrál.")).toBeTruthy();
});

// Odkaz má atribut download se jménem verze a cesta ke složce je ke
// zkopírování jedním kliknutím, i s jménem souboru v instrukci.
it("odkaz stahuje pod jménem verze a cesta je kopírovatelná", () => {
  render(<StazeniScenare verze={VERZE} ja="xbox:2533274952064423" />);
  expect(screen.getByRole("link", { name: "Stáhnout scénář" }).getAttribute("download")).toBe("JIN_DIPLO_3.aoe2scenario");
  expect(screen.getByRole("button", { name: "Kopírovat cestu ke scénářům" }).textContent).toContain("\\2533274952064423\\resources\\_common\\scenario\\");
  expect(screen.getAllByText("JIN_DIPLO_3.aoe2scenario").length).toBeGreaterThan(0);
});

// Bez File System Access API (Firefox, Safari, telefon — a testovací DOM)
// zůstává všechno jako dřív: zlaté „Stáhnout scénář“ a nic o ukládání do hry.
it("bez podpory složek nabídne jen stažení", () => {
  render(<StazeniScenare verze={VERZE} ja="76561198014056480" />);
  expect(screen.getByRole("link", { name: "Stáhnout scénář" })).toHaveClass("cta");
  expect(screen.queryByRole("button", { name: "Uložit scénář do hry" })).toBeNull();
  expect(screen.queryByText(/Nebo ručně/)).toBeNull();
});

// Chrome a Edge: hlavní cesta je uložení rovnou do složky hry, stažení
// zůstává jako druhá možnost (uživatel 2. 10. 2026).
describe("s podporou složek", () => {
  const JA = "76561198014056480";
  let prohlizec: PodvrzenyProhlizec;
  let schranka: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    prohlizec = podvrhniProhlizec();
    schranka = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText: schranka }, configurable: true });
  });
  afterEach(() => {
    prohlizec.uklid();
    Reflect.deleteProperty(navigator, "clipboard");
  });
  const ulozit = () => screen.getByRole("button", { name: "Uložit scénář do hry" });
  const ulozeno = () => screen.findByText("Uloženo do složky", { exact: false });

  it("hlavní je „Uložit scénář do hry“, stažení zůstává jako odkaz a cesta ke zkopírování taky", () => {
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    expect(ulozit()).toHaveClass("cta");
    const odkaz = screen.getByRole("link", { name: "Stáhnout scénář" });
    expect(odkaz).not.toHaveClass("cta");
    expect(odkaz.getAttribute("href")).toMatch(/\/api\/diplo\/scenar\/3\/soubor$/);
    expect(odkaz.getAttribute("download")).toBe("JIN_DIPLO_3.aoe2scenario");
    expect(screen.getByRole("button", { name: "Kopírovat cestu ke scénářům" })).toBeInTheDocument();
    // Dokud hráč složku nevybral, o žádné se nemluví.
    expect(screen.queryByRole("button", { name: "změnit složku" })).toBeNull();
  });

  // Předvolit cestu v dialogu prohlížeč nedovolí — hráč ji dostane do
  // schránky a v dialogu ji jen vloží; věta mu to řekne.
  it("poprvé zkopíruje cestu, řekne co vybrat a po zápisu potvrdí složku", async () => {
    const slozka = new PodvrzenaSlozka("scenario");
    let vyber!: (s: PodvrzenaSlozka) => void;
    prohlizec.vyber.mockReturnValueOnce(new Promise((ano) => (vyber = ano)));
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    fireEvent.click(ulozit());
    expect(schranka).toHaveBeenCalledWith(cestaKeScenarum(JA));
    expect(screen.getByText("Vyber složku scénářů hry — cestu máš zkopírovanou níž.")).toBeInTheDocument();
    // Během výběru a zápisu je tlačítko zamčené, ať se soubor nezapisuje dvakrát.
    expect(screen.getByRole("button", { name: "Ukládám…" })).toBeDisabled();
    vyber(slozka);
    expect(await ulozeno()).toHaveTextContent("Uloženo do složky scenario.");
    expect(slozka.soubory.get("JIN_DIPLO_3.aoe2scenario")).toBe(prohlizec.obsah);
    expect(prohlizec.fetch.mock.calls[0]![0]).toMatch(/\/api\/diplo\/scenar\/3\/soubor$/);
    expect(screen.queryByText(/Vyber složku scénářů hry/)).toBeNull();
    expect(ulozit()).toBeEnabled();
    expect(screen.getByRole("button", { name: "změnit složku" })).toBeInTheDocument();
  });

  it("se zapamatovanou složkou stačí jedno kliknutí — bez dialogu, bez výzvy", async () => {
    const slozka = new PodvrzenaSlozka("scenario");
    prohlizec.vyber.mockResolvedValueOnce(slozka);
    const { unmount } = render(<StazeniScenare verze={VERZE} ja={JA} />);
    fireEvent.click(ulozit());
    await ulozeno();
    unmount();
    // Nové načtení stránky: složku si web pamatuje a ukáže ji předem.
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    expect(await screen.findByText("Ukládá se do složky", { exact: false })).toHaveTextContent("Ukládá se do složky scenario");
    schranka.mockClear();
    slozka.soubory.clear();
    fireEvent.click(ulozit());
    expect(screen.queryByText(/Vyber složku scénářů hry/)).toBeNull();
    await ulozeno();
    expect(prohlizec.vyber).toHaveBeenCalledTimes(1);
    expect(schranka).not.toHaveBeenCalled();
    expect(slozka.soubory.has("JIN_DIPLO_3.aoe2scenario")).toBe(true);
  });

  // Pojistka: složka, která se nejmenuje `scenario`, se napřed ukáže hráči.
  it("cizí složku nechá potvrdit, nebo vybrat znovu", async () => {
    const stazene = new PodvrzenaSlozka("Downloads");
    const spravna = new PodvrzenaSlozka("scenario");
    prohlizec.vyber.mockResolvedValueOnce(stazene).mockResolvedValueOnce(spravna);
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    fireEvent.click(ulozit());
    const pojistka = await screen.findByText(/Tohle nevypadá jako složka scénářů hry — čekám …\\resources\\_common\\scenario/);
    expect(pojistka).toHaveTextContent("Vybraná složka se jmenuje Downloads.");
    expect(stazene.soubory.size).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Vybrat znovu" }));
    expect(await ulozeno()).toHaveTextContent("scenario");
    expect(spravna.soubory.has("JIN_DIPLO_3.aoe2scenario")).toBe(true);
    expect(stazene.soubory.size).toBe(0);
    expect(screen.queryByText(/Tohle nevypadá/)).toBeNull();
  });

  it("potvrzená cizí složka se použije a zapamatuje", async () => {
    const jina = new PodvrzenaSlozka("moje-scenare");
    prohlizec.vyber.mockResolvedValueOnce(jina);
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    fireEvent.click(ulozit());
    await screen.findByText(/Tohle nevypadá/);
    fireEvent.click(screen.getByRole("button", { name: "Uložit sem" }));
    expect(await ulozeno()).toHaveTextContent("moje-scenare");
    expect(jina.soubory.has("JIN_DIPLO_3.aoe2scenario")).toBe(true);
    expect(prohlizec.vyber).toHaveBeenCalledTimes(1);
  });

  it("zavřený dialog i odmítnuté povolení řekne česky a odkáže na obyčejné stažení", async () => {
    prohlizec.vyber.mockRejectedValueOnce(zavrenyDialog());
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    fireEvent.click(ulozit());
    expect(await screen.findByRole("alert")).toHaveTextContent("Složka nebyla vybrána. Zkus to znovu, nebo scénář stáhni obyčejně odkazem níž.");
    expect(ulozit()).toBeEnabled();
    // Druhý pokus: složka vybraná, ale hráč zápis nepovolí.
    const slozka = new PodvrzenaSlozka("scenario");
    slozka.povoleni = "prompt";
    slozka.odpovedHrace = "denied";
    prohlizec.vyber.mockResolvedValueOnce(slozka);
    fireEvent.click(ulozit());
    expect(await screen.findByText(/nedostal povolení/)).toHaveTextContent("Scénář můžeš stáhnout obyčejně odkazem níž.");
    expect(slozka.soubory.size).toBe(0);
    expect(screen.getByRole("link", { name: "Stáhnout scénář" })).toBeInTheDocument();
  });

  it("„změnit složku“ otevře dialog znovu a ukládá do nové", async () => {
    const stara = new PodvrzenaSlozka("scenario");
    const nova = new PodvrzenaSlozka("scenario");
    prohlizec.vyber.mockResolvedValueOnce(stara).mockResolvedValueOnce(nova);
    render(<StazeniScenare verze={VERZE} ja={JA} />);
    fireEvent.click(ulozit());
    await ulozeno();
    fireEvent.click(screen.getByRole("button", { name: "změnit složku" }));
    await vi.waitFor(() => expect(nova.soubory.has("JIN_DIPLO_3.aoe2scenario")).toBe(true));
    expect(prohlizec.vyber).toHaveBeenCalledTimes(2);
    expect(await ulozeno()).toHaveTextContent("scenario");
  });
});
