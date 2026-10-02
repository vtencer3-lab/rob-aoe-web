import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { podvrhniPohyb, type PodvrzenyPohyb } from "../pohybTest.js";
import { Skladaci } from "./Skladaci.js";

function Sekce({ zacatek = false }: { zacatek?: boolean }) {
  const [otevreno, setOtevreno] = useState(zacatek);
  return (
    <Skladaci testId="sekce" hlava="Hlavička" otevreno={otevreno} onPrepnout={setOtevreno}>
      <p>Obsah</p>
    </Skladaci>
  );
}
const hlavicka = () => screen.getByText("Hlavička");
const sekce = () => screen.getByTestId("sekce");

// Testovací DOM pohyb nezná — sekce se přepíná naráz, jako při `prefers-reduced-motion`.
it("bez pohybu se sekce otevře i zavře hned", () => {
  render(<Sekce />);
  fireEvent.click(hlavicka());
  expect(sekce()).toHaveAttribute("open");
  fireEvent.click(hlavicka());
  expect(sekce()).not.toHaveAttribute("open");
  expect(sekce()).not.toHaveAttribute("data-zavira");
});

describe("s pohybem", () => {
  let pohyb: PodvrzenyPohyb;
  beforeEach(() => {
    vi.useFakeTimers();
    pohyb = podvrhniPohyb({ "--prechod-skladani": "280ms" });
  });
  afterEach(() => {
    pohyb.uklid();
    vi.useRealTimers();
  });

  it("otevření přepne stav hned a tělo dojede na svou výšku", () => {
    render(<Sekce />);
    fireEvent.click(hlavicka());
    expect(sekce()).toHaveAttribute("open");
    expect(pohyb.animace).toHaveLength(1);
    expect(pohyb.animace[0]!.snimky[0]).toMatchObject({ height: "0px", opacity: 0 });
    expect(pohyb.animace[0]!.volby).toMatchObject({ duration: 280 });
    const telo = sekce().querySelector<HTMLElement>(".skladaci-telo")!;
    expect(telo.style.overflow).toBe("hidden");
    act(() => pohyb.animace[0]!.dokonci());
    expect(telo.style.overflow).toBe("");
  });

  // Zavření má opačné pořadí: tělo napřed sjede, `open` zmizí až potom —
  // jinak by prohlížeč obsah schoval dřív, než se stihne sbalit. Šipka se
  // přitom točí zpátky už od kliknutí (`data-zavira`).
  it("zavření napřed sbalí tělo, teprve pak sekci zavře", () => {
    render(<Sekce zacatek />);
    fireEvent.click(hlavicka());
    expect(sekce()).toHaveAttribute("open");
    expect(sekce()).toHaveAttribute("data-zavira");
    expect(pohyb.animace[0]!.snimky.at(-1)).toMatchObject({ height: "0px", opacity: 0 });
    // Sbalený konec drží, dokud React sekci nezavře — bez toho by obsah na snímek problikl.
    expect(pohyb.animace[0]!.volby).toMatchObject({ fill: "forwards" });
    act(() => pohyb.animace[0]!.dokonci());
    expect(sekce()).not.toHaveAttribute("open");
    expect(sekce()).not.toHaveAttribute("data-zavira");
    expect(pohyb.animace[0]!.zrusena).toBe(true);
    expect(sekce().querySelector<HTMLElement>(".skladaci-telo")!.style.overflow).toBe("");
  });

  it("kliknutí během pohybu se nepočítá a bez události finish zavře časovač", () => {
    render(<Sekce zacatek />);
    fireEvent.click(hlavicka());
    fireEvent.click(hlavicka());
    expect(pohyb.animace).toHaveLength(1);
    act(() => void vi.advanceTimersByTime(500));
    expect(sekce()).not.toHaveAttribute("open");
    // A jde zase otevřít.
    fireEvent.click(hlavicka());
    expect(sekce()).toHaveAttribute("open");
  });
});
