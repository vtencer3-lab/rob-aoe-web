import type { Barva, SestavaVstup, Tym } from "../shared/types.js";

/**
 * Hotové sestavy pro testy, aby každý test nevypisoval týmy a barvy ručně.
 * Není to testovací soubor, aby ho šlo importovat z hermetických i
 * databázových testů.
 */

/** Každý sám za sebe v samostatném týmu: 1v1, 1v1v1, … (nejvýš 4). */
export function sestavaKazdyProtiKazdemu(hracIds: string[]): SestavaVstup[] {
  return hracIds.map((hracId, i) => ({
    hracId,
    tym: ((i % 4) + 1) as Tym,
    barva: ((i % 8) + 1) as Barva,
  }));
}

/** Dvojice se stejnou barvou i týmem proti druhé dvojici: Coop Kings 2v2. */
export function sestavaCoop(hracIds: string[]): SestavaVstup[] {
  return hracIds.map((hracId, i) => ({
    hracId,
    tym: (i < 2 ? 1 : 2) as Tym,
    barva: (i < 2 ? 1 : 2) as Barva,
  }));
}
