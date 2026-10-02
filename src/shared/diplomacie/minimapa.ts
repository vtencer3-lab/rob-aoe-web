import type { RozborScenare } from "./scenar.js";

/**
 * Jak daleko (v souřadnicích minimapy 0–1) smí start nové verze ležet od
 * startu verze s vlastní minimapou, aby šlo o tutéž mapu. Vlastní minimapa
 * má `rozbor.starty` přepsané středy kosočtverců z obrázku, ne pozicemi
 * z rozboru — u LLC se lišily nejvýš o 0,03 na ose, proto rezerva 0,05.
 */
export const TOLERANCE_STARTU = 0.05;

type Mapa = Pick<RozborScenare, "velikostMapy" | "starty">;

/**
 * Smí nová verze převzít vlastní minimapu (obrázek ze hry) od verze `zdroj`?
 * Ano, jen když jde zjevně o tutéž mapu: stejná velikost, stejné barvy startů
 * a každý start nejvýš `TOLERANCE_STARTU` od startu téže barvy ve zdroji.
 * Vrací null = smí, jinak českou větu proč ne (jde i do odpovědi 409).
 */
export function procNelzePrevzitMinimapu(zdroj: Mapa, nova: Mapa): string | null {
  if (zdroj.velikostMapy !== nova.velikostMapy) return `Mapa má jinou velikost (${nova.velikostMapy} místo ${zdroj.velikostMapy}).`;
  const barvy = (m: Mapa) => [...new Set(m.starty.map((s) => s.barva))].sort((a, b) => a - b).join(",");
  if (barvy(zdroj) !== barvy(nova)) return "Mapa má jiné barvy startů.";
  for (const s of nova.starty) {
    const nejblizsi = Math.min(...zdroj.starty.filter((z) => z.barva === s.barva).map((z) => Math.hypot(z.x - s.x, z.y - s.y)));
    if (nejblizsi > TOLERANCE_STARTU) return `Start barvy ${s.barva} je jinde než na vlastní minimapě.`;
  }
  return null;
}
