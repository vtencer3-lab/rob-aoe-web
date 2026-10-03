import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { aiId, JMENO_AI } from "../../../src/shared/aiHraci.js";
import { stavDiplo, ZAPAS as zapas } from "./fixtury.js";
import { KartaRole } from "./KartaRole.js";

vi.mock("./api.js", () => ({
  diploApi: {
    schopnost: vi.fn(async () => ({ ok: true })),
    promenaVidena: vi.fn(async () => ({ ok: true })),
    minimapaUrl: () => "/m.webp",
  },
}));
import { diploApi } from "./api.js";
vi.mock("../zvuk.js", () => ({ prehraj: vi.fn(), hlasitost: () => 70, hlasitostChatu: () => 50 }));
import { prehraj } from "../zvuk.js";

/** Akce karty (schopnosti, proměna) jdou přes hlídání chyb z App; v testu rovnou. */
const hlidej = async (fn: () => Promise<unknown>) => {
  await fn();
};

/** Text karty role (bez mapy pod ní a věty o Nástupci nad ní) — tatáž jména jsou i na mapě. */
const naKarte = () => within(document.querySelector<HTMLElement>(".karta-role .role")!);
/** Značka startu na mapě podle barvy; undefined, když tam není. */
const start = (barva: number) => screen.queryAllByTestId("start").find((s) => s.classList.contains(`barva-${barva}`));
const odkryj = () => fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));

it("před rozesláním čeká", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" hlidej={hlidej} />);
  expect(screen.getByText("Role se rozdají po startu hry, až GM potvrdí Nástupce.")).toBeTruthy();
});

it("po rozeslání je karta zakrytá a po odkrytí ukáže roli, cíl a oběť", () => {
  const { container } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" hlidej={hlidej} />);
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
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null }, { hracId: "h5", role: "najezdnik", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByText("Druhý Nájezdník:")).toBeTruthy();
  expect(naKarte().getByText("Hráč 5").querySelector(".swatch")).toHaveClass("barva-5");
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" hlidej={hlidej} />);
  expect(screen.getByText("Pokrevní pouto:")).toBeTruthy();
  expect(naKarte().getByText("Hráč 6").querySelector(".swatch")).toHaveClass("barva-6");
});

// Nestandardní složení (spec §6.2: třeba 3× Nájezdník) — redakce posílá
// Nájezdníkovi všechny Nájezdníky a karta musí ukázat oba spojence, ne
// jen prvního; jinak hráč zaútočí na vlastního.
it("při třech Nájezdnících vidí Nájezdník oba spojence", () => {
  const najezdnik = (hracId: string) => ({ hracId, role: "najezdnik" as const, cilHracId: null });
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5"), najezdnik("h8")])} ja="h2" hlidej={hlidej} />);
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
  render(<KartaRole zapas={zapasAi} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: aiId(5) }])} ja="h2" hlidej={hlidej} />);
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
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
  expect(screen.getByText(/Nástupcem císaře je/)).toHaveTextContent("Nástupcem císaře je Hráč 1.");
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.queryByText(/GM upravil/)).toBeNull();
});

it("přechod do rozesláno zazvoní, načtení s už rozeslanými rolemi ne", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("losovano", [])} ja="h2" hlidej={hlidej} />);
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  vi.mocked(prehraj).mockClear();
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
  expect(prehraj).not.toHaveBeenCalled();
});

it("bez rozboru scénáře karta funguje jen s texty rolí", () => {
  render(<KartaRole zapas={zapas} data={{ ...stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }]), aktivni: null, verze: {} }} ja="h2" hlidej={hlidej} />);
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
  const { unmount } = render(<KartaRole zapas={{ ...zapas, stav: "dohrano" }} data={bezVerze} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  expect(screen.queryByRole("img", { name: /^Mapa scénáře/ })).toBeNull();
  fireEvent.click(screen.getByText("Pravidla hry"));
  expect(screen.getByTestId("pravidla-hry")).toBeTruthy();
  unmount();

  render(<KartaRole zapas={zapas} data={bezVerze} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getByRole("img", { name: "Mapa scénáře LLC.aoe2scenario" })).toBeTruthy();
});

// Mapa pod kartou (spec §8.2, rozšířeno 2. 10. 2026): vlastní start a hráči,
// ke kterým má hráč podle role vztah; Nástupce císaře s korunou vidí každý.
// Role bez tajného údaje (Garda, Šašek) tak vidí jen sebe a Nástupce. h2
// sedí na červené, Nástupce `h1` na modré. Před odkrytím není žádný obrázek
// s názvem: rub karty je bez alt, tedy mimo roli img.
it("obyčejná role vidí na mapě jen svůj start a Nástupce s korunou", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "garda", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
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
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5")])} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(5)!.className).toBe("start barva-5 druh-spojenec");
  expect(start(5)!.textContent).toBe("Hráč 5");
  expect(within(start(5)!).getByText("Hráč 5")).toHaveAttribute("title", "Hráč 5 — druhý Nájezdník");
  // Tři Nájezdníci (nestandardní složení): oba spojenci, v bublině „další“.
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [najezdnik("h2"), najezdnik("h5"), najezdnik("h8")])} ja="h2" hlidej={hlidej} />);
  expect(screen.getAllByTestId("start")).toHaveLength(4);
  expect(start(8)).toHaveClass("druh-spojenec");
  expect(within(start(8)!).getByText("Hráč 8")).toHaveAttribute("title", "Hráč 8 — další Nájezdník");
});

// Oběť je na mapě červeně (třída druhu → barva chyby z palety v CSS).
it("Kat vidí na mapě svou oběť v třídě nebezpečí", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(4)!.className).toBe("start barva-4 druh-obet");
  expect(within(start(4)!).getByText("Hráč 4")).toHaveAttribute("title", "Hráč 4 — tvá oběť");
});

it("Žoldák vidí na mapě hráče, se kterým má pokrevní pouto", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "zoldak", cilHracId: "h6" }])} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(3);
  expect(start(6)!.className).toBe("start barva-6 druh-pouto");
  expect(within(start(6)!).getByText("Hráč 6")).toHaveAttribute("title", "Hráč 6 — pokrevní pouto");
});

// Nástupce sám má korunu nad vlastním „Tady začínáš“; hráč se dvěma vztahy
// (oběť, která je Nástupcem) nese obojí — korunu i třídu oběti.
it("Nástupce má korunu na vlastním startu; oběť, která je Nástupcem, korunu i červené jméno", () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h1", role: "nastupce", cilHracId: null }])} ja="h1" hlidej={hlidej} />);
  odkryj();
  expect(screen.getAllByTestId("start")).toHaveLength(1);
  expect(start(1)!.className).toBe("start barva-1 druh-nastupce druh-ja");
  expect(start(1)!.textContent).toBe("Tady začínáš");
  expect(start(1)!.querySelector("img.koruna")).toBeTruthy();
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h1" }])} ja="h2" hlidej={hlidej} />);
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
  const { rerender } = render(<KartaRole zapas={zapas} data={sKralem} ja="h2" hlidej={hlidej} />);
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  const kralove = screen.getAllByTestId("kral");
  expect(kralove).toHaveLength(1);
  expect(kralove[0]).toHaveClass("barva-2");
  expect(kralove[0]!.style.left).toBe("50%");
  rerender(<KartaRole zapas={zapas} data={data} ja="h2" hlidej={hlidej} />);
  expect(screen.queryByTestId("kral")).toBeNull();
});

// Ping GM se hráči ukáže na mapě karty (server mu pošle jen ten jeho a společné).
it("ping GM je vidět na mapě karty", () => {
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }]);
  const sPingem = { ...data, zapasy: data.zapasy.map((z) => ({ ...z, pingy: [{ id: 7, x: 0.5, y: 0.25, komu: null, kdy: "2026-10-03T12:00:00.000Z" }] })) };
  render(<KartaRole zapas={zapas} data={sPingem} ja="h2" hlidej={hlidej} />);
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
  const { rerender } = render(<KartaRole zapas={zapas} data={sPingy([1])} ja="h2" hlidej={hlidej} />);
  expect(prehraj).not.toHaveBeenCalled();
  rerender(<KartaRole zapas={zapas} data={sPingy([1, 2])} ja="h2" hlidej={hlidej} />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  expect(vi.mocked(prehraj).mock.calls[0]![1]).toBe(50);
  rerender(<KartaRole zapas={zapas} data={sPingy([2])} ja="h2" hlidej={hlidej} />);
  expect(prehraj).toHaveBeenCalledTimes(1);
});

// Cíle vedle mapy (uživatel 3. 10. 2026): relikvie k vítězství, odpočet
// držení (ztlumený, dokud hráč nemá 7), sekundární cíl a stav oběti Kata.
it("vedle mapy ukáže cíle hráče ze hry", () => {
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }]);
  const mojeHra = { cas: 300, prijato: "2026-10-03T20:00:00.000Z", rozdano: true, cil: { text: "zbourano : {} /150 budov", limit: 150, hodnota: 12 }, relikvie: 3, drzeni: 65, sledovani: [{ hracId: "h4", zije: false }] };
  render(<KartaRole zapas={zapas} data={{ ...data, zapasy: data.zapasy.map((z) => ({ ...z, mojeHra })) }} ja="h2" hlidej={hlidej} />);
  odkryj();
  const cile = within(screen.getByTestId("moje-cile"));
  expect(cile.getByText("3/7").closest("p")).toHaveTextContent("3/7 Relikvií");
  expect(screen.getByTestId("drzeni")).toHaveTextContent("01:05 / 15:00");
  expect(screen.getByTestId("drzeni")).toHaveClass("ztlumeny");
  expect(screen.getByTestId("sekundarni-cil")).toHaveTextContent("zbourano: 12/150 budov");
  expect(screen.getByTestId("sledovany")).toHaveTextContent("Oběť Hráč 4: padl");
});

it("bez dat ze hry panel cílů čeká", () => {
  render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "kat", cilHracId: "h4" }])} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(within(screen.getByTestId("moje-cile")).getByText(/Postup cílů se ukáže/)).toBeTruthy();
});

// Šašek po pádu Gardy (uživatel 3. 10. 2026): zvon, ztmavlá karta Šaška
// s tlačítkem; po kliknutí karta shoří a server se dozví, že proměnu viděl.
it("Šaškovi padla Garda: zvon, karta Šaška s tlačítkem, po kliknutí shoří", async () => {
  vi.useFakeTimers();
  const sasek = { hracId: "h2", role: "sasek" as const, cilHracId: null };
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [sasek])} ja="h2" hlidej={hlidej} />);
  vi.mocked(prehraj).mockClear();
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ ...sasek, role: "garda", puvodniRole: "sasek", promenaVidena: false }])} ja="h2" hlidej={hlidej} />);
  expect(prehraj).toHaveBeenCalledTimes(1);
  const promena = screen.getByTestId("promena-saska");
  expect(within(promena).getByRole("heading", { name: "Šašek", hidden: true })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Královská garda padla" }));
  expect(promena).toHaveClass("hori");
  expect(diploApi.promenaVidena).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(diploApi.promenaVidena).toHaveBeenCalledWith(zapas.id);
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ ...sasek, role: "garda", puvodniRole: "sasek", promenaVidena: true }])} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getByRole("heading", { name: "Královská Garda" })).toBeTruthy();
  // Gardě už žádost o informace nepatří.
  expect(screen.queryByRole("button", { name: "Vyžádat informaci" })).toBeNull();
  vi.useRealTimers();
});

it("Nájezdník vybere cíl a provede Sabotáž; Šašek žádá informaci", async () => {
  const { rerender } = render(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "najezdnik", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getByRole("button", { name: "Provést Sabotáž" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: /Cíl Sabotáže/ }));
  fireEvent.click(screen.getByRole("option", { name: /Hráč 4/ }));
  fireEvent.click(screen.getByRole("button", { name: "Provést Sabotáž" }));
  expect(diploApi.schopnost).toHaveBeenCalledWith(zapas.id, "sabotaz", "h4");
  rerender(<KartaRole zapas={zapas} data={stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }])} ja="h2" hlidej={hlidej} />);
  expect(screen.getByTestId("stav-schopnosti")).toHaveTextContent("Zbývá 3/3");
  await waitFor(() => expect(screen.getByRole("button", { name: "Vyžádat informaci" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Vyžádat informaci" }));
  expect(diploApi.schopnost).toHaveBeenCalledWith(zapas.id, "informace");
});

it("Šašek vidí povinnost prodat relikvie po smrti Nástupce", () => {
  const data = stavDiplo("rozeslano", [{ hracId: "h2", role: "sasek", cilHracId: null }]);
  const schopnosti = [{ id: 1, hracId: "h2", druh: "sasek_prodej" as const, cilHracId: "h1", stav: "ceka" as const, vytvoreno: "2026-10-03T20:00:00.000Z" }];
  render(<KartaRole zapas={zapas} data={{ ...data, zapasy: data.zapasy.map((z) => ({ ...z, schopnosti })) }} ja="h2" hlidej={hlidej} />);
  odkryj();
  expect(screen.getByTestId("prodej-relikvii")).toHaveTextContent("Nástupce padl — musíš prodat všechny své relikvie.");
});
