import { RELIKVII_K_VITEZSTVI, type HracHry } from "./hra.js";
import type { DiploZapas, Role, RoleHrace } from "./typy.js";

/**
 * Schopnosti rolí a připomínky pro GM (uživatel 3. 10. 2026). Hráč žádá
 * z karty, GM potvrzuje v pultu; připomínky zakládá server z dat hry.
 * Čisté funkce — pravidla sdílí server (kontrola žádosti) i karta
 * (co nabídnout).
 */

/** Co hráč žádá sám z karty. */
export type DruhZadosti = "sabotaz" | "informace" | "doplatek";
/**
 * Co hlásí hra GM bez žádosti: Popravčímu 2000 zlata za padlého, Gardě roli
 * padlého, Šaškovi prodej relikvií po smrti Nástupce (vidí ji i Šašek).
 */
export type DruhPripominky = "kat_odmena" | "garda_role" | "sasek_prodej" | "nastupce_prodej";
export type DruhSchopnosti = DruhZadosti | DruhPripominky;
export type StavSchopnosti = "ceka" | "potvrzeno" | "zamitnuto";

export interface Schopnost {
  id: number;
  /** Kdo žádá (u připomínky komu GM něco dluží: Popravčí). */
  hracId: string;
  druh: DruhSchopnosti;
  /** Cíl Sabotáže, u připomínky padlý hráč; jinak null. */
  cilHracId: string | null;
  /** U `nastupce_prodej` počitadlo prodejů ve chvíli smrti Šaška; jinak chybí. */
  poradi?: number;
  stav: StavSchopnosti;
  vytvoreno: string;
}

export const DRUHY_ZADOSTI: readonly DruhZadosti[] = ["sabotaz", "informace", "doplatek"];
export const jeZadost = (druh: DruhSchopnosti): druh is DruhZadosti => (DRUHY_ZADOSTI as readonly string[]).includes(druh);
/** Co z řádků vidí hráč, kterého se týkají: své žádosti a povinnost prodat relikvie. */
export const vidiHrac = (druh: DruhSchopnosti): boolean => jeZadost(druh) || druh === "sasek_prodej" || druh === "nastupce_prodej";

/** Kdo smí o schopnost žádat (podle role, kterou má teď — Šašek po proměně v Gardu už ne). */
export const ROLE_ZADOSTI: Record<DruhZadosti, Role> = { sabotaz: "najezdnik", informace: "sasek", doplatek: "zoldak" };

/**
 * Pravidla: Sabotáž 1× za hru, Šašek 3 informace. Omezení „na jednoho
 * hráče nejvýš jedna Sabotáž“ padlo 6. 10. 2026 — oba Nájezdníci smí
 * zasáhnout téhož hráče, každý svou.
 */
export const MAX_SABOTAZI = 1;
export const MAX_INFORMACI = 3;
/** Rozdíl, který GM doplácí Žoldákovi za prodanou relikvii (8000 místo 4000). */
export const DOPLATEK_ZLATA = 4000;
export const ODMENA_KATA = 2000;

/** Platí (čeká, nebo GM potvrdil) — zamítnutá žádost se nepočítá. */
const plati = (s: Schopnost) => s.stav !== "zamitnuto";

/** Kolik použití hráči zbývá (null = bez omezení). */
export function zbyva(schopnosti: readonly Schopnost[], hracId: string, druh: DruhZadosti): number | null {
  const max = druh === "sabotaz" ? MAX_SABOTAZI : druh === "informace" ? MAX_INFORMACI : null;
  if (max === null) return null;
  return Math.max(0, max - schopnosti.filter((s) => s.hracId === hracId && s.druh === druh && plati(s)).length);
}

/**
 * Proč hráč teď schopnost použít nemůže (česká věta pro 409 a kartu), nebo
 * null. `hraci` = hráči zápasu bez GM.
 */
export function procNelze(d: Pick<DiploZapas, "stav" | "role">, schopnosti: readonly Schopnost[], hraci: readonly string[], hracId: string, druh: DruhZadosti, cilHracId: string | null): string | null {
  if (d.stav !== "rozeslano") return "Schopnosti jdou použít až po rozeslání rolí.";
  const role = d.role.find((r) => r.hracId === hracId);
  if (!role || role.role !== ROLE_ZADOSTI[druh]) return "Tvoje role tuhle schopnost nemá.";
  if (schopnosti.some((s) => s.hracId === hracId && s.druh === druh && s.stav === "ceka")) return "Předchozí žádost ještě čeká na GM.";
  if (zbyva(schopnosti, hracId, druh) === 0) return druh === "sabotaz" ? "Sabotáž už jsi použil." : "Všechny tři informace už jsi vyčerpal.";
  if (druh === "sabotaz") {
    if (cilHracId === null || !hraci.includes(cilHracId) || cilHracId === hracId) return "Sabotáž míří na jiného hráče zápasu.";
  } else if (cilHracId !== null) return "Tahle schopnost cíl nemá.";
  return null;
}

/** Stav hráče ve hře, jak ho zná server (`HracHry.zije`). */
export interface ZivotHrace {
  hracId: string;
  zije: boolean | null;
  /** Relikvie v klášterech; 7+ = běží odpočet vítězství. Chybí = neznámo. */
  relikvie?: number | null;
  /** Počitadlo prodaných relikvií ze scénáře. */
  prodano?: number | null;
}

/** Připomínka, kterou zakládá hra (`poradi` jen u prodeje Nástupce). */
export interface NovaPripominka {
  druh: DruhPripominky;
  hracId: string;
  cilHracId: string;
  poradi?: number;
}

/**
 * Co z dat hry vyplývá pro role po rozeslání:
 * - **Šašek se stává Gardou** (pravidla: „Když zemře Královská Garda, tajně
 *   se stává novou Gardou a ztrácí výhody Šaška“), když původní Garda padla,
 *   Šašek žije a ještě se neproměnil.
 * - **Připomínka GM** za každého padlého: Popravčímu 2000 zlata (pokud Popravčí žije
 *   a nepadl on sám). Roli padlého Garda nedostává od GM, web jí ji ukáže
 *   sám (redakce, `odhaleneRole`; uživatel 3. 10. 2026).
 * - **Šašek prodává relikvie**, když padl Nástupce — jen když Šaškovi
 *   samotnému neběží odpočet (nemá 7+ relikvií); odpočet jiného hráče ho
 *   nechrání (uživatel 3. 10. 2026).
 * - **Nástupce prodává 1 relikvii**, když padl Šašek — zase jen bez
 *   vlastního odpočtu; `poradi` = kolik měl prodáno, splněno při dalším prodeji.
 */
export function udalostiHry(role: readonly RoleHrace[], hraci: readonly ZivotHrace[]): { povysit: string | null; pripominky: NovaPripominka[] } {
  const zije = (id: string) => hraci.find((h) => h.hracId === id)?.zije !== false;
  const padli = hraci.filter((h) => h.zije === false).map((h) => h.hracId);
  const garda = role.find((r) => r.role === "garda" && !r.puvodniRole);
  const uzPovysen = role.some((r) => r.puvodniRole === "sasek");
  const sasek = role.find((r) => r.role === "sasek");
  const povysit = garda && !zije(garda.hracId) && !uzPovysen && sasek && zije(sasek.hracId) ? sasek.hracId : null;
  const pripominky: NovaPripominka[] = [];
  for (const padly of padli) {
    for (const kat of role.filter((r) => r.role === "kat" && r.hracId !== padly && zije(r.hracId))) pripominky.push({ druh: "kat_odmena", hracId: kat.hracId, cilHracId: padly });
  }
  const nastupce = role.find((r) => r.role === "nastupce");
  if (nastupce && padli.includes(nastupce.hracId)) {
    for (const s of role.filter((r) => r.role === "sasek" && zije(r.hracId))) {
      const odpocet = (hraci.find((h) => h.hracId === s.hracId)?.relikvie ?? 0) >= RELIKVII_K_VITEZSTVI;
      if (!odpocet) pripominky.push({ druh: "sasek_prodej", hracId: s.hracId, cilHracId: nastupce.hracId });
    }
  }
  const padlySasek = role.find((r) => r.role === "sasek" && padli.includes(r.hracId));
  if (padlySasek && nastupce && zije(nastupce.hracId)) {
    const n = hraci.find((h) => h.hracId === nastupce.hracId);
    if ((n?.relikvie ?? 0) < RELIKVII_K_VITEZSTVI) pripominky.push({ druh: "nastupce_prodej", hracId: nastupce.hracId, cilHracId: padlySasek.hracId, poradi: n?.prodano ?? 0 });
  }
  return { povysit, pripominky };
}

/**
 * Čekající povinné prodeje, které hra už ukazuje jako splněné: Šašek nemá
 * žádnou relikvii, Nástupce prodal víc než ve chvíli smrti Šaška.
 */
export function splnenePripominky(schopnosti: readonly Schopnost[], hraci: readonly Pick<HracHry, "hracId" | "relikvie" | "prodano">[]): number[] {
  return schopnosti
    .filter((s) => {
      if (s.stav !== "ceka") return false;
      const h = hraci.find((x) => x.hracId === s.hracId);
      if (!h) return false;
      if (s.druh === "sasek_prodej") return h.relikvie === 0;
      if (s.druh === "nastupce_prodej") return h.prodano != null && h.prodano > (s.poradi ?? 0);
      return false;
    })
    .map((s) => s.id);
}
