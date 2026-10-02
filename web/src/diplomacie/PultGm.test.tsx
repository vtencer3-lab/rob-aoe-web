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
  odkryj();
  const dlazdice = screen.getAllByTestId("dlazdice");
  expect(dlazdice).toHaveLength(7);
  expect(dlazdice[0]!.textContent).toMatch(/p1.*modrá.*Hráč 1/);
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
  const cil = screen.getByRole("combobox", { name: `Cíl: ${jmeno(kat.hracId)}` });
  expect(cil).toHaveValue(kat.cilHracId);
  const moznosti = within(cil).getAllByRole("option").map((o) => o.getAttribute("value"));
  expect(moznosti).not.toContain("h1");
  expect(moznosti).not.toContain(kat.hracId);
  fireEvent.change(screen.getByRole("combobox", { name: `Role: ${jmeno(kat.hracId)}` }), { target: { value: "garda" } });
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, kat.hracId, { role: "garda" });
  expect(screen.getByText("Složení odpovídá pravidlům.")).toBeTruthy();
  // Jméno v řádku nese čtvereček barvy hráče; u roletky cíle stojí čtvereček
  // právě vybraného cíle (položky roletky barvu nést neumějí) a Nájezdník
  // má u „zná:“ barvu druhého Nájezdníka.
  const barvaHrace = (id: string) => `barva-${zapas.ucastnici.find((u) => u.hracId === id)!.barva}`;
  expect(screen.getByRole("rowheader", { name: jmeno(kat.hracId) }).querySelector(".swatch")).toHaveClass(barvaHrace(kat.hracId));
  expect(cil.parentElement!.querySelector(".swatch")).toHaveClass(barvaHrace(kat.cilHracId!));
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
it("po losu jde cíl změnit roletkou rovnou, bez dotazu", () => {
  render(<PultGm zapas={zapas} data={gmData("losovano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  const kat = ROLE_LOS.find((r) => r.role === "kat")!;
  const jiny = ["h2", "h3", "h4", "h5", "h6", "h8"].find((h) => h !== kat.hracId && h !== kat.cilHracId)!;
  fireEvent.change(screen.getByRole("combobox", { name: `Cíl: ${jmeno(kat.hracId)}` }), { target: { value: jiny } });
  expect(screen.queryByRole("alertdialog")).toBeNull();
  expect(diploApi.role).toHaveBeenCalledWith(zapas.id, kat.hracId, { cilHracId: jiny });
});

it("odchylka složení je vidět", () => {
  const tri = ROLE_LOS.map((r) => (r.role === "kat" ? { ...r, role: "najezdnik" as const, cilHracId: null } : r));
  render(<PultGm zapas={zapas} data={gmData("losovano", tri, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.getByText("3× Nájezdník (má být 2×), chybí Kat")).toBeTruthy();
});

// Dokud server neodpoví, GM nesmí kliknout podruhé — jinak by dvě rychlá
// kliknutí na „Rozdat role“ losovala dvakrát.
it("během běžící akce jsou tlačítka zamčená a po doběhnutí zase volná", async () => {
  let dokonci!: () => void;
  const ceka = (fn: () => Promise<unknown>) => new Promise<void>((resolve) => { dokonci = () => void fn().then(() => resolve()); });
  render(<PultGm zapas={zapas} data={gmData("priprava", [], "h3")} hlidej={ceka} />);
  odkryj();
  fireEvent.click(screen.getByRole("button", { name: "Rozdat role" }));
  expect(screen.getByRole("button", { name: "Rozdat role" })).toBeDisabled();
  expect(screen.getAllByTestId("dlazdice")[0]).toBeDisabled();
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

// Po rozeslání už není co losovat ani upravovat — zůstává návrat a přehled.
it("po rozeslání zmizí Přelosovat a Rozeslat, přehled se dá zkopírovat", () => {
  render(<PultGm zapas={zapas} data={gmData("rozeslano", ROLE_LOS, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.queryByRole("button", { name: "Přelosovat" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Rozeslat role" })).toBeNull();
  expect(screen.getByRole("button", { name: "Kopírovat přehled rolí" })).toBeTruthy();
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
  // Dokud Nástupce není zvolený, koruna na mapě není; legenda v pultu není nikdy.
  expect(document.querySelector(".mapa-scenare .koruna")).toBeNull();
  expect(screen.queryByTestId("legenda-mapy")).toBeNull();
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
// cíle, u spojence i v přehledu pro Discord musí rozlišit barva. Člověk
// s jedinečným jménem přívěsek nedostane.
it("dvě AI v sestavě rozliší barva: řádky, cíle, spojenec i přehled", () => {
  const writeText = vi.fn(async () => {});
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  render(<PultGm zapas={ZAPAS_AI} data={gmData("losovano", ROLE_AI, "h1")} hlidej={spust} />);
  odkryj();
  expect(screen.getByRole("rowheader", { name: "AI (p3)" })).toBeTruthy();
  expect(screen.getByRole("rowheader", { name: "AI (p5)" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Role: AI (p3)" })).toBeTruthy();
  expect(screen.getByRole("combobox", { name: "Role: AI (p5)" })).toBeTruthy();
  const kat = ROLE_AI.find((r) => r.role === "kat")!;
  const cile = within(screen.getByRole("combobox", { name: `Cíl: ${jmeno(kat.hracId)}` })).getAllByRole("option").map((o) => o.textContent);
  expect(cile).toContain("AI (p3)");
  expect(cile).toContain("AI (p5)");
  expect(screen.getAllByText(/^zná:/).map((z) => z.textContent)).toContain("zná: AI (p3)");
  expect(screen.queryByText(/Hráč \d \(p\d\)/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Kopírovat přehled rolí" }));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("AI (p3): Nájezdník"));
  expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Žoldák (AI (p5)) -> Pakt s: Hráč 2"));
});
