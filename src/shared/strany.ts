import { BARVA_NAZEV, type Barva, type Tym, type Vitez } from "./types.js";

/** Minimum, které strany potřebují vědět o hráči; sedí na UcastnikView i Seat. */
export interface ClenStrany {
  steamId: string;
  tym: Tym;
  barva: Barva;
  poradi: number;
  alias?: string | null;
  steamName?: string | null;
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
  return c.alias ?? c.steamName ?? c.steamId;
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
  return [...tymy, ...sami.map((u) => ({ vitez: { steamId: u.steamId } as Vitez, clenove: [u] }))];
}

export function stejnyVitez(a: Vitez | null, b: Vitez | null): boolean {
  if (a === null || b === null) return a === b;
  if ("tym" in a) return "tym" in b && a.tym === b.tym;
  return "steamId" in b && a.steamId === b.steamId;
}

/** Ke které straně hráč patří; null, když v zápase nehraje. */
export function stranaHrace(ucastnici: ClenStrany[], steamId: string): Vitez | null {
  const u = ucastnici.find((x) => x.steamId === steamId);
  if (!u) return null;
  return u.tym === 0 ? { steamId } : { tym: u.tym };
}

/**
 * Jak stranu pojmenovat: jeden hráč jménem, tým barvou, pokud ji sdílí celý
 * („modrý tým“), jinak číslem („tým 2“). Barvy ve hře vidí každý, čísla týmů
 * ne — proto barva první.
 */
export function nazevStrany(strana: Strana): string {
  const [prvni] = strana.clenove;
  if (!prvni) return "?";
  if (strana.clenove.length === 1) return jmenoClena(prvni);
  const barvy = new Set(strana.clenove.map((c) => c.barva));
  if (barvy.size === 1) return `${PRIDAVNE[prvni.barva]} tým`;
  return "tym" in strana.vitez ? `tým ${strana.vitez.tym}` : jmenoClena(prvni);
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

/** „Vyhrál Trokner“, „Vyhrál modrý tým“, „Vyhrál tým 3“. */
export function titulekViteze(strana: Strana): string {
  return `Vyhrál ${nazevStrany(strana)}`;
}

/** Totéž do věty: „dohráno — vyhrál modrý tým“. */
export function vitezVeVete(ucastnici: ClenStrany[], vitez: Vitez): string {
  const strana = strany(ucastnici).find((s) => stejnyVitez(s.vitez, vitez));
  if (!strana) return "vyhrál " + ("tym" in vitez ? `tým ${vitez.tym}` : vitez.steamId);
  const titulek = titulekViteze(strana);
  return titulek.charAt(0).toLowerCase() + titulek.slice(1);
}

/** Hráči, kteří mají stejnou barvu jako daný hráč — ve hře sdílejí civilizaci (Coop Kings). */
export function sdiliCivilizaci<T extends ClenStrany>(ucastnici: T[], steamId: string): T[] {
  const ja = ucastnici.find((u) => u.steamId === steamId);
  if (!ja) return [];
  return ucastnici.filter((u) => u.steamId !== steamId && u.barva === ja.barva);
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
