import { jeAi } from "../aiHraci.js";
import type { Barva, SestavaVstup } from "../types.js";

/** Šedá — ve scénáři hráč 7 jménem „GM" (spec §2.1). */
export const GM_BARVA: Barva = 7;

/** Pravidla sestavy Diplomacie navíc k jádru (spec §6.1 krok 2). Věta, nebo null. */
export function zkontrolujSestavuDiplomacie(sestava: SestavaVstup[]): string | null {
  if (sestava.some((s) => jeAi(s.hracId))) return "Diplomacie se hraje bez počítačů.";
  if (sestava.length !== 8) return "Diplomacie potřebuje 7 hráčů a GM — v sestavě musí být přesně 8 lidí.";
  if (new Set(sestava.map((s) => s.barva)).size !== 8) return "Každý musí mít jinou barvu.";
  if (!sestava.some((s) => s.barva === GM_BARVA)) return "Na šedé musí být GM.";
  if (sestava.some((s) => s.tym !== 0)) return "V Diplomacii hraje každý sám za sebe — všichni bez týmu (–).";
  if (sestava.some((s) => s.civ !== undefined && s.civ !== null)) return "Civilizace určuje scénář — nepředepisuj je.";
  return null;
}
