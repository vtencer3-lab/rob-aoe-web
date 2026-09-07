import { useState } from "react";
import { BARVA_NAZEV, type HledaniLobbyVysledek, type ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, mujUcastnik } from "../zapas.js";
import { HledaniLobby } from "./HledaniLobby.js";
import { Kopirovatelne } from "./Kopirovatelne.js";
/**
 * Výřez dialogu Create Lobby ze hry. Importuje se, aby mu Vite dal do jména
 * hash: se stálým jménem by prohlížeč po každé úpravě obrázku vytáhl z
 * mezipaměti ten starý a vypadalo by to, že se nasazení nepovedlo.
 */
import dialogUrl from "../assets/create-lobby.webp";

interface Props {
  zapas: ZapasView;
  ja: string;
  onVlozitOdkaz: (zapasId: number, odkaz: string) => Promise<unknown> | void;
  onHledatLobby: (zapasId: number) => Promise<HledaniLobbyVysledek>;
}

export function ObrazovkaHosta({ zapas, ja, onVlozitOdkaz, onHledatLobby }: Props) {
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

      <DialogCreateLobby zapas={zapas} />

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

/**
 * Zrcadlo dialogu Create Lobby: skutečný snímek dialogu ze hry, do kterého se
 * na místa tří polí posadí hodnoty z webu. Kreslit dialog v CSS znamenalo
 * pořád jen odhadovat barvy a rozestupy; takhle to sedí, protože to je ono.
 *
 * Přepisují se **jen tři pole**. Zbytek dialogu je na snímku nastavený tak,
 * jak má být — Public, zaškrtnuté Allow Spectators, Unranked, None, Default,
 * Definitive Set — takže se na něj nesahá.
 *
 * Souřadnice jsou v procentech výřezu (1400 × 1292 px), aby držely při každé
 * šířce. Vycházejí z pixelů změřených ve snímku: pole mají x 665–1164 a
 * řádky jdou po 80 px.
 *
 * Obrázek je dekorace s prázdným alt. Všechno zadání proto musí být i v textu
 * pod ním — kdyby se snímek nenačetl, nesmí s ním zmizet, co má host nastavit.
 */
function DialogCreateLobby({ zapas }: { zapas: ZapasView }) {
  const pocetHracu = String(zapas.ucastnici.length);

  return (
    <div className="dialog-lobby">
      <div className="dialog-snimek">
        <img
          className="dialog-obrazek"
          data-testid="obrazek-dialogu"
          src={dialogUrl}
          alt=""
          width={1400}
          height={1292}
        />

        {/* Tmavé pole se zeleným písmem — hodnotu přebíjíme celou, protože ve
            snímku v něm stojí jméno z toho večera, kdy vznikl. */}
        <span className="vsazeno vsazeno-vstup vsazeno-nazev" data-testid="pole-nazev-lobby">
          {zapas.nazevLobby}
        </span>

        {/* Rozbalovací seznam: přebíjí se jen část se jménem, šipka vpravo ve
            snímku zůstává vidět. */}
        <span className="vsazeno vsazeno-vyber vsazeno-players" data-testid="pole-players">
          {pocetHracu}
        </span>

        <span className="vsazeno vsazeno-vstup vsazeno-heslo" data-testid="pole-heslo">
          {zapas.heslo}
        </span>
      </div>

      {/* Klik na samotnou hodnotu ji zkopíruje — ikona vedle jen říká, že
          se dá kliknout. Toast vyskočí nad hodnotou, řádek se nehne. */}
      <div className="dialog-kopirovani">
        <span>
          Lobby Name <Kopirovatelne hodnota={zapas.nazevLobby} popis="název lobby" />
        </span>
        <span>
          Set Password <Kopirovatelne hodnota={zapas.heslo} popis="heslo" />
        </span>
      </div>

      <p className="dialog-legenda" data-testid="dialog-legenda">
        Nastav <strong>Lobby Name</strong> na <strong>{zapas.nazevLobby}</strong>,{" "}
        <strong>Players</strong> na <strong>{pocetHracu}</strong>,{" "}
        <strong>Set Password</strong> na <strong>{zapas.heslo}</strong>,{" "}
        <strong>Visibility</strong> na <strong>Public</strong> (u jiné volby nejde zapnout
        diváky) a zaškrtni <strong>Allow Spectators</strong> (bez toho se Rob dovnitř
        nedostane). Zbytek dialogu si nastav, jak chceš.{" "}
        <strong>
          Lobby Name, Visibility a Players po založení lobby už nezměníš
        </strong>{" "}
        — heslo a diváky ano.
      </p>
    </div>
  );
}
