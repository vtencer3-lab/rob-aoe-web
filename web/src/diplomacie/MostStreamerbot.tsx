import { useEffect, useState } from "react";
import type { Hlidej } from "../rezimy/index.js";
import { cesta } from "../cesty.js";
import { Kopirovatelne } from "../views/Kopirovatelne.js";
import { Skladaci } from "../views/Skladaci.js";
import { diploApi } from "./api.js";
import { akceStreamerbotu } from "./streamerbot.js";

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
  const [novy, setNovy] = useState<string | null>(null);
  useEffect(() => {
    if (otevreno && stav === undefined) void hlidej(async () => setStav((await diploApi.stavKliceMostu()).klic));
  }, [otevreno]);
  const url = `${window.location.origin}${cesta("/api/diplo/hra-soubor")}`;
  const vytvor = () =>
    void hlidej(async () => {
      const { klic } = await diploApi.novyKlicMostu();
      setNovy(klic);
      setStav((await diploApi.stavKliceMostu()).klic);
    });
  const zrus = () =>
    void hlidej(async () => {
      await diploApi.zrusKlicMostu();
      setNovy(null);
      setStav(null);
    });
  const stahni = () => {
    if (!novy) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([akceStreamerbotu(url, novy)], { type: "text/plain;charset=utf-8" }));
    a.download = "aoe-diplomacie-streamerbot.cs";
    a.click();
    URL.revokeObjectURL(a.href);
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
          {novy ? (
            <>
              <p className="varovani">Klíč se ukazuje jen teď. Stáhni si akci (klíč je v ní) a nikomu ho neposílej.</p>
              <Kopirovatelne hodnota={novy} popis="klíč mostu" testId="novy-klic" />
              <p>
                <button type="button" className="primarni" onClick={stahni}>
                  Stáhnout akci pro Streamer.bot
                </button>
              </p>
              <ol className="postup-streamerbot">
                <li>Streamer.bot → Actions → pravým tlačítkem Add → pojmenuj třeba „AoE Diplomacie“.</li>
                <li>Do akce přidej sub-akci Core → C# → Execute C# Code, vlož celý stažený soubor, Compile a Save.</li>
                <li>Settings → Timed Actions → Add, interval 1 s, Enabled; pak ho akci přiřaď jako trigger (Core → Timed Actions).</li>
                <li>Za hry se tu nahoře v pultu objeví „ze hry (GM) před … s“. Chyby píše Streamer.bot do svého logu.</li>
              </ol>
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
