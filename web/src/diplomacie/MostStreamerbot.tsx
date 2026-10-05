import { useEffect, useState } from "react";
import type { Hlidej } from "../rezimy/index.js";
import { cesta } from "../cesty.js";
import { Skladaci } from "../views/Skladaci.js";
import { diploApi } from "./api.js";
import { importStreamerbotu } from "./streamerbot.js";

/** Kdy klíč vznikl a kdy jím naposledy přišla data — krátce česky. */
const kdy = (iso: string) => new Date(iso).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

/**
 * Osobní most ke hře přes Streamer.bot v pultu GM (uživatel 5. 10. 2026):
 * GM si vygeneruje klíč a stáhne akci, která jeho Streamer.botem posílá
 * soubor sondy rovnou na web. Klíč se ukáže jen jednou (web drží otisk);
 * nový klíč starý zneplatní. Sbalené — nastavuje se jednou.
 */
export function MostStreamerbot({ hlidej }: { hlidej: Hlidej }) {
  const [otevreno, setOtevreno] = useState(false);
  const [stav, setStav] = useState<{ vytvoren: string; naposledy: string | null } | null | undefined>(undefined);
  // Import pro Streamer.bot s právě vytvořeným klíčem — klíč se ukáže jen teď.
  const [importText, setImportText] = useState<string | null>(null);
  const [zkopirovano, setZkopirovano] = useState(false);
  useEffect(() => {
    if (otevreno && stav === undefined) void hlidej(async () => setStav((await diploApi.stavKliceMostu()).klic));
  }, [otevreno]);
  const url = `${window.location.origin}${cesta("/api/diplo/hra-soubor")}`;
  const vytvor = () =>
    void hlidej(async () => {
      const { klic } = await diploApi.novyKlicMostu();
      setImportText(await importStreamerbotu(url, klic));
      setZkopirovano(false);
      setStav((await diploApi.stavKliceMostu()).klic);
    });
  const zrus = () =>
    void hlidej(async () => {
      await diploApi.zrusKlicMostu();
      setImportText(null);
      setStav(null);
    });
  const kopiruj = () => {
    if (!importText) return;
    void navigator.clipboard?.writeText(importText).then(() => setZkopirovano(true));
  };
  return (
    <Skladaci className="most-streamerbot" testId="most-streamerbot" hlava="Data ze hry přes Streamer.bot" otevreno={otevreno} onPrepnout={setOtevreno}>
      {otevreno ? (
        <div className="most-obsah">
          <p className="ceka">
            Tvůj Streamer.bot pošle data z běžící hry (krále, relikvie, cíle, Nástupce) rovnou sem. Web je přijme, jen když jsi GM běžícího zápasu Diplomacie.
          </p>
          {stav === undefined ? null : stav ? (
            <p data-testid="stav-klice">
              Klíč vytvořen {kdy(stav.vytvoren)} · {stav.naposledy ? `data naposledy ${kdy(stav.naposledy)}` : "zatím žádná data"}
            </p>
          ) : (
            <p data-testid="stav-klice">Klíč zatím nemáš.</p>
          )}
          {importText ? (
            <>
              <p className="varovani">Import obsahuje tvůj osobní klíč a ukazuje se jen teď — nikomu ho neposílej.</p>
              <textarea className="import-streamerbot" readOnly value={importText} rows={3} onFocus={(e) => e.currentTarget.select()} data-testid="import-streamerbot" />
              <p>
                <button type="button" className="primarni" onClick={kopiruj}>
                  {zkopirovano ? "Zkopírováno" : "Kopírovat import"}
                </button>
              </p>
              <p className="ceka">
                Ve Streamer.botu nahoře <strong>Import</strong> → vlož → <strong>Import</strong>. Hotovo: akce „AoE Diplomacie — most“ běží sama každou sekundu a za hry se tu nahoře objeví „ze hry (GM) před … s“.
              </p>
            </>
          ) : null}
          <p className="most-tlacitka">
            <button type="button" onClick={vytvor}>
              {stav ? "Vytvořit nový klíč (starý přestane platit)" : "Vytvořit klíč"}
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
