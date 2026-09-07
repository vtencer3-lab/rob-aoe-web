import { CIVILIZACE } from "./civilizace.js";
import { strany } from "./strany.js";
import { BARVY, TYMY, type SestavaVstup } from "./types.js";

export const MIN_HRACU = 2;
export const MAX_HRACU = 8;

/**
 * Jediné místo, které říká, co je platná sestava. Používá ho backend při
 * zakládání zápasu i režie, aby tlačítko „Vytvořit zápas“ svítilo jen tehdy,
 * když to server přijme. Vrací českou větu s důvodem, nebo null.
 *
 * Coop Kings: dva hráči se stejnou barvou sdílejí ve hře civilizaci a musí
 * být v jednom týmu — jinak by spolu sdíleli civilizaci a hráli proti sobě,
 * což hra nedovolí. Víc než dva stejnou barvu mít nemůžou.
 */
export function zkontrolujSestavu(sestava: SestavaVstup[]): string | null {
  if (sestava.length < MIN_HRACU) return `Zápas potřebuje aspoň ${MIN_HRACU} hráče.`;
  if (sestava.length > MAX_HRACU) return `Do lobby se vejde nejvýš ${MAX_HRACU} hráčů.`;
  if (new Set(sestava.map((s) => s.steamId)).size !== sestava.length) {
    return "Stejný hráč nemůže být v zápase dvakrát.";
  }
  for (const s of sestava) {
    if (!BARVY.includes(s.barva)) return "Barva musí být 1 až 8.";
    if (!TYMY.includes(s.tym)) return "Tým musí být – nebo 1 až 4.";
    if (s.civ !== undefined && s.civ !== null && !(s.civ in CIVILIZACE)) return "Neznámá civilizace.";
  }

  const podleBarvy = new Map<number, SestavaVstup[]>();
  for (const s of sestava) podleBarvy.set(s.barva, [...(podleBarvy.get(s.barva) ?? []), s]);
  for (const [, stejni] of podleBarvy) {
    if (stejni.length > 2) return "Stejnou barvu můžou mít nejvýš dva hráči (Coop Kings).";
    if (stejni.length === 2) {
      const [a, b] = stejni as [SestavaVstup, SestavaVstup];
      if (a.tym === 0 || a.tym !== b.tym) {
        return "Hráči se stejnou barvou sdílejí civilizaci, musí být ve stejném týmu.";
      }
      if ((a.civ ?? null) !== (b.civ ?? null)) {
        return "Hráči se stejnou barvou sdílejí civilizaci, musí mít předepsanou tutéž.";
      }
    }
  }

  const pocetStran = strany(sestava.map((s, poradi) => ({ ...s, poradi }))).length;
  if (pocetStran < 2) return "Všichni jsou v jednom týmu — proti komu by hráli?";
  return null;
}
