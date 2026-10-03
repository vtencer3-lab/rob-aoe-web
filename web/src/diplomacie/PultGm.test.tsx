import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { aiId, JMENO_AI } from "../../../src/shared/aiHraci.js";
import { losujRole } from "../../../src/shared/diplomacie/los.js";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, RoleHrace, StavDiplo } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { PultGm } from "./PultGm.js";

vi.mock("./api.js", () => ({
  diploApi: {
    nastupce: vi.fn(async () => ({ ok: true })),
    los: vi.fn(async () => ({ ok: true })),
    role: vi.fn(async () => ({ ok: true })),
    rozeslat: vi.fn(async () => ({ ok: true })),
    zpet: vi.fn(async () => ({ ok: true })),
    mapa: vi.fn(async () => ({ ok: true })),
    minimapaUrl: () => "/m.webp",
  },
}));
import { diploApi } from "./api.js";

// Volání mocků se jinak hromadí přes testy a `not.toHaveBeenCalled` by neplatilo.
afterEach(() => {
  vi.clearAllMocks();
});

const spust = async (fn: () => Promise<unknown>) => {
  await fn();
};
const jmeno = (id: string) => `Hráč ${id.slice(1)}`;
/** Nezredigovaná data, jak je vidí GM `h7`: Nástupce je v nich hned po výběru, ne až po rozeslání. */
const gmData = (stav: StavDiplo, role: RoleHrace[], nastupce?: string): DiploData => {
  const data = stavDiplo(stav, role);
  return { ...data, zapasy: data.zapasy.map((z) => ({ ...z, nastupceHracId: nastupce ?? null })) };
};
const ROLE_LOS = losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h1", () => 0);
/** Sestava se dvěma AI (na zelené a tyrkysové) — obě se jmenují „AI“ jako ve hře. */
const ZAPAS_AI: ZapasView = { ...zapas, ucastnici: zapas.ucastnici.map((u) => (u.barva === 3 || u.barva === 5 ? { ...u, hracId: aiId(u.barva), alias: JMENO_AI, platformaJmeno: JMENO_AI } : u)) };
const ROLE_AI = losujRole(ZAPAS_AI.ucastnici.filter((u) => u.barva !== 7).map((u) => u.hracId), "h1", () => 0);

const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Pult GM — klikni pro odkrytí" }));
/** Po doběhnutí akce se tlačítka zase odemknou — teprve pak jde klikat dál. */
const odemceno = (tlacitko: string) => waitFor(() => expect(screen.getByRole("button", { name: tlacitko })).toBeEnabled());

it("je zakrytý; v přípravě nabídne 7 dlaždic s pN a barvou", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  expect(screen.queryByTestId("dlazdice")).toBeNull();
  // Znak GM je v záhlaví, tedy vidět i na zakrytém pultu.
  expect(screen.getByRole("img", { name: "GM" })).toHaveClass("znak-role");
  // Tlačítkem je zakrytá karta sama — rub uvnitř, žádný nápis nad ní.
  const karta = screen.getByRole("button", { name: "Pult GM — klikni pro odkrytí" });
  expect(karta.querySelector("img.rub-karty")).toBeTruthy();
  expect(screen.queryByText("Pult GM — klikni pro odkrytí")).toBeNull();
  odkryj();
  const dlazdice = screen.getAllByTestId("dlazdice");
  expect(dlazdice).toHaveLength(7);
  expect(dlazdice[0]!.textContent).toMatch(/^modrá.*Hráč 1$/);
});

it("klik na dlaždici vybere Nástupce, pak Rozdat role losuje", async () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  odkryj();
  fireEvent.click(screen.getAllByTestId("dlazdice")[2]!);
  expect(diploApi.nastupce).toHaveBeenCalledWith(zapas.id, "h3");
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={spust} />);
  await odemceno("Rozdat role");
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  expect(diploApi.los).toHaveBeenCalledWith(zapas.id);
});

it("po losu tabulka s roletkami, cíle jen povolené, souhrn složení a rozeslání", async () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  expect(screen.getByRole("combobox", { name: `Role: ${jmeno(kat.hracId)}` })).toHaveValue("kat");
  // Výběr cíle je vlastní rozbalovací seznam (tlačítko + listbox se čtverečky barev).
  const cil = screen.getByRole("button", { name: `Cíl: ${jmeno(kat.hracId)}` });
  expect(cil).toHaveTextContent(jmeno(kat.cilHracId!));
  fireEvent.click(cil);
  const moznosti = within(screen.getByRole("listbox", { name: `Cíl: ${jmeno(kat.hracId)}` })).getAllByRole("option").map((o) => o.textContent);
  expect(moznosti).not.toContain("Hráč 1");
  expect(moznosti).not.toContain(jmeno(kat.hracId));
  fireEvent.click(cil);
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(kat.hracId)}` }), { target: { value: "garda" } });
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, kat.hracId, { role: "garda" });
  expect(screen.getByText("Složení odpovídá pravidlům.")).toBeTruthy();
  // Jméno v řádku nese čtvereček barvy hráče, výběr cíle čtvereček vybraného
  // cíle a Nájezdník má u „zná:“ barvu druhého Nájezdníka.
  const barvaHrace = (id: string) => `barva-${zapas.ucastnici.find((u) => u.hracId === id)!.barva}`;
  expect(screen.getByRole("rowheader", { name: jmeno(kat.hracId) }).querySelector(".swatch")).toHaveClass(barvaHrace(kat.hracId));
  expect(cil.querySelector(".swatch")).toHaveClass(barvaHrace(kat.cilHracId!));
  const [najezdnik, druhy] = ROLE_LOS.filter((r) => r.role === "najezdnik");
  const zna = within(screen.getByRole("rowheader", { name: jmeno(najezdnik!.hracId) }).closest("tr")!).getByText(/^zná:/);
  expect(zna).toHaveTextContent(`zná: ${jmeno(druhy!.hracId)}`);
  expect(zna.querySelector(".swatch")).toHaveClass(barvaHrace(druhy!.hracId));
  // Znak role u každého řádku: dva Nájezdníci = dva stejné znaky.
  expect(screen.getAllByRole("img", { name: "Nájezdník" })).toHaveLength(2);
  await odemceno("Rozeslat role");
  fireEvent.click(screen.getByRole("button", { name: "Rozeslat role" }));
  expect(diploApi.rozeslat).toHaveBeenCalledWith(zapas.id);
});

// Po rozeslání hráči role vidí a hrají podle nich, tak už je GM nemění
// (uživatel 2. 10. 2026): z roletek je prostý text — znak a název role jako
// u Nástupce, cíl se jménem a barvou hráče. Zpátky vede jen „Zpět na výběr
// Nástupce“.
it("po rozeslání nejsou v tabulce žádné výběry: role i cíle jsou text", () => {
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  const barvaHrace = (id: string) => `barva-${zapas.ucastnici.find((u) => u.hracId === id)!.barva}`;
  const radek = (id: string) => screen.getByRole("rowheader", { name: jmeno(id) }).closest("tr")!;
  for (const r of ROLE_LOS) {
    // Název role textem a její znak v každém řádku, i u Nástupce.
    expect(within(radek(r.hracId)).getByText(NAZEV_ROLE[r.role]).tagName).toBe("STRONG");
    expect(within(radek(r.hracId)).getByRole("img", { name: NAZEV_ROLE[r.role] })).toHaveClass("znak-role");
  }
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  const obet = within(radek(kat.hracId)).getByText(/^oběť:/);
  expect(obet).toHaveTextContent(`oběť: ${jmeno(kat.cilHracId!)}`);
  expect(obet.querySelector(".swatch")).toHaveClass(barvaHrace(kat.cilHracId!));
  const zoldak = ROLE_LOS.find((r) => r.role === "zoldak")!;
  const pakt = within(radek(zoldak.hracId)).getByText(/^pokrevní pouto:/);
  expect(pakt).toHaveTextContent(`pokrevní pouto: ${jmeno(zoldak.cilHracId!)}`);
  expect(pakt.querySelector(".swatch")).toHaveClass(barvaHrace(zoldak.cilHracId!));
  const [najezdnik, druhy] = ROLE_LOS.filter((r) => r.role === "najezdnik");
  expect(within(radek(najezdnik!.hracId)).getByText(/^zná:/)).toHaveTextContent(`zná: ${jmeno(druhy!.hracId)}`);
  expect(diploApi.role).not.toHaveBeenCalled();
});

it("po rozeslání Kat i Žoldák bez cíle ukážou „—“, ne roletku", () => {
  const bezCile = ROLE_LOS.map((r) => (r.role === "kat" || r.role === "zoldak" ? { ...r, cilHracId: null } : r));
  render(<PultGm zapas={zapas} data={gmData("rozeslano", bezCile, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  const radek = (id: string) => screen.getByRole("rowheader", { name: jmeno(id) }).closest("tr")!;
  expect(within(radek(bezCile.find((r) => r.role === "kat")!.hracId)).getByText(/^oběť:/)).toHaveTextContent("oběť: —");
  expect(within(radek(bezCile.find((r) => r.role === "zoldak")!.hracId)).getByText(/^pokrevní pouto:/)).toHaveTextContent("pokrevní pouto: —");
});

// Před rozesláním se úprava neptá — hráči ještě nic nevidí.
it("po losu jde cíl změnit výběrem rovnou, bez dotazu", () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  const jiny = ["h2", "h3", "h4", "h5", "h6", "h8"].find((h) => h !== kat.hracId && h !== kat.cilHracId)!;
  fireEvent.click(screen.getByRole("button", { name: `Cíl: ${jmeno(kat.hracId)}` }));
  fireEvent.click(screen.getByRole("option", { name: jmeno(jiny) }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, kat.hracId, { cilHracId: jiny });
});

it("odchylka složení je vidět", () => {
  const tri = ROLE_LOS.map((r) => (r.role === "kat" ? { ...r, role: "najezdnik" as const, cilHracId: null } : r));
  render(<PultGm zapas={zapas} data={gmData("losovano", tri, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.getByText("3× Nájezdník (má být 2×), chybí Kat")).toBeTruthy();
});

// Dokud server neodpoví, druhé kliknutí nic nepošle — jinak by dvě rychlá
// kliknutí na „Rozdat role“ losovala dvakrát. Tlačítka se přitom nezamykají
// (zprůhlednění při každé volbě sekci rozblikalo, uživatel 3. 10. 2026).
it("během běžící akce druhé kliknutí nic nepošle a tlačítka nezešednou", async () => {
  let dokonci!: () => void;
  const ceka = vi.fn((fn: () => Promise<unknown>) => new Promise<void>((resolve) => { dokonci = () => void fn().then(() => resolve()); }));
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={ceka} />);
  odkryj();
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  fireEvent.click(screen.getAllByTestId("dlazdice")[0]!);
  expect(ceka).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeEnabled();
  expect(screen.getAllByTestId("dlazdice")[0]).toBeEnabled();
  await act(async () => dokonci());
  await odemceno("Rozdat role");
});

it("bez Nástupce nejde rozdat; GM mezi dlaždicemi není a vybraná je označená", () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  odkryj();
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeDisabled();
  expect(screen.queryByText("Hráč 7")).toBeNull();
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={spust} />);
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeEnabled();
  const vybrane = screen.getAllByTestId("dlazdice").filter((d) => d.classList.contains("vybrana"));
  expect(vybrane).toHaveLength(1);
  expect(vybrane[0]!.textContent).toContain("Hráč 3");
});

// Admin vyměnil v přípravě hráče, kterého GM už odklikl: server Nástupce
// vynuluje, ale snímek se sestavou může dorazit dřív. Dokud Nástupce není
// mezi hráči, není ani zvolený — žádná dlaždice a „Rozdat role“ zamčené.
it("Nástupce mimo sestavu neplatí: bez označené dlaždice a bez losu", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h9")} hlidej={spust} />);
  odkryj();
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeDisabled();
  expect(screen.getAllByTestId("dlazdice").filter((d) => d.classList.contains("vybrana"))).toHaveLength(0);
});

it("Zpět na výběr Nástupce: po losu rovnou, po rozeslání jen s potvrzením", async () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  fireEvent.click(screen.getByRole("button", { name: "Zpět na výběr Nástupce" }));
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(diploApi.zpet).toHaveBeenCalledWith(zapas.id, false);
  vi.mocked(diploApi.zpet).mockClear();
  await odemceno("Zpět na výběr Nástupce");
  rerender(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  fireEvent.click(screen.getByRole("button", { name: "Zpět na výběr Nástupce" }));
  expect(screen.getByRole("alertdialog", { name: "Role už hráči vidí. Opravdu je smazat a vybírat Nástupce znovu?" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ne" }));
  expect(diploApi.zpet).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Zpět na výběr Nástupce" }));
  fireEvent.click(screen.getByRole("button", { name: "Ano" }));
  expect(diploApi.zpet).toHaveBeenCalledWith(zapas.id, true);
});

// Po rozeslání už není co losovat ani upravovat — zůstává jen návrat.
// Kopírování přehledu rolí uživatel 3. 10. 2026 zrušil.
it("po rozeslání zmizí Přelosovat a Rozeslat, zůstane Zpět", () => {
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.queryByRole("button", { name: "Přelosovat" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Rozeslat role" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Kopírovat přehled rolí" })).toBeNull();
  expect(screen.getByRole("button", { name: "Zpět na výběr Nástupce" })).toBeTruthy();
  expect(screen.getByText("Rozesláno")).toBeTruthy();
});

// Velká minimapa se všemi starty a jmény hráčů (spec §8.1); GM na šedé
// start nemá, takže značek je sedm. Před odkrytím mapa není (znak GM
// v záhlaví ano, proto dotaz na název mapy, ne na libovolný obrázek).
it("odkrytý pult ukáže velkou minimapu se všemi starty a jmény", () => {
  render(<PultGm zapas={zapas} data={gmData("priprava", [])} hlidej={spust} />);
  expect(screen.queryByRole("img", { name: /^Mapa scénáře/ })).toBeNull();
  odkryj();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
  const starty = screen.getAllByTestId("start");
  expect(starty).toHaveLength(7);
  expect(starty.find((s) => s.classList.contains("barva-1"))!.textContent).toBe("Hráč 1");
  // Dokud Nástupce není zvolený, koruna na mapě není.
  expect(document.querySelector(".mapa-scenare .koruna")).toBeNull();
});

// Jakmile GM Nástupce zvolí, nese na velké mapě korunu jako na kartách
// hráčů — v přípravě hned po kliknutí na dlaždici i ve všech dalších stavech.
// Nástupce mimo sestavu (souběh se změnou sestavy) korunu nedostane.
it("zvolený Nástupce má na mapě pultu korunu", () => {
  const { rerender } = render(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={spust} />);
  odkryj();
  const start = (barva: number) => screen.getAllByTestId("start").find((s) => s.classList.contains(`barva-${barva}`))!;
  expect(start(3).className).toBe("start barva-3 druh-nastupce");
  expect(within(start(3)).getByRole("img", { name: "Nástupce císaře" })).toHaveClass("koruna");
  expect(start(3).textContent).toBe("Hráč 3");
  expect(document.querySelectorAll(".mapa-scenare .koruna")).toHaveLength(1);
  rerender(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  expect(start(1)).toHaveClass("druh-nastupce");
  expect(start(3)).not.toHaveClass("druh-nastupce");
  expect(document.querySelectorAll(".mapa-scenare .koruna")).toHaveLength(1);
  rerender(<PultGm zapas={zapas} data={gmData("priprava", [], "h9")} hlidej={spust} />);
  expect(document.querySelector(".mapa-scenare .koruna")).toBeNull();
});

// Dvě AI se jmenují stejně („AI“ jako ve hře), takže je v tabulce, roletce
// cíle i u spojence musí rozlišit barva. Člověk s jedinečným jménem
// přívěsek nedostane.
it("dvě AI v sestavě rozliší barva: řádky, cíle i spojenec", () => {
  render(<PultGm zapas={ZAPAS_AI} data={gmData("losovano", ROLE_AI, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.getByRole("rowheader", { name: "AI (p3)" })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: "AI (p5)" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Role: AI (p3)" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Role: AI (p5)" })).toBeTruthy();
  const kat = ROLE_AI.find((r) => r.role === "kat")!;
  fireEvent.click(screen.getByRole("button", { name: `Cíl: ${jmeno(kat.hracId)}` }));
  // Položky výběru cíle nesou čtvereček barvy s číslem; čtečkám „(pN)“.
  const cile = within(screen.getByRole("listbox")).getAllByRole("option");
  expect(cile.map((o) => o.textContent)).toContain("AI (p3)");
  expect(cile.map((o) => o.textContent)).toContain("AI (p5)");
  expect(cile.flatMap((o) => [...o.querySelectorAll(".swatch")].map((s) => s.getAttribute("data-cislo")))).toEqual(expect.arrayContaining(["3", "5"]));
  expect(screen.getAllByText(/^zná:/).map((z) => z.textContent)).toContain("zná: AI (p3)");
  expect(screen.queryByText(/Hráč \d \(p\d\)/)).toBeNull();
});

// Smazaná verze (2. 10. 2026): dohraný zápas přijde o otisk a pult se
// vykreslí bez mapy, místo aby ukázal mapu aktivní verze.
it("pult dohraného zápasu, jehož verze byla smazána, se vykreslí bez mapy", () => {
  const data = gmData("rozeslano", ROLE_LOS, "h1");
  render(<PultGm zapas={{ ...zapas, stav: "dohrano" }} data={{ ...data, verze: {}, zapasy: data.zapasy.map((z) => ({ ...z, scenarId: null })) }} hlidej={spust} />);
  odkryj();
  expect(screen.getAllByRole("img", { name: NAZEV_ROLE.kat }).length).toBeGreaterThan(0);
  expect(screen.queryByRole("img", { name: /^Mapa scénáře/ })).toBeNull();
});

// Najetí na hráče (řádek tabulky nebo start na mapě) ukáže na mapě pultu jeho
// vztahy stejně jako na jeho kartě: oběť Kata, druhého Nájezdníka, pouto
// Žoldáka (uživatel 3. 10. 2026). Po odjetí kurzoru zmizí.
it("najetí na hráče ukáže na mapě jeho vztahy jako na jeho kartě", () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const start = (hracId: string) => screen.getAllByTestId("start").find((s) => s.classList.contains(`barva-${hracId.slice(1)}`))!;
  const radek = (hracId: string) => screen.getByRole("rowheader", { name: jmeno(hracId) }).closest("tr")!;
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  fireEvent.mouseEnter(radek(kat.hracId));
  expect(start(kat.cilHracId!)).toHaveClass("druh-obet");
  expect(start(kat.hracId)).toHaveClass("najeto");
  expect(radek(kat.hracId)).toHaveClass("najeto");
  fireEvent.mouseLeave(radek(kat.hracId));
  expect(document.querySelector(".mapa-scenare .druh-obet, .mapa-scenare .najeto")).toBeNull();
  const [n1, n2] = ROLE_LOS.filter((r) => r.role === "najezdnik");
  fireEvent.mouseEnter(start(n1!.hracId));
  expect(start(n2!.hracId)).toHaveClass("druh-spojenec");
  expect(radek(n1!.hracId)).toHaveClass("najeto");
  fireEvent.mouseLeave(start(n1!.hracId));
  const zoldak = ROLE_LOS.find((r) => r.role === "zoldak")!;
  fireEvent.mouseEnter(radek(zoldak.hracId));
  expect(start(zoldak.cilHracId!)).toHaveClass("druh-pouto");
});

// Přepínače pod mapou (uživatel 3. 10. 2026): GM vypne krále nebo relikvie
// na mapě pultu i v overlayích; nastavení drží server u zápasu.
it("přepínače pod mapou posílají, co ukázat, a mapa je poslechne", () => {
  const hra = { cas: 10, prijato: "2026-10-03T12:00:00.000Z", rozdano: false, nastupceHracId: null, hraci: [{ hracId: "h1", cil: null, relikvie: 0, zije: true, kral: { x: 50, y: 50 } }], relikvie: [{ x: 10, y: 10 }] };
  const sHrou = (mapa?: { kralove: boolean; relikvie: boolean }) => {
    const data = gmData("priprava", [], "h1");
    return { ...data, zapasy: data.zapasy.map((z) => ({ ...z, hra, ...(mapa ? { mapa } : {}) })) };
  };
  const { rerender } = render(<PultGm zapas={zapas} data={sHrou()} hlidej={spust} />);
  odkryj();
  expect(screen.getAllByTestId("kral")).toHaveLength(1);
  expect(screen.getAllByTestId("relikvie")).toHaveLength(1);
  const kralove = screen.getByRole("switch", { name: "Zobrazit krále" });
  expect(kralove).toBeChecked();
  fireEvent.click(kralove);
  expect(diploApi.mapa).toHaveBeenCalledWith(zapas.id, { kralove: false });
  rerender(<PultGm zapas={zapas} data={sHrou({ kralove: false, relikvie: true })} hlidej={spust} />);
  expect(screen.queryByTestId("kral")).toBeNull();
  expect(screen.getAllByTestId("relikvie")).toHaveLength(1);
  expect(screen.getByRole("switch", { name: "Zobrazit krále" })).not.toBeChecked();
  rerender(<PultGm zapas={zapas} data={sHrou({ kralove: true, relikvie: false })} hlidej={spust} />);
  expect(screen.getAllByTestId("kral")).toHaveLength(1);
  expect(screen.queryByTestId("relikvie")).toBeNull();
});
