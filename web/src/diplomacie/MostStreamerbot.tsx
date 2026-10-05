import { useEffect, useState } from "react";
import type { Hlidej } from "../rezimy/index.js";
import { cesta } from "../cesty.js";
import { Skladaci } from "../views/Skladaci.js";
import { TEP_MOSTU_S } from "../../../src/shared/diplomacie/hra.js";
import { diploApi, type StavKliceMostu } from "./api.js";
import { importStreamerbotu } from "./streamerbot.js";

/** Kdy klíč vznikl a kdy jím naposledy přišla data — krátce česky. */
const kdy = (iso: string) => new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

/** Jméno staženého souboru — Streamer.bot ho vezme v okně Import (přetažením). */
export const SOUBOR_AKCE = "AoE-Diplomacie-most.txt";

/**
 * Osobní most ke hře přes Streamer.bot v pultu GM (uživatel 5. 10. 2026):
 * jedno tlačítko stáhne hotový import akce s novým osobním klíčem uvnitř,
 * GM ho jen naimportuje a Streamer.bot pak posílá soubor sondy rovnou na
 * web. Web drží jen otisk klíče; každé stažení vydá nový klíč a starý
 * zneplatní. Sbalené — nastavuje se jednou.
 */
/** Spojení je živé, když se akce ozvala do dvou tepů a kousku (výpadek jednoho tepu nevadí). */
const ZIVE_S = TEP_MOSTU_S * 2 + 5;
/** Jak často se pult ptá na stav spojení. */
const DOTAZ_MS = 10_000;

type Spojeni = "zive" | "ceka" | "mlci";

/** Stav spojení pro indikátor: zelená = akce se ozývá, šedá = ještě se neozvala, červená = zmlkla. */
export function spojeni(stav: StavKliceMostu): Spojeni {
  if (stav.predS === null) return "ceka";
  return stav.predS <= ZIVE_S ? "zive" : "mlci";
}

const POPIS_SPOJENI: Record<Spojeni, string> = {
  zive: "Spojení funguje",
  ceka: "Čeká na první spojení — naimportuj akci do Streamer.botu",
  mlci: "Streamer.bot se neozývá",
};

export function MostStreamerbot({ hlidej }: { hlidej: Hlidej }) {
  const [otevreno, setOtevreno] = useState(false);
  const [stav, setStav] = useState<StavKliceMostu | null | undefined>(undefined);
  const [stazeno, setStazeno] = useState(false);
  // Stav spojení se dotazuje pořád (i sbalené ukazuje tečku v hlavičce),
  // chyby dotazu jsou tiché — indikátor jen zůstane, jak byl.
  useEffect(() => {
    let platne = true;
    const nacti = () =>
      Promise.resolve()
        .then(() => diploApi.stavKliceMostu())
        .then((r) => platne && setStav(r.klic))
        .catch(() => {});
    void nacti();
    const casovac = setInterval(nacti, DOTAZ_MS);
    return () => {
      platne = false;
      clearInterval(casovac);
    };
  }, []);
  const url = `${window.location.origin}${cesta("/api/diplo/hra-soubor")}`;
  const stahni = () =>
    void hlidej(async () => {
      const { klic } = await diploApi.novyKlicMostu();
      const odkaz = document.createElement("a");
      odkaz.href = URL.createObjectURL(new Blob([await importStreamerbotu(url, klic)], { type: "text/plain" }));
      odkaz.download = SOUBOR_AKCE;
      odkaz.click();
      setTimeout(() => URL.revokeObjectURL(odkaz.href), 1000);
      setStazeno(true);
      setStav((await diploApi.stavKliceMostu()).klic);
    });
  const zrus = () =>
    void hlidej(async () => {
      await diploApi.zrusKlicMostu();
      setStazeno(false);
      setStav(null);
    });
  return (
    <Skladaci className="most-streamerbot" testId="most-streamerbot" hlava={
        <>
          Data ze hry přes Streamer.bot
          {stav ? (
            <span className={`kontrolka-mostu ${spojeni(stav)}`} data-testid="kontrolka-mostu" title={POPIS_SPOJENI[spojeni(stav)]}>
              <span className="tecka" aria-hidden="true" />
              {POPIS_SPOJENI[spojeni(stav)]}
            </span>
          ) : null}
        </>
      } otevreno={otevreno} onPrepnout={setOtevreno}>
      {otevreno ? (
        <div className="most-obsah">
          <p className="ceka">
            Tvůj Streamer.bot pošle data z běžící hry (krále, relikvie, cíle, Nástupce) rovnou sem. Web je přijme, jen když jsi GM běžícího zápasu Diplomacie.
          </p>
          {stav ? (
            <p data-testid="stav-klice">
              Akce stažena {kdy(stav.vytvoren)} · {stav.naposledy ? `naposledy se ozvala ${kdy(stav.naposledy)}` : "zatím se neozvala"}
            </p>
          ) : null}
          <p className="ceka">
            Ve Streamer.botu nahoře <strong>Import</strong> → přetáhni do okna stažený soubor → <strong>Import</strong>. Hotovo: akce „AoE Diplomacie — most“ běží sama a do půl minuty tu naskočí zelené „Spojení funguje“ (i bez hry). Soubor
            obsahuje tvůj osobní klíč — nikomu ho neposílej.
          </p>
          {stazeno && stav ? <p className="varovani">Staženo. Dřív stažená akce přestala platit — naimportuj tuhle.</p> : null}
          <p className="most-tlacitka">
            <button type="button" className="primarni" onClick={stahni} data-testid="stahnout-akci">
              Stáhnout akci do Streamer.bot
            </button>
            {stav ? (
              <button type="button" onClick={zrus}>
                Zrušit klíč
              </button>
            ) : null}
          </p>
        </div>
      ) : null}
    </Skladaci>
  );
}
