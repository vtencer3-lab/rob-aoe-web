import { jeAi } from "../aiHraci.js";
import { zamichej, zJednotkove } from "../michani.js";
import { zamichejBarvy } from "../sestava.js";
import { BARVY, type Barva, type SestavaVstup } from "../types.js";

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

/**
 * Zamíchání barev v Diplomacii: kdo sedí na šedé (GM), zůstává na šedé —
 * šedý slot je ve scénáři hráč „GM“ a pult GM se podle něj přiděluje.
 * Ostatní si náhodně rozdělí barvy 1–8 bez šedé, každý jinou; při méně než
 * osmi hráčích tedy můžou dostat i barvu, kterou dosud nikdo neměl.
 * Sestava, která se bez šedé do sedmi barev nevejde (osm hráčů a nikdo na
 * šedé — pro Diplomacii stejně neplatná), se zamíchá jako v jádru, jen mezi
 * svými barvami.
 */
export function zamichejBarvyDiplomacie(sestava: SestavaVstup[], nahoda: () => number = Math.random): SestavaVstup[] {
  const volne = BARVY.filter((b) => b !== GM_BARVA);
  const ostatni = sestava.filter((s) => s.barva !== GM_BARVA);
  if (ostatni.length > volne.length) return zamichejBarvy(sestava, nahoda);
  let rozdane = zamichej(volne, zJednotkove(nahoda));
  // Stejné rozdání jako dosud by vypadalo, že tlačítko nic neudělalo:
  // posun o jednu barvu změní každého.
  if (ostatni.length > 0 && ostatni.every((s, i) => s.barva === rozdane[i])) rozdane = [...rozdane.slice(1), rozdane[0]!];
  let i = 0;
  return sestava.map((s) => (s.barva === GM_BARVA ? s : { ...s, barva: rozdane[i++]! }));
}
