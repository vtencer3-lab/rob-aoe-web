import { jeAi } from "../aiHraci.js";
import type { Barva, SestavaVstup } from "../types.js";

/** Šedá — ve scénáři hráč 7 jménem „GM" (spec §2.1). */
export const GM_BARVA: Barva = 7;

/**
 * Pravidla sestavy Diplomacie navíc k jádru (spec §6.1 krok 2). Věta, nebo null.
 *
 * AI v sestavě se schválně nezakazuje (Rob chce mít možnost doplnit počítač
 * na zkoušku nebo při nedostatku lidí): AI dostane roli jako každý jiný hráč
 * a GM si ji přečte v pultu. Jen šedou musí držet člověk — pult GM nikdo
 * jiný neobslouží.
 */
export function zkontrolujSestavuDiplomacie(sestava: SestavaVstup[]): string | null {
  if (sestava.length !== 8) return "Diplomacie potřebuje 7 hráčů a GM — v sestavě musí být přesně 8 hráčů.";
  if (new Set(sestava.map((s) => s.barva)).size !== 8) return "Každý musí mít jinou barvu.";
  const gm = sestava.find((s) => s.barva === GM_BARVA);
  if (!gm) return "Na šedé musí být GM.";
  if (jeAi(gm.hracId)) return "Na šedé musí být GM, ne počítač.";
  if (sestava.some((s) => s.tym !== 0)) return "V Diplomacii hraje každý sám za sebe — všichni bez týmu (–).";
  if (sestava.some((s) => s.civ !== undefined && s.civ !== null)) return "Civilizace určuje scénář — nepředepisuj je.";
  return null;
}
