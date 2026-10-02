import { GM_BARVA } from "../../../src/shared/diplomacie/sestava.js";
import type { RezimKlienta } from "../rezimy/index.js";
import { diploZapasu, KartaRole, verzeZapasu } from "./KartaRole.js";
import { PultGm } from "./PultGm.js";
import { StazeniScenare } from "./StazeniScenare.js";
import { VerejnyRadek } from "./VerejnyRadek.js";

/** Diplomacie na obrazovkách jádra (spec §4.2): GM dostane pult, ostatní kartu role, host stažení scénáře. */
export const diplomacieKlient: RezimKlienta = {
  stitek: () => "Diplomacie",
  kartaHrace: ({ zapas, stav, ja, hlidej }) => {
    if (!stav.rezim || !ja) return null;
    const d = diploZapasu(stav.rezim.data, zapas.id);
    return d?.gmHracId === ja ? <PultGm zapas={zapas} data={stav.rezim.data} hlidej={hlidej} /> : <KartaRole zapas={zapas} data={stav.rezim.data} ja={ja} />;
  },
  // Verze, kterou zápas hraje (otisknutá při založení), ne nutně ta aktivní:
  // host musí mít v lobby přesně tu, ke které web počítá pravidla.
  krokHosta: ({ zapas, stav, ja }) => {
    if (!stav.rezim || !ja) return null;
    return <StazeniScenare verze={verzeZapasu(stav.rezim.data, diploZapasu(stav.rezim.data, zapas.id))} ja={ja} />;
  },
  verejnyZapas: ({ zapas, stav }) => (stav.rezim ? <VerejnyRadek zapas={zapas} data={stav.rezim.data} /> : null),
  popisSlotu: (barva) => (barva === GM_BARVA ? "GM" : null),
  // GM „svolává všechny“ (uživatel 2. 10. 2026): push-to-talk v chatu své
  // karty — jen dokud zápas běží, stejně jako háček na serveru.
  smiMluvitDoZapasu: ({ zapas, stav, ja }) => zapas.stav === "bezi" && Boolean(stav.rezim && ja) && diploZapasu(stav.rezim!.data, zapas.id)?.gmHracId === ja,
  // Verze rozebrané před úkolem 22 podmínky vítězství nemají — pak null
  // a panel napíše „podle scénáře“.
  nastaveniScenare: (stav) => (stav.rezim?.id === "diplomacie" ? { vitezstvi: stav.rezim.data.aktivni?.rozbor?.vitezstvi?.popis ?? null } : null),
};
