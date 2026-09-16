import type { UcastnikView, ZapasView } from "../../src/shared/types.js";

export { sdiliCivilizaci, popisFormatu, strany, titulekViteze, vitezVeVete } from "../../src/shared/strany.js";

/**
 * Jméno, které se hráči ukáže. Alias je herní přezdívka ze žebříčku Worlds
 * Edge, jenže ten ho vydá jen účtu s hodnocenou hrou — nováček a druhý účet
 * ho nemají. Bez druhého kroku by v sestavě zápasu svítilo syrové 64bitové
 * Steam ID, přestože soupiska hned vedle jméno zná ze Steamu.
 */
export function jmenoHrace(u: Pick<UcastnikView, "hracId" | "alias" | "steamName">): string {
  return u.alias ?? u.steamName ?? u.hracId;
}

export function mujUcastnik(zapas: ZapasView, hracId: string): UcastnikView | null {
  return zapas.ucastnici.find((u) => u.hracId === hracId) ?? null;
}

/** Spoluhráči = stejný tým 1 až 4. Hráč bez týmu („–“) žádné nemá. */
export function spoluhraci(zapas: ZapasView, hracId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, hracId);
  if (!ja || ja.tym === 0) return [];
  return zapas.ucastnici.filter((u) => u.tym === ja.tym && u.hracId !== hracId);
}

export function souperi(zapas: ZapasView, hracId: string): UcastnikView[] {
  const ja = mujUcastnik(zapas, hracId);
  if (!ja) return [];
  return zapas.ucastnici.filter((u) => u.hracId !== hracId && (ja.tym === 0 || u.tym !== ja.tym));
}

/** Zápas, který má večer ještě před sebou: ani dohraný, ani zrušený. */
export function jeVeHre(zapas: Pick<ZapasView, "stav">): boolean {
  return zapas.stav !== "dohrano" && zapas.stav !== "zruseny";
}

export function mojeZapasy(zapasy: ZapasView[], hracId: string): ZapasView[] {
  return zapasy.filter((z) => jeVeHre(z) && z.ucastnici.some((u) => u.hracId === hracId));
}

/**
 * Zápasy, které se divákovi ukážou jako řádek „kdo proti komu“ — všechno, co
 * pro něj není plná karta. Tedy cizí zápasy, a taky ty vlastní dohrané, které
 * z mojeZapasy() vypadnou; bez toho by hráči po zapsání výsledku zápas zmizel
 * z obrazovky beze stopy.
 */
export function verejneZapasy(zapasy: ZapasView[], hracId: string | null): ZapasView[] {
  const naKarte = new Set(hracId === null ? [] : mojeZapasy(zapasy, hracId).map((z) => z.id));
  return zapasy.filter((z) => z.stav !== "zruseny" && !z.zavreny && !naKarte.has(z.id));
}

/**
 * Vyhrál tenhle hráč? U dohraného zápasu buď vyhrál celý tým, nebo jeden
 * konkrétní hráč — podle toho, jak Rob výsledek zapsal.
 */
export function jeVitez(zapas: Pick<ZapasView, "vitez">, u: Pick<UcastnikView, "hracId" | "tym">): boolean {
  if (!zapas.vitez) return false;
  return "tym" in zapas.vitez ? u.tym === zapas.vitez.tym : u.hracId === zapas.vitez.hracId;
}

/** „tým 2“, nebo „bez týmu“ pro hráče, který hraje sám za sebe. */
export function popisTymu(u: Pick<UcastnikView, "tym">): string {
  return u.tym === 0 ? "bez týmu" : `tým ${u.tym}`;
}
