import { describe, expect, it } from "vitest";
import type { Barva } from "../types.js";
import {
  DIVAK_USTUPUJE_GM_MS,
  divakUstupuje,
  popisCile,
  popisStari,
  posunKandidata,
  prectiSnimek,
  prectiSondu,
  procBezZapasu,
  souhrnSondy,
  vyberZapasSnimku,
  vyhodnotHru,
  type BeziciZapasDiplo,
  type CilSondy,
  type SnimekHry,
} from "./hra.js";

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
    odesilatel: "h7",
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

// Cíle se rozdávají postupně; šest ze sedmi vypadá na chvíli jako hotový
// výsledek. Odpovědi hry se proto věří až napodruhé.
describe("potvrzení Nástupce dvěma snímky", () => {
  it("stejný hráč ve dvou snímcích aspoň 4 herní sekundy po sobě je potvrzený", () => {
    const prvni = posunKandidata(null, "h4", 100);
    expect(prvni).toEqual({ kandidat: { hracId: "h4", odCasu: 100 }, potvrzeny: null });
    expect(posunKandidata(prvni.kandidat, "h4", 102).potvrzeny).toBeNull();
    expect(posunKandidata(prvni.kandidat, "h4", 104)).toEqual({ kandidat: { hracId: "h4", odCasu: 100 }, potvrzeny: "h4" });
    expect(posunKandidata(prvni.kandidat, "h4", 600).potvrzeny).toBe("h4");
  });

  it("jiné jméno nebo žádné počítání ruší", () => {
    const h4 = posunKandidata(null, "h4", 100).kandidat;
    expect(posunKandidata(h4, "h5", 104)).toEqual({ kandidat: { hracId: "h5", odCasu: 104 }, potvrzeny: null });
    expect(posunKandidata(h4, null, 104)).toEqual({ kandidat: null, potvrzeny: null });
    // Po přerušení se čeká znovu celou dobu.
    expect(posunKandidata(posunKandidata(h4, null, 104).kandidat, "h4", 106).potvrzeny).toBeNull();
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

  it("stáří dat říká, odkud jsou: od GM, nebo od diváka", () => {
    expect(popisStari(3, "gm")).toBe("ze hry (GM) před 3 s");
    expect(popisStari(3, "divak")).toBe("ze hry (divák) před 3 s");
    // Hra mlčí stejně, ať posílal kdokoli.
    expect(popisStari(50, "divak")).toBe("hra mlčí 50 s");
  });
});

describe("ke kterému zápasu snímek patří", () => {
  const zapas = (zapasId: number, gmHracId: string | null, jmenoScenare: string | null = "LLC.aoe2scenario"): BeziciZapasDiplo => ({ zapasId, gmHracId, jmenoScenare });
  const GM = ["h7", "xbox:h7"];
  const DIVAK = ["d1", "xbox:d1"];

  it("odesílatel je GM běžícího zápasu → zdroj gm; u víc jeho zápasů první (nejnovější)", () => {
    expect(vyberZapasSnimku([zapas(12, "h7")], GM, "LLC.aoe2scenario")).toEqual({ zapasId: 12, zdroj: "gm" });
    expect(vyberZapasSnimku([zapas(14, "x"), zapas(13, "h7"), zapas(12, "h7")], GM, "LLC.aoe2scenario")).toEqual({ zapasId: 13, zdroj: "gm" });
    // GM z Microsoft účtu: most posílá XUID bez předpony.
    expect(vyberZapasSnimku([zapas(12, "xbox:h7")], GM, "LLC.aoe2scenario")).toEqual({ zapasId: 12, zdroj: "gm" });
    // GM podle id má přednost, i když scénář nesedí (varování řeší až příjem).
    expect(vyberZapasSnimku([zapas(12, "h7")], GM, "Jiny.aoe2scenario")).toEqual({ zapasId: 12, zdroj: "gm" });
  });

  it("jiný odesílatel a jediný běžící zápas se stejným scénářem → zdroj divak", () => {
    expect(vyberZapasSnimku([zapas(12, "h7")], DIVAK, "LLC.aoe2scenario")).toEqual({ zapasId: 12, zdroj: "divak" });
    expect(vyberZapasSnimku([zapas(12, "h7", "LLC.aoe2scenario")], DIVAK, "llc")).toEqual({ zapasId: 12, zdroj: "divak" });
    // Šedou nikdo neobsadil — divák se pořád přiřadí podle scénáře.
    expect(vyberZapasSnimku([zapas(12, null)], DIVAK, "LLC.aoe2scenario")).toEqual({ zapasId: 12, zdroj: "divak" });
  });

  it("divák bez jistoty nic: víc běžících zápasů, jiný scénář, zápas bez scénáře, žádný zápas", () => {
    expect(vyberZapasSnimku([zapas(13, "h7"), zapas(12, "h6")], DIVAK, "LLC.aoe2scenario")).toBeNull();
    expect(vyberZapasSnimku([zapas(12, "h7")], DIVAK, "Jiny.aoe2scenario")).toBeNull();
    expect(vyberZapasSnimku([zapas(12, "h7", null)], DIVAK, "LLC.aoe2scenario")).toBeNull();
    expect(vyberZapasSnimku([], DIVAK, "LLC.aoe2scenario")).toBeNull();
  });

  it("každý důvod má vlastní českou větu pro 404", () => {
    expect(procBezZapasu([], "d1", "LLC.aoe2scenario")).toBe("Na webu teď neběží žádný zápas Diplomacie.");
    expect(procBezZapasu([zapas(13, "h7"), zapas(12, "h6")], "d1", "LLC.aoe2scenario")).toBe(
      "d1 není GM žádného běžícího zápasu Diplomacie a zápasů běží víc (2) — data diváka nejde přiřadit. Pusť most na PC GM.",
    );
    expect(procBezZapasu([zapas(12, "h7")], "d1", "Jiny.aoe2scenario")).toBe(
      "d1 není GM běžícího zápasu Diplomacie a hra hlásí scénář „Jiny.aoe2scenario“, zápas ale hraje „LLC.aoe2scenario“ — data diváka nejde přiřadit.",
    );
    expect(procBezZapasu([zapas(12, "h7", null)], "d1", "LLC.aoe2scenario")).toBe("d1 není GM běžícího zápasu Diplomacie a zápas nemá scénář — data diváka nejde přiřadit.");
  });

  it("divák ustupuje GM, dokud od něj přišel snímek před méně než 20 s", () => {
    const ted = 1_000_000;
    expect(DIVAK_USTUPUJE_GM_MS).toBe(20_000);
    expect(divakUstupuje("divak", ted - 19_999, ted)).toBe(true);
    expect(divakUstupuje("divak", ted - 20_000, ted)).toBe(false);
    expect(divakUstupuje("divak", null, ted)).toBe(false);
    // GM neustupuje nikomu.
    expect(divakUstupuje("gm", ted - 1, ted)).toBe(false);
  });
});

describe("tělo od mostu", () => {
  const telo = () => ({ v: 1, ...snimek({ 1: 15 }) });

  it("platné tělo projde beze změny", () => {
    expect(prectiSnimek(telo())).toEqual(snimek({ 1: 15 }));
  });

  // Most do 1.14 posílal odesílatele pod jménem `gm`.
  it("starší pole gm se bere jako odesílatel; odesilatel má přednost", () => {
    const { odesilatel: _, ...bezOdesilatele } = telo();
    expect(prectiSnimek({ ...bezOdesilatele, gm: "h7" })).toEqual(snimek({ 1: 15 }));
    expect(prectiSnimek({ ...telo(), odesilatel: "divak", gm: "h7" }).odesilatel).toBe("divak");
    expect(() => prectiSnimek(bezOdesilatele)).toThrow(/odesilatel není text/);
  });

  // Sonda od formátu 6 posílá polohu krále; starší ji nemají vůbec.
  it("poloha krále: číslo, null (krále nemá), nebo chybí (starší sonda)", () => {
    const sKralem = (kral: unknown) => ({ ...telo(), hraci: telo().hraci.map((h, i) => (i === 0 ? { ...h, kral } : h)) });
    expect(prectiSnimek(sKralem({ x: 10.5, y: 200 })).hraci[0]!.kral).toEqual({ x: 10.5, y: 200 });
    expect(prectiSnimek(sKralem(null)).hraci[0]!.kral).toBeNull();
    expect("kral" in prectiSnimek(telo()).hraci[0]!).toBe(false);
    expect(() => prectiSnimek(sKralem({ x: "a", y: 1 }))).toThrow(/kral.x není číslo/);
  });

  it("odmítne jinou verzi, chybějícího odesílatele a špatné délky polí", () => {
    expect(() => prectiSnimek({ ...telo(), v: 2 })).toThrow(/neznámá verze/);
    expect(() => prectiSnimek({ ...telo(), odesilatel: "" })).toThrow(/chybí odesilatel/);
    expect(() => prectiSnimek({ ...telo(), promenne: [1, 2, 3] })).toThrow(/promenne má mít 256/);
    expect(() => prectiSnimek({ ...telo(), sloty: [1, 2] })).toThrow(/sloty má mít 8/);
    expect(() => prectiSnimek({ ...telo(), cas: "95" })).toThrow(/cas není celé číslo/);
    expect(() => prectiSnimek(null)).toThrow(/tělo chybí/);
  });
});

describe("výpis sondy", () => {
  it("přečte výstup kroku i JSON z databáze", () => {
    const cile = [{ promenna: 15, slot: 1, text: "zabito : {} /650 jednotek", limit: 650 }];
    // Záznam z doby před revizí sondy: revize chybí, varování žádná.
    expect(prectiSondu({ ok: true, soubor: "…", oznaceno: 42, cile })).toEqual({ cile, oznaceno: 42, chyba: null, revize: null, varovani: [] });
    expect(prectiSondu({ cile: [], oznaceno: 0, chyba: "ValueError: x" })).toEqual({ cile: [], oznaceno: 0, chyba: "ValueError: x", revize: null, varovani: [] });
    expect(prectiSondu({ cile, oznaceno: 41, revize: "abc123", varovani: ["nesedí"] })).toEqual({ cile, oznaceno: 41, chyba: null, revize: "abc123", varovani: ["nesedí"] });
  });

  it("do stavu pro prohlížeče jde jen souhrn — počet cílů místo výpisu", () => {
    expect(souhrnSondy({ cile: CILE, oznaceno: 42, chyba: null, revize: "r2", varovani: ["nesedí"] }, "r2")).toEqual({ cilu: 8, oznaceno: 42, chyba: null, zastarala: false, varovani: ["nesedí"] });
    expect(souhrnSondy({ cile: [], oznaceno: 0, chyba: "ValueError: x" }, "r2")).toEqual({ cilu: 0, oznaceno: 0, chyba: "ValueError: x", zastarala: false, varovani: [] });
  });

  // Kopie se starším kódem sondy (zapisuje soubor u každého hráče) chce přibalit znovu.
  it("sonda s jinou revizí, než má web, je zastaralá; bez revize taky", () => {
    expect(souhrnSondy({ cile: CILE, oznaceno: 42, chyba: null, revize: "r1" }, "r2").zastarala).toBe(true);
    expect(souhrnSondy({ cile: CILE, oznaceno: 42, chyba: null }, "r2").zastarala).toBe(true);
    // Web svou revizi nezná (soubor sondy chybí) — nic neoznačí.
    expect(souhrnSondy({ cile: CILE, oznaceno: 42, chyba: null, revize: "r1" }, null).zastarala).toBe(false);
  });

  it("nesmyslný tvar je chyba", () => {
    expect(() => prectiSondu({ cile: "x", oznaceno: 1 })).toThrow(/cile není seznam/);
    expect(() => prectiSondu({ cile: [{ promenna: "a", slot: 1, text: "", limit: 1 }], oznaceno: 1 })).toThrow(/cíl\.promenna/);
  });
});
