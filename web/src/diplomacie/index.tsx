import { GM_BARVA } from "../../../src/shared/diplomacie/sestava.js";
import type { RezimKlienta } from "../rezimy/index.js";

/** Diplomacie na obrazovkách jádra; komponenty přibývají v úkolech 12–15. */
export const diplomacieKlient: RezimKlienta = {
  popisSlotu: (barva) => (barva === GM_BARVA ? "GM" : null),
  // Verze rozebrané před úkolem 22 podmínky vítězství nemají — pak null
  // a panel napíše „podle scénáře“.
  nastaveniScenare: (stav) => (stav.rezim?.id === "diplomacie" ? { vitezstvi: stav.rezim.data.aktivni?.rozbor?.vitezstvi?.popis ?? null } : null),
};
