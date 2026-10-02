import type { HraZapasu, KandidatNastupce } from "../shared/diplomacie/hra.js";

/**
 * Poslední snímek hry každého zápasu Diplomacie — jen v paměti: data jsou
 * pomíjivá a po restartu serveru je most do pár sekund pošle znovu. Vlastní
 * modul bez dalších závislostí schválně: čte ho `doplnStav` módu (rezim.ts)
 * a píše příjem dat (hra.ts), který rozesílá stav — společný modul by
 * uzavřel kruh importů rezim → hra → akceStav → rezimy → rezim.
 *
 * Co má přežít restart, tady není: koho hra určila naposledy, drží databáze
 * (`diplo_zapas.nastupce_ze_hry`), jinak by první snímek po restartu přepsal
 * ruční volbu GM.
 */
export interface PametHry {
  hra: HraZapasu;
  /**
   * Koho hra právě jmenuje a odkdy — potvrdí se až druhým snímkem
   * (`posunKandidata`). Po restartu serveru se sbírá znovu.
   */
  kandidat: KandidatNastupce | null;
  /** Kdy se stav s daty ze hry naposledy rozeslal prohlížečům. */
  rozeslanoMs: number;
}

export const pametHer = new Map<number, PametHry>();

export function hraZapasu(zapasId: number): HraZapasu | undefined {
  return pametHer.get(zapasId)?.hra;
}

/** Nechá jen snímky zápasů, které ještě běží; dohrané a zrušené zahodí. */
export function ponechHry(bezici: Iterable<number>): void {
  const zustavaji = new Set(bezici);
  for (const zapasId of pametHer.keys()) if (!zustavaji.has(zapasId)) pametHer.delete(zapasId);
}

/** Jen pro zkoušky: paměť je modulová a přežila by mezi testy. */
export function zapomenHry(): void {
  pametHer.clear();
}
