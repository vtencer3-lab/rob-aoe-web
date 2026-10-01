import { GM_BARVA } from "../../../src/shared/diplomacie/sestava.js";
import type { RezimKlienta } from "../rezimy/index.js";
import { KartaRole } from "./KartaRole.js";
import { VerejnyRadek } from "./VerejnyRadek.js";

/** Diplomacie na obrazovkách jádra; pult GM přibude v úkolu 14. */
export const diplomacieKlient: RezimKlienta = {
  // Do úkolu 14 vidí kartu role i GM — pro něj jen „čeká se“; pult ji pak vystřídá.
  kartaHrace: ({ zapas, stav, ja }) => (stav.rezim && ja ? <KartaRole zapas={zapas} data={stav.rezim.data} ja={ja} /> : null),
  verejnyZapas: ({ zapas, stav }) => (stav.rezim ? <VerejnyRadek zapas={zapas} data={stav.rezim.data} /> : null),
  popisSlotu: (barva) => (barva === GM_BARVA ? "GM" : null),
  // Verze rozebrané před úkolem 22 podmínky vítězství nemají — pak null
  // a panel napíše „podle scénáře“.
  nastaveniScenare: (stav) => (stav.rezim?.id === "diplomacie" ? { vitezstvi: stav.rezim.data.aktivni?.rozbor?.vitezstvi?.popis ?? null } : null),
};
