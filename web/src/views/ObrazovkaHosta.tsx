import { useState } from "react";
import { BARVA_NAZEV, type ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace } from "../zapas.js";

interface Props {
  zapas: ZapasView;
  ja: string;
  onVlozitOdkaz: (zapasId: number, odkaz: string) => void;
  onPotvrdit: (zapasId: number) => void;
}

export function ObrazovkaHosta({ zapas, ja, onVlozitOdkaz, onPotvrdit }: Props) {
  const [odkaz, setOdkaz] = useState("");
  const maLobby = zapas.lobbyId !== null;

  return (
    <section className="host">
      <header>Jsi host zápasu #{zapas.poradi}</header>

      <ol className="nastaveni">
        <li>
          Viditelnost <strong>Veřejná</strong> — jinak nejde zapnout diváky
        </li>
        <li>
          Zaškrtnout <strong>Allow Spectators</strong> — bez toho se Rob nedostane dovnitř
        </li>
        <li>
          Název lobby <strong>{zapas.nazevLobby}</strong>
        </li>
        <li>
          Heslo <strong>{zapas.heslo}</strong>
        </li>
        <li>Počet hráčů {zapas.ucastnici.length}</li>
      </ol>

      <label>
        Odkaz z tlačítka Copy v lobby
        <input value={odkaz} onChange={(e) => setOdkaz(e.target.value)} placeholder="aoe2de://0/…" />
      </label>
      <button onClick={() => onVlozitOdkaz(zapas.id, odkaz)}>Uložit odkaz</button>

      <h3>Takhle to má v lobby vypadat</h3>
      <ul className="zrcadlo">
        {zapas.ucastnici.map((u) => (
          <li key={u.steamId} data-testid="radek-lobby" className={`barva-${u.barva}`}>
            <span className="swatch" /> {jmenoHrace(u)} — {BARVA_NAZEV[u.barva]}, tým {u.tym}
            {u.steamId === ja ? " ← TY" : ""}
            {u.kliknulPripojit ? " · klikl na připojení" : ""}
          </li>
        ))}
      </ul>

      {zapas.hostPotvrdil ? (
        <p className="potvrzeno">Potvrzeno. Rob se může dívat.</p>
      ) : (
        <button disabled={!maLobby} onClick={() => onPotvrdit(zapas.id)}>
          Sedí to — jsme nachystaní
        </button>
      )}
    </section>
  );
}
