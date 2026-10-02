import { describe, expect, it } from "vitest";
import type { Barva } from "../types.js";
import { popisCile, popisStari, prectiSnimek, prectiSondu, souhrnSondy, vyhodnotHru, type CilSondy, type SnimekHry } from "./hra.js";

/** Sedm hráčů h1…h8 bez h7: GM sedí na šedé (slot 7) a mezi hráče nepatří. */
const HRACI = ([1, 2, 3, 4, 5, 6, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva }));
const PRIJATO = "2026-10-02T20:00:00.000Z";

/** Cíle jako u LLC: počitadla zabití 15–21 (slot 8 má 21), prodané relikvie slotu 1 v proměnné 13. */
const CILE: CilSondy[] = [
  ...[1, 2, 3, 4, 5, 6, 8].map((slot, i) => ({ promenna: 15 + i, slot, text: "zabito : {} /650 jednotek", limit: 650 })),
  { promenna: 13, slot: 1, text: "{} /5 prodanych reliku", limit: 5 },
];

/**
 * Snímek hry: `cile` je slot → číslo počitadla (proměnná 200 + slot),
 * `hodnoty` proměnná → hodnota. Hráči ve hře jsou číslovaní podle lobby:
 * GM (slot 7) sedí první, takže slot 7 → hráč 1 a slot 1 → hráč 7.
 */
function snimek(cile: Record<number, number>, hodnoty: Record<number, number> = {}): SnimekHry {
  const promenne = new Array<number>(256).fill(0);
  for (const [slot, pocitadlo] of Object.entries(cile)) promenne[200 + Number(slot)] = pocitadlo;
  for (const [promenna, hodnota] of Object.entries(hodnoty)) promenne[Number(promenna)] = hodnota;
  return {
    gm: "h7",
    scenar: "LLC.aoe2scenario",
    cas: 95,
    sloty: [7, 2, 3, 4, 5, 6, 1, 8],
    hraci: [1, 2, 3, 4, 5, 6, 7, 8].map((cislo) => ({ cislo, jmeno: `ve hře ${cislo}`, barva: "<BLUE>", relikvie: cislo === 7 ? 2 : 0, zije: cislo !== 3 })),
    diplomacie: Array.from({ length: 8 }, () => new Array<number>(8).fill(3)),
    promenne,
  };
}
const vyhodnot = (s: SnimekHry, cile = CILE) => vyhodnotHru(s, HRACI, cile, PRIJATO);

describe("Nástupce ze slotů", () => {
  it("jediný hráč bez cíle je Nástupce", () => {
    const hra = vyhodnot(snimek({ 1: 15, 2: 16, 3: 17, 5: 19, 6: 20, 8: 21 }));
    expect(hra.rozdano).toBe(true);
    expect(hra.nastupceHracId).toBe("h4");
    expect(hra.hraci.find((h) => h.hracId === "h4")!.cil).toBeNull();
    expect(hra).toMatchObject({ cas: 95, prijato: PRIJATO });
  });

  it("před rozdáním cílů nikdo — nula u všech není sedm Nástupců", () => {
    const hra = vyhodnot(snimek({}));
    expect(hra.rozdano).toBe(false);
    expect(hra.nastupceHracId).toBeNull();
  });

  it("dva hráči bez cíle jsou nejednoznační — nehádá se", () => {
    const hra = vyhodnot(snimek({ 1: 15, 2: 16, 3: 17, 5: 19, 6: 20 }));
    expect(hra.rozdano).toBe(true);
    expect(hra.nastupceHracId).toBeNull();
  });

  it("cíl mají všichni — Nástupce není", () => {
    expect(vyhodnot(snimek({ 1: 15, 2: 16, 3: 17, 4: 18, 5: 19, 6: 20, 8: 21 })).nastupceHracId).toBeNull();
  });

  it("slot GM se nepočítá: jeho nula ani jeho cíl výsledek nezmění", () => {
    // Slot 7 bez cíle (GM cíl nikdy nedostane) nesmí být „druhý bez cíle“.
    expect(vyhodnot(snimek({ 1: 15, 2: 16, 3: 17, 5: 19, 6: 20, 8: 21 })).nastupceHracId).toBe("h4");
    // A kdyby scénář šedému něco zapsal, hráče to mezi výsledky nepřidá.
    const hra = vyhodnot(snimek({ 1: 15, 2: 16, 3: 17, 5: 19, 6: 20, 7: 99, 8: 21 }));
    expect(hra.nastupceHracId).toBe("h4");
    expect(hra.hraci.map((h) => h.hracId)).toEqual(HRACI.map((h) => h.hracId));
  });
});

describe("postup cílů a stav hráčů", () => {
  it("text, limit a hodnota počitadla přiděleného cíle", () => {
    const hra = vyhodnot(snimek({ 1: 13, 2: 16 }, { 13: 3, 16: 120 }));
    expect(hra.hraci.find((h) => h.hracId === "h1")!.cil).toEqual({ text: "{} /5 prodanych reliku", limit: 5, hodnota: 3 });
    expect(hra.hraci.find((h) => h.hracId === "h2")!.cil).toEqual({ text: "zabito : {} /650 jednotek", limit: 650, hodnota: 120 });
  });

  it("verze bez výpisu cílů: cíl se pozná, text a limit chybí", () => {
    const hra = vyhodnot(snimek({ 2: 16 }, { 16: 7 }), []);
    expect(hra.hraci.find((h) => h.hracId === "h2")!.cil).toEqual({ text: null, limit: null, hodnota: 7 });
  });

  it("relikvie a žije jdou přes převod slot → číslo hráče ve hře", () => {
    const hra = vyhodnot(snimek({}));
    // Slot 1 (modrá) je ve hře hráč 7 — ten má 2 relikvie; slot 3 je hráč 3 a je vyřazený.
    expect(hra.hraci.find((h) => h.hracId === "h1")).toMatchObject({ relikvie: 2, zije: true });
    expect(hra.hraci.find((h) => h.hracId === "h3")).toMatchObject({ relikvie: 0, zije: false });
  });

  it("slot, o kterém hra nic neposlala, má relikvie i žije null", () => {
    const s = snimek({});
    const hra = vyhodnot({ ...s, hraci: s.hraci.filter((h) => h.cislo !== 2) });
    expect(hra.hraci.find((h) => h.hracId === "h2")).toMatchObject({ relikvie: null, zije: null });
  });
});

describe("popisy pro pult", () => {
  it("šablona z triggeru se vyplní a srovná mezery", () => {
    expect(popisCile({ text: "zabito : {} /650 jednotek", limit: 650, hodnota: 3 })).toBe("zabito: 3/650 jednotek");
    expect(popisCile({ text: "{} /5 prodanych reliku", limit: 5, hodnota: 0 })).toBe("0/5 prodanych reliku");
    expect(popisCile({ text: "zkonvertovano : {} /99", limit: 99, hodnota: 12 })).toBe("zkonvertovano: 12/99");
  });

  it("text bez zástupky a cíl bez popisu", () => {
    expect(popisCile({ text: "hrady", limit: 15, hodnota: 2 })).toBe("hrady: 2/15");
    expect(popisCile({ text: null, limit: null, hodnota: 4 })).toBe("cíl: 4");
  });

  it("stáří dat: čerstvá, mlčící hra v sekundách a v minutách", () => {
    expect(popisStari(4.2)).toBe("ze hry před 4 s");
    expect(popisStari(-3)).toBe("ze hry před 0 s");
    expect(popisStari(50)).toBe("hra mlčí 50 s");
    expect(popisStari(150)).toBe("hra mlčí 2 min");
  });
});

describe("tělo od mostu", () => {
  const telo = () => ({ v: 1, ...snimek({ 1: 15 }) });

  it("platné tělo projde beze změny", () => {
    expect(prectiSnimek(telo())).toEqual(snimek({ 1: 15 }));
  });

  it("odmítne jinou verzi, chybějící GM a špatné délky polí", () => {
    expect(() => prectiSnimek({ ...telo(), v: 2 })).toThrow(/neznámá verze/);
    expect(() => prectiSnimek({ ...telo(), gm: "" })).toThrow(/chybí gm/);
    expect(() => prectiSnimek({ ...telo(), promenne: [1, 2, 3] })).toThrow(/promenne má mít 256/);
    expect(() => prectiSnimek({ ...telo(), sloty: [1, 2] })).toThrow(/sloty má mít 8/);
    expect(() => prectiSnimek({ ...telo(), cas: "95" })).toThrow(/cas není celé číslo/);
    expect(() => prectiSnimek(null)).toThrow(/tělo chybí/);
  });
});

describe("výpis sondy", () => {
  it("přečte výstup kroku i JSON z databáze", () => {
    const cile = [{ promenna: 15, slot: 1, text: "zabito : {} /650 jednotek", limit: 650 }];
    expect(prectiSondu({ ok: true, soubor: "…", oznaceno: 42, cile })).toEqual({ cile, oznaceno: 42, chyba: null });
    expect(prectiSondu({ cile: [], oznaceno: 0, chyba: "ValueError: x" })).toEqual({ cile: [], oznaceno: 0, chyba: "ValueError: x" });
  });

  it("do stavu pro prohlížeče jde jen souhrn — počet cílů místo výpisu", () => {
    expect(souhrnSondy({ cile: CILE, oznaceno: 42, chyba: null })).toEqual({ cilu: 8, oznaceno: 42, chyba: null });
    expect(souhrnSondy({ cile: [], oznaceno: 0, chyba: "ValueError: x" })).toEqual({ cilu: 0, oznaceno: 0, chyba: "ValueError: x" });
  });

  it("nesmyslný tvar je chyba", () => {
    expect(() => prectiSondu({ cile: "x", oznaceno: 1 })).toThrow(/cile není seznam/);
    expect(() => prectiSondu({ cile: [{ promenna: "a", slot: 1, text: "", limit: 1 }], oznaceno: 1 })).toThrow(/cíl\.promenna/);
  });
});
