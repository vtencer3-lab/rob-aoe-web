import { useState } from "react";
import { BARVA_NAZEV, type ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, mujUcastnik } from "../zapas.js";
import { KopirovaciTlacitko } from "./KopirovaciTlacitko.js";

interface Props {
  zapas: ZapasView;
  ja: string;
  onVlozitOdkaz: (zapasId: number, odkaz: string) => Promise<unknown> | void;
}

export function ObrazovkaHosta({ zapas, ja, onVlozitOdkaz }: Props) {
  const [odkaz, setOdkaz] = useState("");
  // Chyba se drží tady, ne v App: host ji čte uprostřed streamu a nahoru na
  // začátek stránky se nedívá. Dvakrát skončilo tím, že odmítnutý odkaz nikdo
  // neviděl a host čekal, až se lidi připojí.
  const [chyba, setChyba] = useState<string | null>(null);

  async function uloz() {
    try {
      setChyba(null);
      await onVlozitOdkaz(zapas.id, odkaz);
    } catch (err) {
      setChyba(err instanceof Error ? err.message : "Odkaz se nepodařilo uložit.");
    }
  }

  // Host dostane tuhle obrazovku *místo* KartaHrace, ne k ní — svoji barvu by
  // jinak viděl jen jako řádek dole v zrcadle, zatímco každý druhý účastník má
  // pruh přes půl obrazovky. Přitom si ji v lobby musí nastavit stejně jako oni.
  const muj = mujUcastnik(zapas, ja);

  return (
    <section className={muj ? `host barva-${muj.barva}` : "host"}>
      <header>Jsi host zápasu #{zapas.poradi}</header>

      {muj ? (
        <div className="hero">
          <strong data-testid="moje-barva">{BARVA_NAZEV[muj.barva]}</strong>
          <span>
            tým <span data-testid="muj-tym">{muj.tym}</span>
          </span>
        </div>
      ) : null}

      <ol className="nastaveni">
        <li>
          Viditelnost <strong>Veřejná</strong> — jinak nejde zapnout diváky
        </li>
        <li>
          Zaškrtnout <strong>Allow Spectators</strong> — bez toho se Rob nedostane dovnitř
        </li>
        <li>
          Název lobby <strong>{zapas.nazevLobby}</strong>{" "}
          <KopirovaciTlacitko hodnota={zapas.nazevLobby} popis="název lobby" />
        </li>
        <li>
          Heslo <strong>{zapas.heslo}</strong>{" "}
          <KopirovaciTlacitko hodnota={zapas.heslo} popis="heslo" />
        </li>
        <li>Počet hráčů {zapas.ucastnici.length}</li>
      </ol>

      <label>
        Odkaz z tlačítka Copy v lobby
        <input value={odkaz} onChange={(e) => setOdkaz(e.target.value)} placeholder="aoe2de://0/…" />
      </label>
      <button onClick={() => void uloz()}>Uložit odkaz</button>
      {chyba ? (
        <p className="chyba chyba-pole" data-testid="chyba-odkazu" role="alert">
          {chyba}
        </p>
      ) : null}

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

    </section>
  );
}
