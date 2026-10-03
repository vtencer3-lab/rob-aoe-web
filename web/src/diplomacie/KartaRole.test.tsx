import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { aiId, JMENO_AI } from "../../../src/shared/aiHraci.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { KartaRole } from "./KartaRole.js";

vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70, hlasitostChatu: () => 50 }));
import { prehraj } from "../zvuk.js";

/** Text karty role (bez mapy pod ní a věty o Nástupci nad ní) — tatáž jména jsou i na mapě. */
const naKarte = () => within(document.querySelector<HTMLElement>(".karta-role .role")!);
/** Značka startu na mapě podle barvy; undefined, když tam není. */
const start = (barva: number) => screen.queryAllByTestId("start").find((s) => s.classList.contains(`barva-${barva}`));
const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));

it("před rozesláním čeká", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  expect(screen.getByText("Role se rozdají po startu hry, až GM potvrdí Nástupce.")).toBeTruthy();
});

it("po rozeslání je karta zakrytá a po odkrytí ukáže roli, cíl a oběť", () => {
  const { container } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" />);
  expect(screen.queryByText("Kat")).toBeNull();
  // Zakrytá karta leží rubem nahoru (bez alt — není to informace, jen obrázek).
  expect(container.querySelector("img.rub-karty")).toBeTruthy();
  // Tlačítkem je karta sama: „Tvá tajná role“ je jen její jméno, nápis nemá;
  // že se kliknutím odkrývá, říká title.
  const tlacitko = screen.getByRole("button", { name: "Tvá tajná role" });
  expect(tlacitko.querySelector("img.rub-karty")).toBeTruthy();
  expect(tlacitko.textContent).toBe("");
  expect(tlacitko).toHaveAttribute("title", "Klikni pro odkrytí");
  fireEvent.click(tlacitko);
  expect(container.querySelector("img.rub-karty")).toBeNull();
  expect(screen.getByRole("heading", { name: "Kat" })).toBeTruthy();
  expect(screen.getByRole("img", { name: "Kat" })).toHaveClass("znak-role");
  // Popisky tajných údajů jsou věcné a u všech rolí stejné: „Oběť:“,
  // „Pokrevní pouto:“, „Druhý Nájezdník:“ — bez oslovení.
  expect(screen.getByText("Oběť:")).toBeTruthy();
  expect(screen.getByText("Vyhrává, když splní primární nebo sekundární cíl a jeho oběť je mrtvá. Oběť může zabít kdokoli.")).toHaveClass("cil");
  // Jméno oběti nese čtvereček její barvy (h4 sedí na žluté), Nástupce svůj.
  expect(naKarte().getByText("Hráč 4").querySelector(".swatch")).toHaveClass("barva-4");
  expect(within(screen.getByText(/Nástupcem císaře je/)).getByText("Hráč 1").querySelector(".swatch")).toHaveClass("barva-1");
});

it("Nájezdník vidí druhého Nájezdníka, Žoldák pakt", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null }, { hracId: "h5", role: "najezdnik", cilHracId: null }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByText("Druhý Nájezdník:")).toBeTruthy();
  expect(naKarte().getByText("Hráč 5").querySelector(".swatch")).toHaveClass("barva-5");
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" />);
  expect(screen.getByText("Pokrevní pouto:")).toBeTruthy();
  expect(naKarte().getByText("Hráč 6").querySelector(".swatch")).toHaveClass("barva-6");
});

// Nestandardní složení (spec §6.2: třeba 3× Nájezdník) — redakce posílá
// Nájezdníkovi všechny Nájezdníky a karta musí ukázat oba spojence, ne
// jen prvního; jinak hráč zaútočí na vlastního.
it("při třech Nájezdnících vidí Nájezdník oba spojence", () => {
  const najezdnik = (hracId: string) => ({ hracId, role: "najezdnik" as const, cilHracId: null });
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5"), najezdnik("h8")])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  const radek = screen.getByText("Další Nájezdníci:").parentElement!;
  expect(radek).toHaveTextContent("Další Nájezdníci: Hráč 5, Hráč 8");
  expect([...radek.querySelectorAll(".swatch")].map((s) => s.className)).toEqual(["swatch barva-5", "swatch barva-8"]);
  expect(screen.queryByText("Druhý Nájezdník:")).toBeNull();
});

// Dvě AI se jmenují stejně, takže oběť „AI“ by Katovi neřekla, kterou má
// zabít — rozliší ji barva (stejný helper jako v pultu GM).
it("oběť, která je jednou ze dvou AI, se rozliší barvou", () => {
  const zapasAi = { ...zapas, ucastnici: zapas.ucastnici.map((u) => (u.barva === 3 || u.barva === 5 ? { ...u, hracId: aiId(u.barva), alias: JMENO_AI, platformaJmeno: JMENO_AI } : u)) };
  render(<KartaRole zapas={zapasAi} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: aiId(5) }])} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  // Očima ji rozliší číslo ve čtverečku, čtečkám skryté „(p5)“.
  expect(naKarte().getByText("(p5)")).toHaveClass("sr-only");
  expect(naKarte().getByText("(p5)").closest(".jmeno-s-barvou")!.textContent).toBe("AI (p5)");
  // I na mapě nese oběť jméno s přívěskem barvy, ne holé „AI“.
  expect(start(5)!.textContent).toBe("AI (p5)");
  expect(within(screen.getByText(/Nástupcem císaře je/)).getByText("Hráč 1")).toBeTruthy();
});

// Jméno Nástupce je veřejné, stojí nad zakrytou kartou. Hláška „GM upravil
// tvou roli“ zanikla s úpravami po rozeslání (2. 10. 2026).
it("všichni v zápase vidí Nástupce už nad zakrytou kartou", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }])} ja="h2" />);
  expect(screen.getByText(/Nástupcem císaře je/)).toHaveTextContent("Nástupcem císaře je Hráč 1.");
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.queryByText(/GM upravil/)).toBeNull();
});

it("přechod do rozesláno zazvoní, načtení s už rozeslanými rolemi ne", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" />);
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  vi.mocked(prehraj).mockClear();
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(prehraj).not.toHaveBeenCalled();
});

it("bez rozboru scénáře karta funguje jen s texty rolí", () => {
  render(<KartaRole zapas={zapas} data={{ ...stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }]), aktivni: null, verze: {} }} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  // Znak role zůstává, mapa ne.
  expect(screen.getByRole("img", { name: "Královská Garda" })).toBeTruthy();
  expect(screen.queryByRole("img", { name: /^Mapa scénáře/ })).toBeNull();
});

// Smazání verze (2. 10. 2026) vynuluje otisk dohraných a zrušených zápasů.
// Karta takového zápasu se vykreslí bez mapy — ne s mapou aktivní verze,
// která je jiná. Běžící zápas bez otisku dál hraje aktivní verzi.
it("dohraný zápas, jehož verze byla smazána, se vykreslí bez mapy", () => {
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }]);
  const bezVerze = { ...data, verze: {}, zapasy: data.zapasy.map((z) => ({ ...z, scenarId: null })) };
  const { unmount } = render(<KartaRole zapas={{ ...zapas, stav: "dohrano" }} data={bezVerze} ja="h2" />);
  odkryj();
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  expect(screen.queryByRole("img", { name: /^Mapa scénáře/ })).toBeNull();
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByTestId("pravidla-hry")).toBeTruthy();
  unmount();

  render(<KartaRole zapas={zapas} data={bezVerze} ja="h2" />);
  odkryj();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
});

// Mapa pod kartou (spec §8.2, rozšířeno 2. 10. 2026): vlastní start a hráči,
// ke kterým má hráč podle role vztah; Nástupce císaře s korunou vidí každý.
// Role bez tajného údaje (Garda, Šašek) tak vidí jen sebe a Nástupce. h2
// sedí na červené, Nástupce `h1` na modré. Před odkrytím není žádný obrázek
// s názvem: rub karty je bez alt, tedy mimo roli img.
it("obyčejná role vidí na mapě jen svůj start a Nástupce s korunou", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" />);
  expect(screen.queryByRole("img")).toBeNull();
  odkryj();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
  expect(screen.getAllByTestId("start")).toHaveLength(2);
  expect(start(2)!.className).toBe("start barva-2 druh-ja");
  expect(start(2)!.textContent).toBe("Tady začínáš");
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce");
  expect(start(1)!.textContent).toBe("Hráč 1");
  expect(within(start(1)!).getByRole("img", { name: "Nástupce císaře" })).toHaveClass("koruna");
  expect(start(2)!.querySelector(".koruna")).toBeNull();
});

it("Nájezdník vidí na mapě ostatní Nájezdníky jako spojence", () => {
  const najezdnik = (hracId: string) => ({ hracId, role: "najezdnik" as const, cilHracId: null });
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5")])} ja="h2" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(5)!.className).toBe("start barva-5 druh-spojenec");
  expect(start(5)!.textContent).toBe("Hráč 5");
  expect(within(start(5)!).getByText("Hráč 5")).toHaveAttribute("title", "Hráč 5 — druhý Nájezdník");
  // Tři Nájezdníci (nestandardní složení): oba spojenci, v bublině „další“.
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5"), najezdnik("h8")])} ja="h2" />);
  expect(screen.getAllByTestId("start")).toHaveLength(4);
  expect(start(8)).toHaveClass("druh-spojenec");
  expect(within(start(8)!).getByText("Hráč 8")).toHaveAttribute("title", "Hráč 8 — další Nájezdník");
});

// Oběť je na mapě červeně (třída druhu → barva chyby z palety v CSS).
it("Kat vidí na mapě svou oběť v třídě nebezpečí", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(4)!.className).toBe("start barva-4 druh-obet");
  expect(within(start(4)!).getByText("Hráč 4")).toHaveAttribute("title", "Hráč 4 — tvá oběť");
});

it("Žoldák vidí na mapě hráče, se kterým má pokrevní pouto", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(6)!.className).toBe("start barva-6 druh-pouto");
  expect(within(start(6)!).getByText("Hráč 6")).toHaveAttribute("title", "Hráč 6 — pokrevní pouto");
});

// Nástupce sám má korunu nad vlastním „Tady začínáš“; hráč se dvěma vztahy
// (oběť, která je Nástupcem) nese obojí — korunu i třídu oběti.
it("Nástupce má korunu na vlastním startu; oběť, která je Nástupcem, korunu i červené jméno", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h1", role: "nastupce", cilHracId: null }])} ja="h1" />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce druh-ja");
  expect(start(1)!.textContent).toBe("Tady začínáš");
  expect(start(1)!.querySelector("img.koruna")).toBeTruthy();
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h1" }])} ja="h2" />);
  expect(screen.getAllByTestId("start")).toHaveLength(2);
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce druh-obet");
  expect(start(1)!.querySelector("img.koruna")).toBeTruthy();
  expect(within(start(1)!).getByText("Hráč 1")).toHaveAttribute("title", "Hráč 1 — Nástupce císaře, tvá oběť");
});

// Hráč vidí na své mapě jen vlastního krále (redakce mu dá `mujKral`),
// v barvě svého startu; bez dat ze hry žádného.
it("na mapě karty je jen vlastní král", () => {
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }]);
  const sKralem = { ...data, zapasy: data.zapasy.map((z) => ({ ...z, mujKral: { x: 110, y: 110 } })) };
  const { rerender } = render(<KartaRole zapas={zapas} data={sKralem} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  const kralove = screen.getAllByTestId("kral");
  expect(kralove).toHaveLength(1);
  expect(kralove[0]).toHaveClass("barva-2");
  expect(kralove[0]!.style.left).toBe("50%");
  rerender(<KartaRole zapas={zapas} data={data} ja="h2" />);
  expect(screen.queryByTestId("kral")).toBeNull();
});

// Ping GM se hráči ukáže na mapě karty (server mu pošle jen ten jeho a společné).
it("ping GM je vidět na mapě karty", () => {
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }]);
  const sPingem = { ...data, zapasy: data.zapasy.map((z) => ({ ...z, pingy: [{ id: 7, x: 0.5, y: 0.25, komu: null, kdy: "2026-10-03T12:00:00.000Z" }] })) };
  render(<KartaRole zapas={zapas} data={sPingem} ja="h2" />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  const ping = screen.getByTestId("ping");
  expect(ping.style.left).toBe("50%");
  expect(ping.style.top).toBe("25%");
});

// Nový ping GM cinkne zvukem chatu; pingy, které už svítily při načtení, ne.
it("nový ping cinkne, ping známý při načtení ne", () => {
  vi.mocked(prehraj).mockClear();
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }]);
  const sPingy = (ids: number[]) => ({ ...data, zapasy: data.zapasy.map((z) => ({ ...z, pingy: ids.map((id) => ({ id, x: 0.5, y: 0.5, komu: null, kdy: "2026-10-03T12:00:00.000Z" })) })) });
  const { rerender } = render(<KartaRole zapas={zapas} data={sPingy([1])} ja="h2" />);
  expect(prehraj).not.toHaveBeenCalled();
  rerender(<KartaRole zapas={zapas} data={sPingy([1, 2])} ja="h2" />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  expect(vi.mocked(prehraj).mock.calls[0]![1]).toBe(50);
  rerender(<KartaRole zapas={zapas} data={sPingy([2])} ja="h2" />);
  expect(prehraj).toHaveBeenCalledTimes(1);
});
