import { GM_BARVA } from "../../../src/shared/diplomacie/sestava.js";
import type { RezimKlienta } from "../rezimy/index.js";
import { diploZapasu, KartaRole, verzeZapasu } from "./KartaRole.js";
import { ObsKarta, ObsMapa, ObsTabulka } from "./Obs.js";
import { NahledHracu } from "./NahledHracu.js";
import { PravidlaAkce } from "./PravidlaAkce.js";
import { SpravaScenare } from "./SpravaScenare.js";
import { PultGm } from "./PultGm.js";
import { StazeniScenare } from "./StazeniScenare.js";
import { VerejnyRadek } from "./VerejnyRadek.js";
import { VyberScenare } from "./VyberScenare.js";

/** Diplomacie na obrazovkách jádra (spec §4.2): GM dostane pult, ostatní kartu role, host stažení scénáře. */
export const diplomacieKlient: RezimKlienta = {
  stitek: () => "Diplomacie",
  // Overlaye do OBS (uživatel 3. 10. 2026): `…/obs/mapa?klic=…`, `…/obs/tabulka?klic=…`.
  stranky: { "/obs/mapa": () => <ObsMapa />, "/obs/tabulka": () => <ObsTabulka />, "/obs/karta": () => <ObsKarta /> },
  kartaHrace: ({ zapas, stav, ja, hlidej, onUpravitZapas }) => {
    if (!stav.rezim || !ja) return null;
    const d = diploZapasu(stav.rezim.data, zapas.id);
    return d?.gmHracId === ja ? <PultGm zapas={zapas} data={stav.rezim.data} hlidej={hlidej} onUpravit={onUpravitZapas} /> : <KartaRole zapas={zapas} data={stav.rezim.data} ja={ja} hlidej={hlidej} />;
  },
  // Verze, kterou zápas hraje (otisknutá při založení), ne nutně ta aktivní:
  // host musí mít v lobby přesně tu, ke které web počítá pravidla.
  krokHosta: ({ zapas, stav, ja }) => {
    if (!stav.rezim || !ja) return null;
    return <StazeniScenare verze={verzeZapasu(stav.rezim.data, diploZapasu(stav.rezim.data, zapas.id), zapas)} ja={ja} />;
  },
  verejnyZapas: ({ zapas, stav }) => (stav.rezim ? <VerejnyRadek zapas={zapas} data={stav.rezim.data} /> : null),
  popisSlotu: (barva) => (barva === GM_BARVA ? "GM" : null),
  nahledZapasu: ({ zapas, stav }) => (stav.rezim?.id === "diplomacie" ? <NahledHracu zapas={zapas} data={stav.rezim.data} /> : null),
  // Správa scénáře: admin, autor (server přes /api/me) a GM běžícího zápasu
  // Diplomacie (uživatel 5. 10. 2026) — GM se pozná i tady, protože /api/me
  // se načítá jen při přihlášení a GM se člověk stane až sestavou.
  sprava: ({ stav, ja, smiSpravovat, hlidej }) => {
    const jsemGm = stav?.rezim?.id === "diplomacie" && stav.rezim.data.zapasy.some((d) => d.gmHracId === ja && stav.zapasy.some((z) => z.id === d.zapasId && z.stav === "bezi"));
    return smiSpravovat || jsemGm ? <SpravaScenare hlidej={hlidej} /> : null;
  },
  sekceAkce: (stav) => (stav.rezim?.id === "diplomacie" ? <PravidlaAkce data={stav.rezim.data} /> : null),
  // GM „svolává všechny“ (uživatel 2. 10. 2026): push-to-talk v chatu své
  // karty — jen dokud zápas běží, stejně jako háček na serveru.
  // GM upravuje svůj zápas (uživatel 5. 10. 2026) — za stejných podmínek jako mluví.
  smiUpravitZapas: (p) => diplomacieKlient.smiMluvitDoZapasu!(p),
  smiMluvitDoZapasu: ({ zapas, stav, ja }) => zapas.stav === "bezi" && Boolean(stav.rezim && ja) && diploZapasu(stav.rezim!.data, zapas.id)?.gmHracId === ja,
  // Verze rozebrané před úkolem 22 podmínky vítězství nemají — pak null
  // a panel napíše „podle scénáře“.
  // V úpravě zápasu verze, kterou ten zápas hraje, jinak aktivní.
  nastaveniScenare: (stav, zapas) => {
    if (stav.rezim?.id !== "diplomacie") return null;
    const data = stav.rezim.data;
    const verze = zapas ? (data.verze[diploZapasu(data, zapas.id)?.scenarId ?? -1] ?? data.aktivni) : data.aktivni;
    return { vitezstvi: verze?.rozbor?.vitezstvi?.popis ?? null };
  },
  vyberScenare: ({ zapas, stav, hlidej, onVybrano }) => {
    const d = stav.rezim?.id === "diplomacie" ? diploZapasu(stav.rezim.data, zapas.id) : undefined;
    return d ? <VyberScenare zapas={zapas} diplo={d} hlidej={hlidej} onVybrano={onVybrano} /> : null;
  },
};
