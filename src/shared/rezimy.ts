import { zkontrolujSestavuDiplomacie } from "./diplomacie/sestava.js";
import { zkontrolujSestavu } from "./sestava.js";
import type { RezimId, SestavaVstup } from "./types.js";

/**
 * Pravidla sestavy podle módu akce: nejdřív jádro (to platí vždy), pak mód.
 * Synchronní a sdílené — volá je server při zakládání i úpravě zápasu a
 * frontend (Skladani.tsx), aby „Vytvořit zápas“ svítilo jen pro sestavu,
 * kterou server přijme (spec §4.1 H5).
 */
export function zkontrolujSestavuRezimu(rezim: RezimId, sestava: SestavaVstup[]): string | null {
  const jadro = zkontrolujSestavu(sestava);
  if (jadro) return jadro;
  if (rezim === "diplomacie") return zkontrolujSestavuDiplomacie(sestava);
  return null;
}
