import type { Barva, Tym, UcastnikView, ZapasView } from "../../src/shared/types.js";

/**
 * Jméno, které se hráči ukáže. Alias je herní přezdívka ze žebříčku Worlds
 * Edge, jenže ten ho vydá jen účtu s hodnocenou hrou — nováček a druhý účet
 * ho nemají. Bez druhého kroku by v sestavě zápasu svítilo syrové 64bitové
 * Steam ID, přestože soupiska hned vedle jméno zná ze Steamu.
 */
export function jmenoHrace(u: Pick<UcastnikView, "steamId" | "alias" | "steamName">): string {
  return u.alias ?? u.steamName ?? u.steamId;
}

export function mujUcastnik(zapas: ZapasView, steamId: string): UcastnikView | null {
  return zapas.ucastnici.find((u) => u.steamId === steamId) ?? null;
}

export function spoluhraci(zapas: ZapasView, steamId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, steamId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.tym === ja.tym && u.steamId !== steamId);
}

export function souperi(zapas: ZapasView, steamId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, steamId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.tym !== ja.tym);
}

export function mojeZapasy(zapasy: ZapasView[], steamId: string): ZapasView[] {
  return zapasy.filter(
    (z) =>
      z.stav !== "dohrano" && z.stav !== "zruseny" && z.ucastnici.some((u) => u.steamId === steamId),
  );
}

/**
 * Zápasy, které se divákovi ukážou jako řádek „kdo proti komu“ — všechno, co
 * pro něj není plná karta. Tedy cizí zápasy, a taky ty vlastní dohrané, které
 * z mojeZapasy() vypadnou; bez toho by hráči po zapsání výsledku zápas zmizel
 * z obrazovky beze stopy.
 */
export function verejneZapasy(zapasy: ZapasView[], steamId: string | null): ZapasView[] {
  const naKarte = new Set(steamId === null ? [] : mojeZapasy(zapasy, steamId).map((z) => z.id));
  return zapasy.filter((z) => z.stav !== "zruseny" && !naKarte.has(z.id));
}

export interface PopisViteze {
  /** „Vyhrál Trokner“ v 1v1, „Vyhrál modrý tým“ ve větším formátu. */
  titulek: string;
  /** Jména hráčů týmu; v 1v1 prázdné, jméno už je v titulku. */
  hraci: string[];
  barva: Barva;
}

/**
 * Tlačítko „Vyhrál tým 1“ nutilo Roba v přenosu přepočítávat, kdo je tým 1.
 * V 1v1 stačí jméno, ve větším formátu barva — tu hráči i diváci vidí ve hře.
 */
export function popisViteze(zapas: ZapasView, tym: Tym): PopisViteze {
  const clenove = zapas.ucastnici.filter((u) => u.tym === tym);
  const barva: Barva = clenove[0]?.barva ?? (tym as Barva);
  const jediny = clenove.length === 1 ? clenove[0] : undefined;
  if (jediny) return { titulek: `Vyhrál ${jmenoHrace(jediny)}`, hraci: [], barva };
  return {
    titulek: `Vyhrál ${barva === 1 ? "modrý" : "červený"} tým`,
    hraci: clenove.map(jmenoHrace),
    barva,
  };
}

/** Totéž do věty: „dohráno — vyhrál Trokner“. */
export function vitezVeVete(zapas: ZapasView, tym: Tym): string {
  const { titulek } = popisViteze(zapas, tym);
  return titulek.charAt(0).toLowerCase() + titulek.slice(1);
}
