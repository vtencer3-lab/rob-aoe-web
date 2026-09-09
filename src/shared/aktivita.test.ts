import { describe, expect, it } from "vitest";
import {
  AKTIVITA_MINUT,
  jeAktivni,
  nabidnoutJsemTu,
  ODSTUP_PULSU_MINUT,
  PRODLOUZENI_MINUT,
  zbyvaMs,
} from "./aktivita.js";

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

describe("zbyvaMs", () => {
  it("spočítá zbytek lhůty a záporné číslo u spáče", () => {
    expect(zbyvaMs(za(2), TED)).toBe(120_000);
    expect(zbyvaMs(za(-1), TED)).toBe(-60_000);
  });

  it("bez údaje nevrací nic", () => {
    expect(zbyvaMs(null, TED)).toBeNull();
    expect(zbyvaMs("nesmysl", TED)).toBeNull();
  });
});

// Práh se počítá z lhůty, ne z pevného čísla: až si ji bude admin nastavovat,
// tlačítko se má nabízet minutu po obnovení bez ohledu na to, jak je dlouhá.
describe("nabidnoutJsemTu", () => {
  it("čerstvá lhůta tlačítko nenabízí, po minutě ano", () => {
    expect(nabidnoutJsemTu(za(AKTIVITA_MINUT), TED)).toBe(false);
    expect(nabidnoutJsemTu(za(AKTIVITA_MINUT - 0.5), TED)).toBe(false);
    expect(nabidnoutJsemTu(za(AKTIVITA_MINUT - 1.5), TED)).toBe(true);
  });

  it("spáčovi se nabízí taky", () => {
    expect(nabidnoutJsemTu(za(-5), TED)).toBe(true);
  });

  it("bez údaje se nenabízí", () => {
    expect(nabidnoutJsemTu(null, TED)).toBe(false);
  });
});
