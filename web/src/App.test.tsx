import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, UcastnikView, ZapasView } from "../../src/shared/types.js";
import { App } from "./App.js";
import { api } from "./api.js";
import { prehraj } from "./zvuk.js";
import { useAkceStav } from "./useAkceStav.js";

vi.mock("./zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70, nastavHlasitost: vi.fn(), VYCHOZI_HLASITOST: 70 }));
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
    zavritZapas: vi.fn(),
    hledatLobby: vi.fn().mockResolvedValue({ nalezeno: false, lobbyId: null, nazev: null, maHeslo: null, povolujeDivaky: null }),
    vytvoritAkce: vi.fn(),
    akceStav: vi.fn(),
    vytvoritZapas: vi.fn(),
    zapasStav: vi.fn(),
    vysledek: vi.fn(),
    zmenitHosta: vi.fn(),
    jsemTu: vi.fn(),
    aktivita: vi.fn(),
    pretocitCas: vi.fn(),
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
  vi.mocked(useAkceStav).mockReturnValue({
    stav: payload,
    spojeno: true,
    obnov: vi.fn().mockResolvedValue(undefined),
    novaVerze: null,
  });
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

it("nové pozadí je výchozí a admin ho v debug módu přepínačem v záhlaví vrátí na původní", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  localStorage.setItem("rezie.ladeni", "1");
  nastavStav({ akce: null, prihlaseni: [], zapasy: [] });

  render(<App />);

  const prepinac = await screen.findByRole("switch", { name: /nové pozadí/i });
  expect(document.documentElement.classList.contains("pozadi-nove")).toBe(true);
  fireEvent.click(prepinac);
  expect(document.documentElement.classList.contains("pozadi-nove")).toBe(false);
  fireEvent.click(prepinac);
  expect(document.documentElement.classList.contains("pozadi-nove")).toBe(true);
  localStorage.clear();
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

// Dohraný zápas z vlastní karty vypadne, protože mojeZapasy() filtruje
// `dohrano`. Bez historie by hráči po zapsání výsledku zmizel z obrazovky
// beze stopy a nedozvěděl by se, jak dopadl.
it("hráči po zapsání výsledku zápas nezmizí", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false },
  });
  const dohrany = { ...zapas([u("host1", 1, 1, true), u("b", 1, 1), u("c", 2, 2), u("d", 2, 2)]), stav: "dohrano", vitez: { tym: 1 } as const };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [dohrany] });

  render(<App />);

  expect(await screen.findByTestId("zapas-hlavicka")).toHaveTextContent("vyhrál modrý tým");
  expect(screen.queryByTestId("verejny-zapas")).not.toBeInTheDocument();
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
  expect(screen.getByRole("heading", { name: "Nastavení Lobby" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Přihlášení hráči" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("switch", { name: /pohled uživatele/i }));
  expect(screen.queryByRole("button", { name: /vytvořit zápas/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Nastavení Lobby" })).not.toBeInTheDocument();
  // Název akce zůstává: patří celému večeru, ne režii. Přestane být tlačítkem.
  expect(screen.getByTestId("nazev-akce")).toHaveTextContent("Akce 1");
  expect(screen.queryByRole("button", { name: "Akce 1" })).not.toBeInTheDocument();
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

// Web se nasazuje několikrát za večer. Stará stránka s novými daty tiše
// nefunguje (8. 9. 2026: druhý admin neviděl zavření zápasu, protože jeho
// bundle pole `zavreny` neznal). Server proto hlásí verzi a stránka nabídne
// obnovení — sama se nenačte, aby nikomu nezmizela rozdělaná sestava.
it("při nové verzi serveru nabídne obnovení stránky", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: null });
  vi.mocked(useAkceStav).mockReturnValue({
    stav: { akce: null, prihlaseni: [], zapasy: [] },
    spojeno: true,
    obnov: vi.fn().mockResolvedValue(undefined),
    novaVerze: "99.0.0",
  });
  render(<App />);
  expect(await screen.findByRole("status")).toHaveTextContent("99.0.0");
  expect(screen.getByRole("button", { name: "Načíst znovu" })).toBeInTheDocument();
});

// Adminovi visí u každého zápasu plná karta, takže zkrácený veřejný řádek pod
// ní říkal totéž ještě jednou. A dohrané zápasy se přes večer vršily nad
// rozehraným a tlačily ho z obrazovky — patří pod něj, do vlastní sekce.
it("admin má dohrané zápasy až pod běžícím a bez zkráceného řádku", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true },
  });
  const bezici = zapas([u("host1", 1, 1, true), u("c", 2, 2)]);
  const dohrany: ZapasView = {
    ...zapas([u("host1", 1, 1, true), u("c", 2, 2)]),
    id: 2,
    poradi: 8,
    stav: "dohrano",
    vitez: { tym: 1 },
  };
  // Pořadí ve stavu schválně obráceně: rozhoduje sekce, ne pořadí ze serveru.
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] },
    prihlaseni: [],
    zapasy: [dohrany, bezici],
  });

  render(<App />);

  expect(await screen.findByRole("heading", { name: /historie zápasů/i })).toBeInTheDocument();
  expect(screen.queryByTestId("verejny-zapas")).not.toBeInTheDocument();
  const poradi = screen.getAllByTestId("zapas-hlavicka").map((h) => h.textContent ?? "");
  expect(poradi[0]).toContain("Zápas #7");
  expect(poradi[1]).toContain("Zápas #8");
});

// Tabulka přihlášených patří nad panel akce: kdo dorazil, se čte dřív, než se
// z toho staví zápas.
it("přihlášení hráči stojí nad panelem akce", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true },
  });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] }, prihlaseni: [], zapasy: [] });

  render(<App />);

  const tabulka = await screen.findByRole("heading", { name: "Přihlášení hráči" });
  const panel = screen.getByRole("heading", { name: "Nastavení Lobby" });
  // Node.compareDocumentPosition: 4 = druhý uzel je v dokumentu za prvním.
  expect(tabulka.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

// Zápas se zakládá dole pod tabulkou, takže z něj po kliknutí nebyl vidět ani
// kus. Karta se musí najet doprostřed obrazovky, jakmile dorazí ve stavu.
it("po založení zápasu se stránka posune na jeho kartu", async () => {
  const { fireEvent } = await import("@testing-library/react");
  const posun = vi.fn();
  Element.prototype.scrollIntoView = posun;
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true },
  });
  vi.mocked(api.vytvoritZapas).mockResolvedValue({ zapas: { id: 42 } });
  const hraci = [
    { steamId: "a", alias: "A", steamName: null, avatarUrl: null, country: null, elo1v1: null, eloNejvyssi: null, odehranoHer: null, steamHodiny: null, posledniZapas: null, statyStazenyV: null, statyChyba: null },
    { steamId: "b", alias: "B", steamName: null, avatarUrl: null, country: null, elo1v1: null, eloNejvyssi: null, odehranoHer: null, steamHodiny: null, posledniZapas: null, statyStazenyV: null, statyChyba: null },
  ];
  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [{ steamId: "a", tym: 1, barva: 1, civ: null }, { steamId: "b", tym: 2, barva: 2, civ: null }] },
    prihlaseni: hraci,
    zapasy: [],
  });

  const { rerender } = render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: /vytvořit zápas/i }));
  await vi.waitFor(() => expect(api.vytvoritZapas).toHaveBeenCalled());
  // Do téhle chvíle karta na stránce není, takže není kam posouvat.
  expect(posun).not.toHaveBeenCalled();

  nastavStav({
    akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] },
    prihlaseni: hraci,
    zapasy: [{ ...zapas([u("a", 1, 1, true), u("b", 2, 2)]), id: 42 }],
  });
  rerender(<App />);

  await vi.waitFor(() => expect(posun).toHaveBeenCalledWith({ behavior: "smooth", block: "center" }));
});

// Debug mód na vývojové verzi: zkušební hráči a posun času. Lhůta aktivity je
// čtvrt hodiny, takže bez posunu by se usínání dalo zkoušet jen čekáním.
it("debug mód nabízí zkušební hráče i posun času", async () => {
  const { fireEvent } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true },
  });
  vi.mocked(api.nastaveni).mockResolvedValue({ verze: "0.0.0", zkusebniHraci: true });
  vi.mocked(api.pretocitCas).mockResolvedValue({ minut: 15, dotcenych: 3 });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [] }, prihlaseni: [], zapasy: [] });

  render(<App />);

  // Bez debug módu tam nic z toho není, ať v ostrém večeru nezavazí.
  expect(screen.queryByRole("button", { name: /zkušební hráč/i })).not.toBeInTheDocument();

  fireEvent.click(await screen.findByRole("switch", { name: /debug/i }));
  fireEvent.click(screen.getByRole("button", { name: /\+ zkušební hráč/i }));
  await vi.waitFor(() => expect(api.pridatZkusebniho).toHaveBeenCalledWith(1));

  fireEvent.click(screen.getByRole("button", { name: /odebrat zkušební/i }));
  await vi.waitFor(() => expect(api.odebratZkusebni).toHaveBeenCalledWith(1));

  fireEvent.click(screen.getByRole("button", { name: /posunout o 15 min/i }));
  await vi.waitFor(() => expect(api.pretocitCas).toHaveBeenCalledWith(1, 15));

  fireEvent.click(screen.getByRole("button", { name: /posunout o 1 min/i }));
  await vi.waitFor(() => expect(api.pretocitCas).toHaveBeenCalledWith(1, 1));
});

// „Ukončit akci“ se přestěhovalo z panelu akce nahoru k tabulce přihlášených.
// Je nevratné: po „konec“ akce zmizí všem naráz i s rozehranými zápasy.
it("ukončení akce se ptá a při odmítnutí nic nepošle", async () => {
  const { fireEvent } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true },
  });
  nastavStav({ akce: { id: 1, nazev: "Čtvrtek", stav: "bezi", skladani: [] }, prihlaseni: [], zapasy: [] });
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);

  render(<App />);

  const tlacitko = await screen.findByRole("button", { name: "Ukončit akci" });
  fireEvent.click(tlacitko);
  expect(potvrzeni).toHaveBeenCalled();
  expect(api.akceStav).not.toHaveBeenCalled();

  potvrzeni.mockReturnValue(true);
  fireEvent.click(tlacitko);
  await vi.waitFor(() => expect(api.akceStav).toHaveBeenCalledWith(1, "konec"));
  potvrzeni.mockRestore();
});

// Hráč vidí tytéž karty historie jako Rob, ale nesmí do nich sáhnout.
it("hráči vidí historii zápasů jen ke čtení", async () => {
  vi.mocked(api.me).mockResolvedValue({
    hrac: { steamId: "divak", alias: "Divak", steamName: null, jeAdmin: false },
  });
  const dohrany: ZapasView = {
    ...zapas([u("a", 1, 1, true), u("c", 2, 2)]),
    stav: "dohrano",
    vitez: { tym: 1 },
  };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [dohrany] });

  render(<App />);

  expect(await screen.findByRole("heading", { name: /historie zápasů/i })).toBeInTheDocument();
  expect(screen.getByTestId("zapas-hlavicka")).toHaveTextContent("Zápas #7");
  // Karta místo zkráceného řádku, bez zásahů do výsledku a bez zavírání.
  expect(screen.queryByTestId("verejny-zapas")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /změnit výsledek/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /zavřít zápas/i })).not.toBeInTheDocument();
  // Sbalit smí každý.
  expect(screen.getByRole("button", { name: /sbalit zápas #7/i })).toBeInTheDocument();
});

// Štít v záhlaví vede na kanál. Nová záložka schválně: rozehraný večer se nemá
// zavírat kvůli prokliku na YouTube.
it("logo odkazuje na kanál Brohemians do nové záložky", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: null });
  nastavStav({ akce: null, prihlaseni: [], zapasy: [] });

  render(<App />);

  const odkaz = await screen.findByRole("link", { name: /brohemians/i });
  expect(odkaz).toHaveAttribute("href", "https://www.youtube.com/@BrohemiansAoE");
  expect(odkaz).toHaveAttribute("target", "_blank");
  expect(odkaz.getAttribute("rel")).toContain("noreferrer");
});

// Přidání prvního počítače do sestavy má adminovi připomenout AI Difficulty:
// dokud v lobby žádná AI nesedí, je „–“ v pořádku, s prvním už ne. Blikne
// stejně jako políčko po Ctrl+Z.
it("první AI v sestavě blikne na AI Difficulty, když je nenastavená", async () => {
  const { fireEvent, waitFor } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [], nastaveniLobby: { aiObtiznost: null } }, prihlaseni: [], zapasy: [] });

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Přidat AI do sestavy" }));
  await waitFor(() => expect(document.querySelector('[data-klic="aiObtiznost"].zmena')).toBeTruthy());
});

it("s nastavenou obtížností AI Difficulty nebliká", async () => {
  const { fireEvent } = await import("@testing-library/react");
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi", skladani: [], nastaveniLobby: { aiObtiznost: 1 } }, prihlaseni: [], zapasy: [] });

  render(<App />);

  fireEvent.click(await screen.findByRole("button", { name: "Přidat AI do sestavy" }));
  expect(document.querySelector('[data-klic="aiObtiznost"].zmena')).toBeNull();
});

// Zvon z radnice: hráči slyší, že host založil jejich lobby; admin, že se
// v lobby začalo hrát. Host sám ani první načtení stránky nezvoní.
it("hráči zazvoní založení jeho lobby, hostovi ne", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false } });
  const bez = zapas([u("a", 1, 1, true), u("b", 2, 2)]);
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [bez] });
  const { rerender } = render(<App />);
  await screen.findByText(/spoluhrac/i);
  expect(prehraj).not.toHaveBeenCalled();

  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [{ ...bez, lobbyId: "123", joinUri: "aoe2de://0/123" }] });
  rerender(<App />);
  await vi.waitFor(() => expect(prehraj).toHaveBeenCalledTimes(1));
  expect(String(vi.mocked(prehraj).mock.calls[0]![0])).toMatch(/zvon/);

  // Host to samé nedostane — potvrzení je jeho vlastní.
  vi.mocked(prehraj).mockClear();
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "a", alias: "Host", steamName: null, jeAdmin: false } });
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [bez] });
  const druhy = render(<App />);
  await druhy.findByText(/zakládáš/i);
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [{ ...bez, lobbyId: "123", joinUri: "aoe2de://0/123" }] });
  druhy.rerender(<App />);
  await new Promise((r) => setTimeout(r, 20));
  expect(prehraj).not.toHaveBeenCalled();
});

it("adminovi zazvoní, když se v lobby začne hrát", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "rob", alias: "Rob", steamName: null, jeAdmin: true } });
  const lobby = { ...zapas([u("a", 1, 1, true), u("b", 2, 2)]), lobbyId: "123", fazeLobby: "lobby" as const };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [lobby] });
  const { rerender } = render(<App />);
  await screen.findByRole("button", { name: /vytvořit zápas/i });
  expect(prehraj).not.toHaveBeenCalled();

  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [{ ...lobby, fazeLobby: "hraje_se" as const }] });
  rerender(<App />);
  await vi.waitFor(() => expect(prehraj).toHaveBeenCalledTimes(1));
  expect(String(vi.mocked(prehraj).mock.calls[0]![0])).toMatch(/zvon/);
});

// Zpráva admina v chatu zazvoní ostatním (je to pokyn, ne řeč); vlastní ne.
it("hráči zazvoní nová zpráva od admina, jeho vlastní ne", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false } });
  const bez = { ...zapas([u("a", 1, 1, true), u("b", 2, 2)]), zpravy: [] };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [bez] });
  const { rerender } = render(<App />);
  await screen.findByTestId("chat");

  const moje = { id: 1, steamId: "b", jmeno: "Spoluhrac", jeAdmin: false, barva: 2 as const, tym: 2 as const, text: "jdu", poslano: "2026-09-12T12:00:00.000Z" };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [{ ...bez, zpravy: [moje] }] });
  rerender(<App />);
  await new Promise((r) => setTimeout(r, 20));
  expect(prehraj).not.toHaveBeenCalled();

  const robova = { id: 2, steamId: "rob", jmeno: "Rob", jeAdmin: true, barva: null, tym: null, text: "zakládám", poslano: "2026-09-12T12:01:00.000Z" };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [], zapasy: [{ ...bez, zpravy: [moje, robova] }] });
  rerender(<App />);
  await vi.waitFor(() => expect(prehraj).toHaveBeenCalledTimes(1));
  expect(screen.getByText("zakládám")).toBeInTheDocument();
});

// Zvonek od admina: změna času svolání u mé přihlášky zazvoní poplach; první snímek ne.
it("hráči zazvoní poplach, když ho admin svolá", async () => {
  vi.mocked(api.me).mockResolvedValue({ hrac: { steamId: "b", alias: "Spoluhrac", steamName: null, jeAdmin: false } });
  const ja = { steamId: "b", alias: "Spoluhrac", steamName: null, avatarUrl: null, country: null, elo1v1: null, eloNejvyssi: null, odehranoHer: null, steamHodiny: null, posledniZapas: null, statyStazenyV: null, statyChyba: null, svolanV: null };
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [ja], zapasy: [] });
  const { rerender } = render(<App />);
  await screen.findByText(/spoluhrac/i);
  expect(prehraj).not.toHaveBeenCalled();
  nastavStav({ akce: { id: 1, nazev: "Akce 1", stav: "bezi" }, prihlaseni: [{ ...ja, svolanV: "2026-09-12T15:00:00.000Z" }], zapasy: [] });
  rerender(<App />);
  await vi.waitFor(() => expect(prehraj).toHaveBeenCalledTimes(1));
  expect(String(vi.mocked(prehraj).mock.calls[0]![0])).toMatch(/poplach/);
});
