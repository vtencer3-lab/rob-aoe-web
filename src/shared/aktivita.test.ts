import { describe, expect, it } from "vitest";
import { AKTIVITA_MINUT, jeAktivni, ODSTUP_PULSU_MINUT, PRODLOUZENI_MINUT } from "./aktivita.js";

const TED = Date.parse("2026-09-08T20:00:00.000Z");
const za = (minut: number) => new Date(TED + minut * 60_000).toISOString();

describe("jeAktivni", () => {
  it("platná lhůta znamená aktivního hráče", () => {
    expect(jeAktivni(za(1), TED)).toBe(true);
    expect(jeAktivni(za(AKTIVITA_MINUT), TED)).toBe(true);
  });

  it("vypršelá lhůta znamená spáče", () => {
    expect(jeAktivni(za(-1), TED)).toBe(false);
    expect(jeAktivni(za(0), TED)).toBe(false);
  });

  // Starší snímky stavu a zkušební data lhůtu nemají. Schovat kvůli tomu
  // hráče na konec seznamu by bylo horší než ho nechat být.
  it("bez údaje se hráč bere jako aktivní", () => {
    expect(jeAktivni(null, TED)).toBe(true);
    expect(jeAktivni(undefined, TED)).toBe(true);
    expect(jeAktivni("nesmysl", TED)).toBe(true);
  });
});

// Odstup pulsů musí být kratší než lhůta, jinak by hráč usnul dřív, než by
// mu druhý puls stihl něco přidat; a prodloužení musí být kratší než lhůta,
// jinak by kliknutí dělalo totéž co „Jsem tu!“.
it("lhůty dávají dohromady smysl", () => {
  expect(ODSTUP_PULSU_MINUT).toBeLessThan(AKTIVITA_MINUT);
  expect(PRODLOUZENI_MINUT).toBeLessThan(AKTIVITA_MINUT);
});
