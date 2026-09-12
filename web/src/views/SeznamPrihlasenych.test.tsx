import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerView } from "../../../src/shared/types.js";
import { AKTIVITA_MINUT } from "../../../src/shared/aktivita.js";
import { formatOdpoctu, podleAktivity, SeznamPrihlasenych } from "./SeznamPrihlasenych.js";

const hrac = (prepis: Partial<PlayerView> = {}): PlayerView => ({
  steamId: "76561198000000001",
  alias: "TenceR",
  steamName: "Vlasta",
  avatarUrl: null,
  country: "cz",
  elo1v1: 1847,
  eloNejvyssi: 1901,
  odehranoHer: 512,
  steamHodiny: 1230,
  posledniZapas: null,
  statyStazenyV: "2026-09-03T12:00:00.000Z",
  statyChyba: null,
  ...prepis,
});

it("ukáže jméno ve hře, ELO a hodiny", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.getByText("TenceR")).toBeInTheDocument();
  expect(screen.getByText("1847")).toBeInTheDocument();
  expect(screen.getByText("1230 h")).toBeInTheDocument();
});

it("u skrytého profilu napíše nezveřejněno", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamHodiny: null, avatarUrl: "https://avatars.steamstatic.com/x_full.jpg" })]} />);
  expect(screen.getByText("nezveřejněno")).toBeInTheDocument();
});

it("bez jména ve hře použije Steam přezdívku", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ alias: null })]} />);
  expect(screen.getByText("Vlasta")).toBeInTheDocument();
});

it("označí data, která se nepodařilo stáhnout", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ statyChyba: "Žebříček: timeout" })]} />);
  expect(screen.getByTitle(/timeout/)).toBeInTheDocument();
});

it("prázdný seznam to řekne slovy", () => {
  render(<SeznamPrihlasenych prihlaseni={[]} />);
  expect(screen.getByText(/zatím se nikdo nepřihlásil/i)).toBeInTheDocument();
});

it("bez režie nenabízí tlačítko „+“", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.queryByRole("button", { name: /vybrat hráče/i })).not.toBeInTheDocument();
});

// Admin si tabulku seřadí kliknutím na hlavičku: vzestupně → sestupně →
// vlastní pořadí (přetažením). Kdo hodnotu nemá, je vždy na konci.
it("v režii řadí kliknutím na sloupec dokola a hráče bez hodnoty dává na konec", async () => {
  const { useSkladani } = await import("../skladani.js");
  const { renderHook } = await import("@testing-library/react");
  localStorage.clear();
  const hraci = [
    hrac({ steamId: "a", alias: "Bez", elo1v1: null }),
    hrac({ steamId: "b", alias: "Nizke", elo1v1: 900 }),
    hrac({ steamId: "c", alias: "Vysoke", elo1v1: 1500 }),
  ];
  const { result } = renderHook(() => useSkladani(hraci));
  const jmena = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelectorAll("td")[1]!.textContent);
  const { rerender } = render(<SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} />);
  expect(jmena()).toEqual(["Bez", "Nizke", "Vysoke"]);

  const elo = screen.getByRole("button", { name: /1v1 elo/i });
  fireEvent.click(elo);
  rerender(<SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} />);
  expect(jmena()).toEqual(["Nizke", "Vysoke", "Bez"]);
  expect(screen.getByRole("columnheader", { name: /1v1 elo/i })).toHaveAttribute("aria-sort", "ascending");

  fireEvent.click(elo);
  expect(jmena()).toEqual(["Vysoke", "Nizke", "Bez"]);

  fireEvent.click(elo);
  expect(jmena()).toEqual(["Bez", "Nizke", "Vysoke"]);
  expect(screen.getByRole("columnheader", { name: /1v1 elo/i })).toHaveAttribute("aria-sort", "none");
});

it("hráči bez režie hlavičky klikat nemůžou", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac()]} />);
  expect(screen.queryByRole("button", { name: /1v1 elo/i })).not.toBeInTheDocument();
});

// Vedle jména je ikona hry podle Steamu: potvrzení, silueta s otazníkem u
// skryté knihovny, vykřičník když hra chybí; bez údaje nic.
it("ukazuje vlastnictví hry ze Steamu vedle jména", () => {
  render(
    <SeznamPrihlasenych
      prihlaseni={[
        hrac({ steamId: "a", alias: "Ma", steamHra: "ma" }),
        hrac({ steamId: "b", alias: "Tajny", steamHra: "soukromy" }),
        hrac({ steamId: "c", alias: "Nema", steamHra: "nema" }),
        hrac({ steamId: "d", alias: "Nevime" }),
      ]}
    />,
  );
  expect(screen.getByRole("img", { name: /hru má na steamu/i })).toHaveClass("ma");
  expect(screen.getByRole("img", { name: /soukromý steam profil/i })).toHaveClass("soukromy");
  expect(screen.getByRole("img", { name: /nebyla nalezena/i })).toHaveClass("nema");
  expect(screen.getAllByTestId("odznak-hry")).toHaveLength(3);
});

// Kdo právě hraje běžící zápas, má v režii zkřížené meče — ať Rob neskládá
// další zápas z lidí, kteří jsou ve hře.
it("v režii označí mečem hráče, kteří právě hrají", async () => {
  const { useSkladani } = await import("../skladani.js");
  const { renderHook } = await import("@testing-library/react");
  const hraci = [hrac({ steamId: "a", alias: "Hraje" }), hrac({ steamId: "b", alias: "Volny" })];
  const { result } = renderHook(() => useSkladani(hraci));
  render(<SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} vZapase={new Map([["a", 3]])} />);
  expect(screen.getByRole("img", { name: /právě hraje zápas #3/i })).toBeInTheDocument();
  expect(screen.getAllByRole("img", { name: /právě hraje/i })).toHaveLength(1);
});

// Najetí na jméno ukáže kartu se statistikami jako ve hře: všech osm
// žebříčků, u nehraných „---“ a nuly.
it("po najetí na jméno ukáže kartu se všemi žebříčky", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ zebricky: [{ id: 4, rating: 953, nejvyssi: 993, poradi: 43389, vyhry: 7, prohry: 10 }] })]} />);
  expect(screen.queryByTestId("staty-hrace")).not.toBeInTheDocument();
  // Ukazatelové události schválně: tažení řádku volá na pointerdown
  // preventDefault, což potlačí navazující myší události, takže po kliknutí
  // by karta se statistikami zůstala viset.
  fireEvent.pointerEnter(screen.getByTestId("jmeno-hrace"));
  const karta = screen.getByTestId("staty-hrace");
  expect(karta).toHaveTextContent("TenceR");
  const radky = karta.querySelectorAll("tbody tr");
  expect(radky).toHaveLength(8);
  expect(radky[1]).toHaveTextContent("Team Random Map");
  expect(radky[1]).toHaveTextContent("953");
  expect(radky[1]).toHaveTextContent("#43389");
  expect(radky[1]).toHaveTextContent("41%");
  expect(radky[0]).toHaveTextContent("---");
  fireEvent.pointerLeave(screen.getByTestId("jmeno-hrace"));
  expect(screen.queryByTestId("staty-hrace")).not.toBeInTheDocument();
});

// ---- Aktivita přihlášených -------------------------------------------------
// Přihláška platí jen chvíli (shared/aktivita.ts). Kdo se dlouho neozval,
// ztmavne, propadne na konec a u sebe vidí cestu zpátky.

const TED = Date.parse("2026-09-08T20:00:00.000Z");
const za = (minut: number) => new Date(TED + minut * 60_000).toISOString();

afterEach(() => {
  vi.useRealTimers();
});

/** Čas je v komponentě z `Date.now()`; testy si ho postaví na pevný okamžik. */
function zmrazCas() {
  vi.useFakeTimers();
  vi.setSystemTime(TED);
}

it("spáči padají na konec, mezi sebou si pořadí drží", () => {
  const a = hrac({ steamId: "a", aktivniDo: za(-1) });
  const b = hrac({ steamId: "b", aktivniDo: za(5) });
  const c = hrac({ steamId: "c", aktivniDo: za(-9) });
  const d = hrac({ steamId: "d", aktivniDo: za(1) });
  expect(podleAktivity([a, b, c, d], TED).map((h) => h.steamId)).toEqual(["b", "d", "a", "c"]);
});

it("když nikdo nespí, pořadí zůstává beze změny", () => {
  const hraci = [hrac({ steamId: "a", aktivniDo: za(3) }), hrac({ steamId: "b" })];
  expect(podleAktivity(hraci, TED)).toBe(hraci);
});

it("spící řádek ztmavne a nese ikonu Zzz", () => {
  zmrazCas();
  render(<SeznamPrihlasenych prihlaseni={[hrac({ aktivniDo: za(-1) })]} />);
  expect(screen.getByText("Zzz")).toBeInTheDocument();
  expect(screen.getByText("TenceR").closest("tr")).toHaveClass("spici");
});

it("aktivní hráč ikonu ani třídu nemá", () => {
  zmrazCas();
  render(<SeznamPrihlasenych prihlaseni={[hrac({ aktivniDo: za(5) })]} />);
  expect(screen.queryByText("Zzz")).not.toBeInTheDocument();
  expect(screen.getByText("TenceR").closest("tr")).not.toHaveClass("spici");
});

it("u vlastního spícího řádku je tlačítko Jsem tu!, u cizího ne", () => {
  zmrazCas();
  const onJsemTu = vi.fn();
  render(
    <SeznamPrihlasenych
      prihlaseni={[hrac({ steamId: "ja", alias: "Já", aktivniDo: za(-1) }), hrac({ steamId: "cizi", alias: "Cizí", aktivniDo: za(-1) })]}
      ja="ja"
      onJsemTu={onJsemTu}
    />,
  );

  const tlacitko = screen.getByRole("button", { name: /jsem tu/i });
  expect(screen.getAllByRole("button", { name: /jsem tu/i })).toHaveLength(1);
  // Značka „spí“ zůstává u obou; tlačítko stojí vedle ní, ne místo ní.
  expect(screen.getAllByText("Zzz")).toHaveLength(2);

  fireEvent.click(tlacitko);
  expect(onJsemTu).toHaveBeenCalledTimes(1);
});

// Čerstvě obnovená lhůta tlačítko nenabízí: není co resetovat.
it("s plnou lhůtou se tlačítko nenabízí, jen odpočet", () => {
  zmrazCas();
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamId: "ja", aktivniDo: za(AKTIVITA_MINUT) })]} ja="ja" onJsemTu={vi.fn()} />);
  expect(screen.queryByRole("button", { name: /jsem tu/i })).not.toBeInTheDocument();
  expect(screen.getByText("15:00")).toBeInTheDocument();
});

// Minutu po obnovení už tlačítko je — kdo vidí čas ubývat, má si umět sáhnout
// na reset dřív, než ho seznam odsune dolů.
it("po minutě se tlačítko nabídne, i když hráč ještě neusnul", () => {
  zmrazCas();
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamId: "ja", aktivniDo: za(AKTIVITA_MINUT - 1.5) })]} ja="ja" onJsemTu={vi.fn()} />);
  expect(screen.getByRole("button", { name: /jsem tu/i })).toBeInTheDocument();
});

// Odpočet je jen vlastní; cizí lhůta nikomu nic neříká.
it("odpočet vidí hráč jen u sebe", () => {
  zmrazCas();
  render(
    <SeznamPrihlasenych
      prihlaseni={[hrac({ steamId: "ja", alias: "Já", aktivniDo: za(5) }), hrac({ steamId: "cizi", alias: "Cizí", aktivniDo: za(5) })]}
      ja="ja"
    />,
  );
  // Dvě číslice i pod deset minut — šířka sloupce se pak nemění.
  expect(screen.getAllByText("05:00")).toHaveLength(1);
});

// V tabulce o dvaceti jménech se člověk hledá první. Vlastní řádek proto nese
// třídu, na kterou se věší zvýraznění — a nese ji i tehdy, když hráč usnul.
it("vlastní řádek je označený, aktivní i usnulý", () => {
  zmrazCas();
  const { rerender } = render(
    <SeznamPrihlasenych
      prihlaseni={[hrac({ steamId: "ja", alias: "Já", aktivniDo: za(5) }), hrac({ steamId: "cizi", alias: "Cizí", aktivniDo: za(5) })]}
      ja="ja"
    />,
  );
  expect(screen.getByText("Já").closest("tr")).toHaveClass("muj-radek");
  expect(screen.getByText("Cizí").closest("tr")).not.toHaveClass("muj-radek");

  rerender(
    <SeznamPrihlasenych prihlaseni={[hrac({ steamId: "ja", alias: "Já", aktivniDo: za(-1) })]} ja="ja" />,
  );
  const radek = screen.getByText("Já").closest("tr");
  expect(radek).toHaveClass("muj-radek");
  expect(radek).toHaveClass("spici");
});

// Nepřihlášený návštěvník žádný vlastní řádek nemá.
it("bez přihlášení není označený nikdo", () => {
  zmrazCas();
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamId: "a" })]} ja={null} />);
  expect(screen.getByText("TenceR").closest("tr")).not.toHaveClass("muj-radek");
});

// Animace přejezdu si řádky hledá podle `data-hrac`; bez toho by neměla co
// měřit a přeskládání by zase skákalo.
it("řádky nesou značku, podle které je animace najde", () => {
  zmrazCas();
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamId: "a" }), hrac({ steamId: "b" })]} />);
  const znacky = document.querySelectorAll("tbody > tr[data-hrac]");
  expect([...znacky].map((r) => r.getAttribute("data-hrac"))).toEqual(["a", "b"]);
});

// Admin potřebuje přehled, kdo za chvíli usne — odpočet proto vidí u všech,
// zkušební hráče nevyjímaje. Hráč vidí jen ten svůj.
it("adminovi běží odpočet u všech řádků", () => {
  zmrazCas();
  const hraci = [hrac({ steamId: "a", alias: "A", aktivniDo: za(5) }), hrac({ steamId: "b", alias: "B", aktivniDo: za(9) })];
  const { rerender } = render(<SeznamPrihlasenych prihlaseni={hraci} ja="a" admin />);
  expect(screen.getByText("05:00")).toBeInTheDocument();
  expect(screen.getByText("09:00")).toBeInTheDocument();

  rerender(<SeznamPrihlasenych prihlaseni={hraci} ja="a" />);
  expect(screen.getByText("05:00")).toBeInTheDocument();
  expect(screen.queryByText("09:00")).not.toBeInTheDocument();
});

// Značka stojí ve vlastním sloupci s pevnou šířkou, ať je to čas, „Zzz“ nebo
// meče — jinak by se sloupec s každým stavem posouval.
it("čas i Zzz stojí ve stejné značce", () => {
  zmrazCas();
  render(
    <SeznamPrihlasenych
      prihlaseni={[hrac({ steamId: "a", alias: "A", aktivniDo: za(5) }), hrac({ steamId: "b", alias: "B", aktivniDo: za(-1) })]}
      ja="a"
      admin
    />,
  );
  expect(screen.getByText("05:00").closest(".stav-znacka")).not.toBeNull();
  expect(screen.getByText("Zzz").closest(".stav-znacka")).not.toBeNull();
});

// Odpočet si tiká po vteřinách, seznam pomaleji. Než seznam stihne nasadit
// „Zzz“, ukazuje doběhlý odpočet nuly — jinak by v buňce chvíli nebylo nic.
it("doběhlý odpočet ukáže nuly, ne prázdno", () => {
  expect(formatOdpoctu(-5_000)).toBe("00:00");
  expect(formatOdpoctu(0)).toBe("00:00");
  expect(formatOdpoctu(59_400)).toBe("01:00");
  expect(formatOdpoctu(900_000)).toBe("15:00");
});

// Bublina říká, jak dlouho je hráč pryč, a nese ji `data-napoveda` — systémový
// `title` čeká vteřinu a vypadá jako z jiné stránky.
it("u spáče je v bublině doba nepřítomnosti", () => {
  zmrazCas();
  render(
    <SeznamPrihlasenych
      prihlaseni={[hrac({ steamId: "a", alias: "A", aktivniDo: za(-7) }), hrac({ steamId: "b", alias: "B", aktivniDo: za(-95) })]}
    />,
  );
  const znacky = screen.getAllByText("Zzz");
  expect(znacky[0]).toHaveAttribute("data-napoveda", "Neaktivní 7 min");
  expect(znacky[1]).toHaveAttribute("data-napoveda", "Neaktivní 1 h 35 min");
  expect(znacky[0]).not.toHaveAttribute("title");
});

// Meče zaberou místo „Zzz“, tak lhůta zůstává v bublině: u usnulého hráče
// v zápase je tam i jak dlouho, u hráče v lhůtě nic navíc.
it("meč u usnulého hráče říká v bublině, jak dlouho je neaktivní", async () => {
  zmrazCas();
  const { useSkladani } = await import("../skladani.js");
  const { renderHook } = await import("@testing-library/react");
  const hraci = [hrac({ steamId: "a", alias: "Spi", aktivniDo: za(-9) }), hrac({ steamId: "b", alias: "Bdi", aktivniDo: za(5) })];
  const { result } = renderHook(() => useSkladani(hraci));
  render(
    <SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} vZapase={new Map([["a", 2], ["b", 2]])} />,
  );
  expect(screen.getByRole("img", { name: /právě hraje zápas #2\s+neaktivní 9 min/i })).toBeInTheDocument();
  expect(screen.getByRole("img", { name: /^právě hraje zápas #2$/i })).toBeInTheDocument();
});

// „Hráč nemá hru“: plus je zašedlé, ale jde na něj kliknout — napřed se
// zeptá a vybere až po potvrzení.
it("hráče bez hry vybere až po potvrzení", async () => {
  const { useSkladani } = await import("../skladani.js");
  const { renderHook } = await import("@testing-library/react");
  const hraci = [hrac({ steamId: "a", alias: "Nema", steamHra: "nema" })];
  const { result } = renderHook(() => useSkladani(hraci));
  const vyber = vi.spyOn(result.current, "vyber");
  render(<SeznamPrihlasenych prihlaseni={hraci} skladani={result.current} />);
  const plus = screen.getByRole("button", { name: /vybrat hráče nema/i });
  expect(plus).toHaveClass("bez-hry");
  fireEvent.click(plus);
  expect(vyber).not.toHaveBeenCalled();
  expect(screen.getByRole("alertdialog", { name: /nemá hru na svém účtě/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /^přidat$/i }));
  expect(vyber).toHaveBeenCalledWith("a");
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
});

// V debug módu klik na ikonu hry cykluje stavy, ať jdou všechny vidět.
it("v debug módu klik na ikonu hry přepíná má → nelze ověřit → nemá", () => {
  render(<SeznamPrihlasenych prihlaseni={[hrac({ steamId: "a", alias: "Ma", steamHra: "ma" })]} ladeni />);
  const ikona = () => screen.getByTestId("odznak-hry");
  expect(ikona()).toHaveClass("ma");
  fireEvent.click(ikona());
  expect(ikona()).toHaveClass("soukromy");
  fireEvent.click(ikona());
  expect(ikona()).toHaveClass("nema");
  fireEvent.click(ikona());
  expect(ikona()).toHaveClass("ma");
});

// Admin má u cizích hráčů zvonek (svolání do radnice), u sebe ne.
it("admin má zvonek u hráče po pěti minutách odpočtu i u spícího, a po kliknutí zvonek na chvíli zešedne", () => {
  zmrazCas();
  const onSvolat = vi.fn();
  const hraci = [hrac({ steamId: "rob", alias: "Rob", aktivniDo: za(8) }), hrac({ steamId: "a", alias: "Adam", aktivniDo: za(8) }), hrac({ steamId: "b", alias: "Bedřich", aktivniDo: za(14) }), hrac({ steamId: "c", alias: "Cyril", aktivniDo: za(-1) })];
  render(<SeznamPrihlasenych prihlaseni={hraci} ja="rob" admin onSvolat={onSvolat} lhutaMinut={15} />);
  expect(screen.queryByRole("button", { name: /svolat hráče rob/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /svolat hráče bedřich/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /svolat hráče cyril/i })).toBeInTheDocument();
  const zvonek = screen.getByRole("button", { name: /svolat hráče adam/i });
  fireEvent.click(zvonek);
  expect(onSvolat).toHaveBeenCalledWith("a");
  expect(zvonek).toBeDisabled();
  expect(zvonek).toHaveClass("chladne");
  fireEvent.click(zvonek);
  expect(onSvolat).toHaveBeenCalledTimes(1);
});
