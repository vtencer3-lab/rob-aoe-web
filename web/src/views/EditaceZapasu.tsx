import { useMemo, useRef, useState } from "react";
import { doplnNastaveni, type NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import type { PlayerView, SestavaVstup, ZapasView } from "../../../src/shared/types.js";
import { useSkladani } from "../skladani.js";
import { NastaveniLobby } from "./NastaveniLobby.js";
import { PreLobby } from "./PreLobby.js";
import { Skladani } from "./Skladani.js";

interface Props {
  zapas: ZapasView;
  /** Přihlášení do akce — z nich se skládá nová sestava. */
  prihlaseni: PlayerView[];
  onNastaveni: (nastaveni: Nastaveni) => Promise<unknown> | void;
  onNazev: (nazevLobby: string) => Promise<unknown> | void;
  onSestava: (sestava: SestavaVstup[]) => Promise<unknown> | void;
  onZavrit: () => void;
}

/**
 * Ozubené kolečko u zápasu: totéž, co při zakládání — vlevo sestava, vpravo
 * Game Settings, nahoře okno Pre-Lobby — jen nad jedním už založeným zápasem.
 * Nastavení se propisuje samo jako u akce (kontrola lobby ho hned hlídá,
 * hostovi se propíše do okna Create Lobby); sestava se ukládá tlačítkem,
 * protože rozpracovaná sestava smí být chvíli špatně a hotový zápas ne.
 */
export function EditaceZapasu({ zapas, prihlaseni, onNastaveni, onNazev, onSestava, onZavrit }: Props) {
  const [preLobbyVidet, setPreLobbyVidet] = useState(false);
  // Výchozí sestava ze zápasu; nová identita jen když se zápas na serveru
  // opravdu změní, jinak by hook zahodil rozpracované klikání.
  const klic = zapas.ucastnici.map((u) => `${u.steamId}:${u.tym}:${u.barva}:${u.civ ?? ""}`).join("|");
  const vychozi = useMemo<SestavaVstup[]>(
    () => zapas.ucastnici.map((u) => ({ steamId: u.steamId, tym: u.tym, barva: u.barva, civ: u.civ ?? null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zapas.id, klic],
  );
  // Rozpracovaná sestava zůstává v okně, na server jde až tlačítkem.
  const rozpracovana = useRef<SestavaVstup[]>(vychozi);
  const skladani = useSkladani(prihlaseni, {
    hodnota: vychozi,
    odesli: async (s) => {
      rozpracovana.current = s;
    },
  });
  const nastaveni = doplnNastaveni(zapas.nastaveni as Partial<Nastaveni>);

  return (
    <div
      className="prelobby-stin"
      data-testid="editace-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div className="prelobby-okno editace-zapasu" role="dialog" aria-modal="true" aria-label={`Úprava zápasu #${zapas.poradi}`} data-testid="editace-zapasu">
        <header className="hlavicka-akce">
          <h2>
            Zápas #{zapas.poradi} — {zapas.nazevLobby}
          </h2>
          <button type="button" className="prelobby-tlacitko" onClick={() => setPreLobbyVidet(true)}>
            Pre-Lobby Nastavení
          </button>
          <button type="button" className="zavrit" aria-label="Zavřít" onClick={onZavrit}>
            ✕
          </button>
        </header>
        {preLobbyVidet ? (
          <PreLobby
            nastaveni={nastaveni}
            nazevLobby={zapas.nazevLobby}
            heslo={zapas.heslo}
            onZmena={onNastaveni}
            onNazev={onNazev}
            onZavrit={() => setPreLobbyVidet(false)}
          />
        ) : null}
        <div className="lobby-rozlozeni">
          <div className="leva">
            <Skladani
              skladani={skladani}
              sadaCivilizaci={nastaveni.sadaCivilizaci}
              popisTlacitka="Uložit sestavu"
              bezVynulovani
              onVytvoritZapas={(sestava) => void onSestava(sestava)}
            />
          </div>
          <NastaveniLobby zive={zapas.nastaveni} ulozene={null} onZmena={onNastaveni} onUlozit={() => {}} />
        </div>
      </div>
    </div>
  );
}
