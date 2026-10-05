import { useEffect, useState } from "react";
import type { DiploData, DiploZapas, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { json } from "../api.js";
import { cesta } from "../cesty.js";
import { TeloKarty, verzeZapasu } from "./KartaRole.js";
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
function useObsStav(adresa = "/api/diplo/obs"): { zapas: ZapasView; d: DiploZapas; verze: ScenarVerze | null; data: DiploData } | null {
  const [stav, setStav] = useState<ObsStav | null>(null);
  useEffect(() => {
    // Parametry z adresy overlaye (`klic`, u karty i `hrac`) jdou dál na server beze změny.
    const dotaz = new URLSearchParams(window.location.search).toString();
    let zije = true;
    const nacti = () =>
      fetch(cesta(`${adresa}?${dotaz}`))
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
  return { zapas: stav.zapas, d, verze: verzeZapasu(stav.data, d, stav.zapas), data: stav.data };
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
  const { popisky, kralove, relikvie, pingy } = mapaPultu(s.zapas, s.d, s.verze);
  return (
    <main className="obs-overlay obs-mapa">
      <MapaScenare verze={s.verze} popisky={popisky} velikost="velka" kralove={kralove} relikvie={relikvie} pingy={pingy} />
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

/** Overlay neposílá nic: na kartě v OBS se nic neodklikává. */
const bezAkci = async () => {};

/**
 * Osobní overlay karty hráče pro streamery (uživatel 4. 10. 2026,
 * `…/obs/karta?hrac=…&klic=…`): jeho role, mapa a cíle přesně jako na
 * webu, bez zakrývání. Do rozeslání rolí prázdný (průhledný).
 */
export function ObsKarta() {
  useProhledne();
  const s = useObsStav("/api/diplo/obs/hrac");
  const hrac = new URLSearchParams(window.location.search).get("hrac");
  const moje = s?.d.stav === "rozeslano" ? s.d.role.find((r) => r.hracId === hrac) : undefined;
  if (!s || !moje) return null;
  return (
    <main className="obs-overlay obs-karta karta-role">
      <TeloKarty zapas={s.zapas} d={s.d} moje={moje} verze={s.verze} hlidej={bezAkci} />
    </main>
  );
}
