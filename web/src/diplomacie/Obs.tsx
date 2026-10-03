import { useEffect, useState } from "react";
import type { DiploData, DiploZapas, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { json } from "../api.js";
import { cesta } from "../cesty.js";
import { verzeZapasu } from "./KartaRole.js";
import { MapaScenare } from "./MapaScenare.js";
import { mapaPultu, TabulkaRoli } from "./PultGm.js";

/** Odpověď `GET /api/diplo/obs` (server: src/diplomacie/obs.ts). */
interface ObsStav {
  zapas: ZapasView | null;
  data: DiploData | null;
}

/** Overlay se ptá každou sekundu — sonda píše stav každou herní sekundu. */
const INTERVAL_MS = 1000;

/**
 * Stav běžícího zápasu pro overlay: klíč z adresy (`?klic=`), dotaz každou
 * sekundu. Výpadek nebo špatný klíč nechá poslední známý stav (OBS nemá kde
 * ukázat chybu a prázdná scéna by na streamu blikla).
 */
function useObsStav(): { zapas: ZapasView; d: DiploZapas; verze: ScenarVerze | null } | null {
  const [stav, setStav] = useState<ObsStav | null>(null);
  useEffect(() => {
    const klic = new URLSearchParams(window.location.search).get("klic") ?? "";
    let zije = true;
    const nacti = () =>
      fetch(cesta(`/api/diplo/obs?klic=${encodeURIComponent(klic)}`))
        .then((r) => json<ObsStav>(r))
        .then((s) => {
          if (zije) setStav(s);
        })
        .catch(() => {});
    void nacti();
    const id = setInterval(() => void nacti(), INTERVAL_MS);
    return () => {
      zije = false;
      clearInterval(id);
    };
  }, []);
  const d = stav?.data?.zapasy[0];
  if (!stav?.zapas || !stav.data || !d) return null;
  return { zapas: stav.zapas, d, verze: verzeZapasu(stav.data, d, stav.zapas) };
}

/** Průhledné pozadí stránky: OBS browser source pak ukáže jen overlay. */
function useProhledne() {
  useEffect(() => {
    document.documentElement.classList.add("obs");
    return () => document.documentElement.classList.remove("obs");
  }, []);
}

/** Overlay „mapa“: mapa očima GM — jména, Nástupce s korunou, králové ze hry. */
export function ObsMapa() {
  useProhledne();
  const s = useObsStav();
  if (!s?.verze) return null;
  const { popisky, kralove, relikvie } = mapaPultu(s.zapas, s.d, s.verze);
  return (
    <main className="obs-overlay obs-mapa">
      <MapaScenare verze={s.verze} popisky={popisky} velikost="velka" kralove={kralove} relikvie={relikvie} />
    </main>
  );
}

/** Overlay „tabulka“: role, vztahy a postup cílů jako v pultu GM, jen ke čtení. */
export function ObsTabulka() {
  useProhledne();
  const s = useObsStav();
  if (!s || s.d.role.length === 0) return null;
  return (
    <main className="obs-overlay obs-tabulka">
      <TabulkaRoli zapas={s.zapas} d={s.d} upravy={null} />
    </main>
  );
}
