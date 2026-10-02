import { jeAi } from "./aiHraci.js";
import { BARVA_NAZEV, type Barva, type Tym, type Vitez } from "./types.js";

/** Minimum, které strany potřebují vědět o hráči; sedí na UcastnikView i Seat. */
export interface ClenStrany {
  hracId: string;
  tym: Tym;
  barva: Barva;
  poradi: number;
  alias?: string | null;
  platformaJmeno?: string | null;
}

/**
 * Strana zápasu: tým 1 až 4, nebo jeden hráč bez týmu („–“), který hraje sám
 * za sebe. Výsledek se zapisuje po stranách, ne po „týmu 1 a 2“ — od chvíle,
 * kdy si Rob skládá sestavu ručně, může být týmů kolik chce a nemusí být
 * žádný.
 */
export interface Strana {
  vitez: Vitez;
  clenove: ClenStrany[];
}

export function jmenoClena(c: ClenStrany): string {
  return c.alias ?? c.platformaJmeno ?? c.hracId;
}

/** Týmy vzestupně podle čísla, pak sólo hráči v pořadí slotů. */
export function strany<T extends ClenStrany>(ucastnici: T[]): Array<{ vitez: Vitez; clenove: T[] }> {
  const podleTymu = new Map<Tym, T[]>();
  const sami: T[] = [];
  for (const u of [...ucastnici].sort((a, b) => a.poradi - b.poradi)) {
    if (u.tym === 0) sami.push(u);
    else podleTymu.set(u.tym, [...(podleTymu.get(u.tym) ?? []), u]);
  }
  const tymy = [...podleTymu.entries()]
    .sort(([a], [b]) => a - b)
    .map(([tym, clenove]) => ({ vitez: { tym } as Vitez, clenove }));
  return [...tymy, ...sami.map((u) => ({ vitez: { hracId: u.hracId } as Vitez, clenove: [u] }))];
}

export function stejnyVitez(a: Vitez | null, b: Vitez | null): boolean {
  if (a === null || b === null) return a === b;
  if ("tym" in a) return "tym" in b && a.tym === b.tym;
  if ("hracId" in a) return "hracId" in b && a.hracId === b.hracId;
  // Seznam hráčů je množina: na pořadí zápisu nezáleží.
  if (!("hraci" in b)) return false;
  const mnozina = new Set(a.hraci);
  return mnozina.size === new Set(b.hraci).size && b.hraci.every((h) => mnozina.has(h));
}

/**
 * Jediné místo, které říká, jestli konkrétní hráč vyhrál: u týmu je v tom
 * týmu, u jednoho hráče je to on, u seznamu je v seznamu. Bez výsledku
 * nevyhrál nikdo.
 */
export function vyhralHrac(ucastnici: ClenStrany[], vitez: Vitez | null, hracId: string): boolean {
  if (vitez === null) return false;
  if ("hraci" in vitez) return vitez.hraci.includes(hracId);
  if ("hracId" in vitez) return vitez.hracId === hracId;
  const u = ucastnici.find((x) => x.hracId === hracId);
  return u !== undefined && u.tym === vitez.tym;
}

/** Ke které straně hráč patří; null, když v zápase nehraje. */
export function stranaHrace(ucastnici: ClenStrany[], hracId: string): Vitez | null {
  const u = ucastnici.find((x) => x.hracId === hracId);
  if (!u) return null;
  return u.tym === 0 ? { hracId } : { tym: u.tym };
}

/** Jméno ve větě a barva, která k němu patří; null, když jedna barva není (tým s víc barvami, neznámé id). */
export interface Jmenovany {
  jmeno: string;
  barva: Barva | null;
}

/**
 * Jak stranu pojmenovat: jeden hráč jménem, tým barvou, pokud ji sdílí celý
 * („modrý tým“), jinak číslem („tým 2“). Barvy ve hře vidí každý, čísla týmů
 * ne — proto barva první. S názvem jde i barva, pokud ji strana má jednu:
 * web ji kreslí jako čtvereček před jménem.
 */
function pojmenujStranu(strana: Strana): Jmenovany {
  const [prvni] = strana.clenove;
  if (!prvni) return { jmeno: "?", barva: null };
  if (strana.clenove.length === 1) return { jmeno: jmenoClena(prvni), barva: prvni.barva };
  const barvy = new Set(strana.clenove.map((c) => c.barva));
  if (barvy.size === 1) return { jmeno: `${PRIDAVNE[prvni.barva]} tým`, barva: prvni.barva };
  return { jmeno: "tym" in strana.vitez ? `tým ${strana.vitez.tym}` : jmenoClena(prvni), barva: null };
}

export function nazevStrany(strana: Strana): string {
  return pojmenujStranu(strana).jmeno;
}

const PRIDAVNE: Record<Barva, string> = {
  1: "modrý",
  2: "červený",
  3: "zelený",
  4: "žlutý",
  5: "tyrkysový",
  6: "fialový",
  7: "šedý",
  8: "oranžový",
};

/**
 * „Vyhrál Trokner“, „Vyhrála AI“, „Vyhrál modrý tým“, „Vyhrál tým 3“.
 *
 * AI je česky rodu ženského, takže sloveso se u ní ohýbá. Týká se to jen
 * strany o jednom členovi — tým zůstává mužský, i když jsou v něm samé AI.
 */
export function titulekViteze(strana: Strana): string {
  const [prvni] = strana.clenove;
  const zena = strana.clenove.length === 1 && prvni !== undefined && jeAi(prvni.hracId);
  return `${zena ? "Vyhrála" : "Vyhrál"} ${nazevStrany(strana)}`;
}

/** Věta o vítězi po částech: sloveso a jmenovaní s barvou, v pořadí, v jakém se čtou. */
export interface VetaOViteze {
  sloveso: string;
  jmenovani: Jmenovany[];
}

/**
 * Věta o vítězi rozložená na části — text z ní skládá `vitezVeVete`, web ke
 * jménům přidává čtvereček barvy. Jedno místo, ať se slovosled, rod slovesa
 * a pořadí jmen nerozejdou mezi textem a stránkou.
 */
export function vetaOViteze(ucastnici: ClenStrany[], vitez: Vitez): VetaOViteze {
  if ("hraci" in vitez) return vetaOVitezich(ucastnici, vitez.hraci);
  const strana = strany(ucastnici).find((s) => stejnyVitez(s.vitez, vitez));
  if (!strana) return { sloveso: "vyhrál", jmenovani: [{ jmeno: "tym" in vitez ? `tým ${vitez.tym}` : vitez.hracId, barva: null }] };
  const [prvni] = strana.clenove;
  // Stejné pravidlo rodu jako titulekViteze: ženský jen pro stranu o jedné AI.
  const zena = strana.clenove.length === 1 && prvni !== undefined && jeAi(prvni.hracId);
  return { sloveso: zena ? "vyhrála" : "vyhrál", jmenovani: [pojmenujStranu(strana)] };
}

/**
 * Jména v pořadí slotů, ne v pořadí zápisu. Kdo v sestavě není (nemělo by se
 * stát), zůstane jako ID, ať věta nikoho nezamlčí. Jeden hráč „vyhrál“ (AI
 * „vyhrála“ jako v titulekViteze), víc jich „vyhráli“.
 */
function vetaOVitezich(ucastnici: ClenStrany[], hraci: string[]): VetaOViteze {
  const podleSlotu = [...ucastnici].sort((a, b) => a.poradi - b.poradi).filter((u) => hraci.includes(u.hracId));
  const neznami = hraci.filter((h) => !podleSlotu.some((u) => u.hracId === h));
  const jmenovani: Jmenovany[] = [...podleSlotu.map((u) => ({ jmeno: jmenoClena(u), barva: u.barva })), ...neznami.map((id) => ({ jmeno: id, barva: null }))];
  if (jmenovani.length <= 1) {
    const [jediny] = hraci;
    return { sloveso: jediny !== undefined && jeAi(jediny) ? "vyhrála" : "vyhrál", jmenovani: jmenovani.length === 1 ? jmenovani : [{ jmeno: "?", barva: null }] };
  }
  return { sloveso: "vyhráli", jmenovani };
}

/** Oddělovač před i-tým jménem výčtu „X, Y a Z“; před prvním nic. */
export function spojkaVyctu(i: number, pocet: number): string {
  if (i === 0) return "";
  return i === pocet - 1 ? " a " : ", ";
}

/** Totéž do věty: „dohráno — vyhrál modrý tým“; u aliance „vyhráli X, Y a Z“. */
export function vitezVeVete(ucastnici: ClenStrany[], vitez: Vitez): string {
  const { sloveso, jmenovani } = vetaOViteze(ucastnici, vitez);
  return `${sloveso} ${jmenovani.map((j, i) => spojkaVyctu(i, jmenovani.length) + j.jmeno).join("")}`;
}

/** Hráči, kteří mají stejnou barvu jako daný hráč — ve hře sdílejí civilizaci (Coop Kings). */
export function sdiliCivilizaci<T extends ClenStrany>(ucastnici: T[], hracId: string): T[] {
  const ja = ucastnici.find((u) => u.hracId === hracId);
  if (!ja) return [];
  return ucastnici.filter((u) => u.hracId !== hracId && u.barva === ja.barva);
}

/**
 * Popis formátu ze sestavy: „1v1“, „2v2“, „2v2v2“, „1v1v1v1“; s dovětkem
 * „Coop Kings“, když někdo sdílí barvu. Dřív se formát vybíral z nabídky,
 * teď je to jen slovo pro to, co Rob naklikal.
 */
export function popisFormatu(ucastnici: ClenStrany[]): string {
  const velikosti = strany(ucastnici)
    .map((s) => s.clenove.length)
    .sort((a, b) => b - a);
  if (velikosti.length === 0) return "";
  const zaklad = velikosti.join("v");
  const barvy = ucastnici.map((u) => u.barva);
  const coop = new Set(barvy).size < barvy.length;
  return coop ? `${zaklad} · Coop Kings` : zaklad;
}

export { BARVA_NAZEV };
