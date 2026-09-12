import { createPortal } from "react-dom";
import { useMemo, useState } from "react";
import { doplnNastaveni, type NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import { zkontrolujSestavu } from "../../../src/shared/sestava.js";
import type { PlayerView, SestavaVstup, ZapasView } from "../../../src/shared/types.js";
import { useSkladani } from "../skladani.js";
import { useZamekScrollu } from "../zamekScrollu.js";
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
 * Game Settings, vpravo nahoře okno Pre-Lobby — jen nad jedním už založeným
 * zápasem. Všechno se propisuje samo (uživatel: „nastavení by se mělo
 * OKAMŽITĚ PROPISOVAT“): nastavení jako u akce, sestava hned, jakmile je
 * platná — rozpracovaná sestava smí být chvíli špatně, taková zůstane jen
 * v okně. Reset nastavení tu není: přepsal by, co host už má ve hře.
 */
export function EditaceZapasu({ zapas, prihlaseni, onNastaveni, onNazev, onSestava, onZavrit }: Props) {
  const [preLobbyVidet, setPreLobbyVidet] = useState(false);
  useZamekScrollu();
  // Výchozí sestava ze zápasu; nová identita jen když se zápas na serveru
  // opravdu změní, jinak by hook zahodil rozpracované klikání.
  const klic = zapas.ucastnici.map((u) => `${u.steamId}:${u.tym}:${u.barva}:${u.civ ?? ""}`).join("|");
  const vychozi = useMemo<SestavaVstup[]>(
    () => zapas.ucastnici.map((u) => ({ steamId: u.steamId, tym: u.tym, barva: u.barva, civ: u.civ ?? null })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [zapas.id, klic],
  );
  const skladani = useSkladani(prihlaseni, {
    hodnota: vychozi,
    odesli: async (s) => {
      if (zkontrolujSestavu(s) === null) await onSestava(s);
    },
  });
  const nastaveni = doplnNastaveni(zapas.nastaveni as Partial<Nastaveni>);

  return createPortal(
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
            <Skladani skladani={skladani} sadaCivilizaci={nastaveni.sadaCivilizaci} bezTlacitka onVytvoritZapas={() => {}} />
          </div>
          {/* Tlačítko Pre-Lobby sedí nad pravým sloupcem v prostoru hlavičky,
              ať okno nenaroste na výšku (přání uživatele). */}
          <div className="prava">
            <button type="button" className="prelobby-tlacitko" onClick={() => setPreLobbyVidet(true)}>
              Pre-Lobby Nastavení
            </button>
            <NastaveniLobby zive={zapas.nastaveni} ulozene={null} onZmena={onNastaveni} onUlozit={() => {}} bezResetu />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
