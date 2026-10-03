import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { podvrhniPohyb, type PodvrzenyPohyb } from "../pohybTest.js";
import { Zakryti } from "./Zakryti.js";

it("je zakryté, kliknutí odkryje, další zakryje", () => {
  render(<Zakryti popisek="Tvá tajná role"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role" }));
  expect(screen.getByText("KAT")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zakrýt" }));
  expect(screen.queryByText("KAT")).toBeNull();
});

// Krátký popisek neříká, co kliknutí udělá — to nese bublina, a jen dokud
// je zakryto („Zakrýt“ se vysvětluje samo).
it("nápověda je title zakrytého tlačítka, odkryté ji nemá", () => {
  render(<Zakryti popisek="Tvá tajná role" napoveda="Klikni pro odkrytí"><p>KAT</p></Zakryti>);
  const tlacitko = screen.getByRole("button", { name: "Tvá tajná role" });
  expect(tlacitko).toHaveAttribute("title", "Klikni pro odkrytí");
  fireEvent.click(tlacitko);
  expect(screen.getByRole("button", { name: "Zakrýt" })).not.toHaveAttribute("title");
});

it("nový mount (obnovení stránky) začíná zakrytý", () => {
  const { unmount } = render(<Zakryti popisek="Odkrýt"><p>KAT</p></Zakryti>);
  fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
  unmount();
  render(<Zakryti popisek="Odkrýt"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
});

// Rub karty je vidět jen zakrytý — po odkrytí ho střídá obsah.
it("zakrytá karta ukáže rub, odkrytá obsah", () => {
  render(
    <Zakryti popisek="Odkrýt" rub={<p>RUB</p>}>
      <p>KAT</p>
    </Zakryti>,
  );
  expect(screen.getByText("RUB")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
  expect(screen.queryByText("RUB")).not.toBeInTheDocument();
  expect(screen.getByText("KAT")).toBeInTheDocument();
});

// Karta je tlačítkem sama (uživatel 2. 10. 2026): rub leží uvnitř tlačítka,
// popisek je jen jeho jméno a bublina — žádný nápis navíc.
it("zakrytá karta s rubem je tlačítko, popisek není vidět jako text", () => {
  render(
    <Zakryti popisek="Pult GM — klikni pro odkrytí" rub={<p>RUB</p>}>
      <p>KAT</p>
    </Zakryti>,
  );
  const karta = screen.getByRole("button", { name: "Pult GM — klikni pro odkrytí" });
  expect(karta).toHaveClass("zakryti-karta");
  expect(karta).toContainElement(screen.getByText("RUB"));
  expect(karta).toHaveAttribute("title", "Pult GM — klikni pro odkrytí");
  expect(karta).toHaveAttribute("aria-expanded", "false");
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.queryByText("Pult GM — klikni pro odkrytí")).toBeNull();
  fireEvent.click(karta);
  expect(screen.getByRole("button", { name: "Zakrýt" })).toHaveAttribute("aria-expanded", "true");
});

// Kliknuté tlačítko po výměně stran zmizí — fokus z klávesnice nesmí
// spadnout na začátek stránky.
it("fokus přejde z karty na Zakrýt a zpátky", () => {
  render(
    <Zakryti popisek="Odkrýt" rub={<p>RUB</p>}>
      <p>KAT</p>
    </Zakryti>,
  );
  const karta = screen.getByRole("button", { name: "Odkrýt" });
  karta.focus();
  fireEvent.click(karta);
  const zakryt = screen.getByRole("button", { name: "Zakrýt" });
  expect(zakryt).toHaveFocus();
  fireEvent.click(zakryt);
  expect(screen.getByRole("button", { name: "Odkrýt" })).toHaveFocus();
});

// Otočení karty (uživatel 2. 10. 2026). V prohlížeči má dvě půlky: rub se
// natočí na hranu, teprve pak se vymění obsah a líc se dotočí. Tajný obsah
// se tedy nesmí vykreslit dřív, než první půlka doběhne — a při zakrývání
// musí z DOM zmizet v půlce, ne až na konci.
describe("s pohybem", () => {
  let pohyb: PodvrzenyPohyb;
  beforeEach(() => {
    vi.useFakeTimers();
    pohyb = podvrhniPohyb({ "--prechod-karta": "460ms" });
  });
  afterEach(() => {
    pohyb.uklid();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const karta = () =>
    render(
      <Zakryti popisek="Odkrýt" rub={<p>RUB</p>}>
        <p>KAT</p>
      </Zakryti>,
    );
  // jsdom nemá rozměry; rub musí mít výšku, jinak by se první půlka přeskočila.
  const sVyskou = (vyska: number) => vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockReturnValue(vyska);

  it("odkrytí: rub odjede na hranu, pak se vymění obsah a líc přijede", () => {
    sVyskou(200);
    karta();
    fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
    // První půlka běží: pořád rub, tajný obsah v DOM není.
    expect(screen.getByText("RUB")).toBeInTheDocument();
    expect(screen.queryByText("KAT")).toBeNull();
    expect(pohyb.animace).toHaveLength(1);
    expect(pohyb.animace[0]!.volby).toMatchObject({ duration: 207, fill: "forwards" });
    expect(pohyb.animace[0]!.snimky.at(-1)!.transform).toContain("rotateY(90deg)");
    act(() => pohyb.animace[0]!.dokonci());
    expect(screen.getByText("KAT")).toBeInTheDocument();
    expect(screen.queryByText("RUB")).toBeNull();
    // Druhá půlka: držená první se zruší a líc dojíždí z opačné hrany i s výškou.
    expect(pohyb.animace[0]!.zrusena).toBe(true);
    expect(pohyb.animace).toHaveLength(2);
    expect(pohyb.animace[1]!.snimky[0]).toMatchObject({ height: "200px" });
    expect(pohyb.animace[1]!.snimky[0]!.transform).toContain("rotateY(-90deg)");
    expect(pohyb.animace[1]!.volby.duration).toBeCloseTo(253);
    act(() => pohyb.animace[1]!.dokonci());
    expect(screen.getByTestId("zakryti").querySelector<HTMLElement>(".zakryti-lic")!.style.overflow).toBe("");
  });

  it("zakrytí otáčí opačně a tajný obsah zmizí v půlce pohybu", () => {
    sVyskou(200);
    karta();
    fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
    act(() => pohyb.animace[0]!.dokonci());
    act(() => pohyb.animace[1]!.dokonci());
    fireEvent.click(screen.getByRole("button", { name: "Zakrýt" }));
    expect(screen.getByText("KAT")).toBeInTheDocument();
    expect(pohyb.animace[2]!.snimky.at(-1)!.transform).toContain("rotateY(-90deg)");
    act(() => pohyb.animace[2]!.dokonci());
    expect(screen.queryByText("KAT")).toBeNull();
    expect(screen.getByText("RUB")).toBeInTheDocument();
  });

  it("kliknutí během otáčení se nepočítá, karta se nezasekne napůl", () => {
    sVyskou(200);
    karta();
    const tlacitko = screen.getByRole("button", { name: "Odkrýt" });
    fireEvent.click(tlacitko);
    fireEvent.click(tlacitko);
    expect(pohyb.animace).toHaveLength(1);
  });

  // Záložka na pozadí `finish` nepošle — karta se přesto musí dotočit a
  // další kliknutí zase fungovat.
  it("bez události finish kartu dotočí časovač", () => {
    sVyskou(200);
    karta();
    fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
    act(() => void vi.advanceTimersByTime(400));
    expect(screen.getByText("KAT")).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(400));
    fireEvent.click(screen.getByRole("button", { name: "Zakrýt" }));
    expect(pohyb.animace).toHaveLength(3);
  });
});

// Pult GM (uživatel 3. 10. 2026): odkrytý zůstane po obnovení stránky v téže záložce.
it("s pamětí zůstane odkrytý po novém vykreslení; bez paměti ne", () => {
  sessionStorage.clear();
  const { unmount } = render(<Zakryti popisek="Odkrýt" pamet="diplo-pult-1"><p>KAT</p></Zakryti>);
  fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
  unmount();
  const druhy = render(<Zakryti popisek="Odkrýt" pamet="diplo-pult-1"><p>KAT</p></Zakryti>);
  expect(screen.getByText("KAT")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zakrýt" }));
  druhy.unmount();
  render(<Zakryti popisek="Odkrýt" pamet="diplo-pult-1"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
  sessionStorage.clear();
});
