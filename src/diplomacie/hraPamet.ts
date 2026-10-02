import type { HraZapasu } from "../shared/diplomacie/hra.js";

/**
 * Poslední snímek hry každého zápasu Diplomacie — jen v paměti: data jsou
 * pomíjivá a po restartu serveru je most do pár sekund pošle znovu. Vlastní
 * modul bez dalších závislostí schválně: čte ho `doplnStav` módu (rezim.ts)
 * a píše příjem dat (hra.ts), který rozesílá stav — společný modul by
 * uzavřel kruh importů rezim → hra → akceStav → rezimy → rezim.
 */
export interface PametHry {
  hra: HraZapasu;
  /** Koho hra určila naposledy a server ho nastavil — aby ruční volbu GM nepřepisovala dokola. */
  nastupceZeHry: string | null;
  /** Kdy se stav s daty ze hry naposledy rozeslal prohlížečům. */
  rozeslanoMs: number;
}

export const pametHer = new Map<number, PametHry>();

export function hraZapasu(zapasId: number): HraZapasu | undefined {
  return pametHer.get(zapasId)?.hra;
}

/** Jen pro zkoušky: paměť je modulová a přežila by mezi testy. */
export function zapomenHry(): void {
  pametHer.clear();
}
