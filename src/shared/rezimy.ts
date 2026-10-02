import { zamichejBarvyDiplomacie, zkontrolujSestavuDiplomacie } from "./diplomacie/sestava.js";
import { zamichejBarvy, zkontrolujSestavu } from "./sestava.js";
import type { RezimId, SestavaVstup, Tym } from "./types.js";

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

/**
 * Tým, který dostane nově vybraný hráč podle módu akce. Klasicky se střídá
 * 1, 2, 1, 2 podle pořadí výběru (pro 1v1 sedí rovnou, u 2v2 stačí prohodit
 * jedno tlačítko). V Diplomacii hraje každý sám za sebe a kontrola sestavy
 * módu týmy zakazuje — bez „–“ by admin musel přepínat tým všem osmi, než by
 * „Vytvořit zápas“ svítilo.
 */
export function vychoziTymRezimu(rezim: RezimId, pocetVybranych: number): Tym {
  if (rezim === "diplomacie") return 0;
  return pocetVybranych % 2 === 0 ? 1 : 2;
}

/**
 * „Zamíchat barvy“ ve skládání sestavy podle módu akce: náhodně přeskupí
 * barvy mezi vybranými hráči a nic jiného (pořadí, týmy, civilizace) nemění.
 * Klasicky se míchají barvy, které sestava používá, a kdo barvu sdílel,
 * sdílí ji dál; v Diplomacii zůstává GM na šedé a ostatní si rozdělí zbylých
 * sedm barev. Sestava, která prošla `zkontrolujSestavuRezimu`, jím projde
 * i po zamíchání. `nahoda` má tvar `Math.random` (testy ji dodávají pevnou).
 */
export function zamichejBarvyRezimu(rezim: RezimId, sestava: SestavaVstup[], nahoda: () => number = Math.random): SestavaVstup[] {
  if (rezim === "diplomacie") return zamichejBarvyDiplomacie(sestava, nahoda);
  return zamichejBarvy(sestava, nahoda);
}
