import { useState } from "react";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { BARVA_NAZEV, type HledaniLobbyVysledek, type ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, mujUcastnik, popisTymu } from "../zapas.js";
import { HledaniLobby } from "./HledaniLobby.js";
import { KontrolaLobby } from "./KontrolaLobby.js";
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
  onKontrolaLobby: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
}

export function ObrazovkaHosta({ zapas, ja, onVlozitOdkaz, onHledatLobby, onKontrolaLobby }: Props) {
  const [odkaz, setOdkaz] = useState("");
  // Po kliknutí na „Spustit hru“ host lobby zakládá právě teď: hledání zrychlí
  // ze 4 s na 2 s, ať hráči dostanou odkaz, sotva lobby vznikne.
  const [hraSpustena, setHraSpustena] = useState(false);
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
            <span data-testid="muj-tym">{popisTymu(muj)}</span>
          </span>
        </div>
      ) : null}

      {/* Host si hru pouští odtud: steam://run ji nastartuje (nebo vytáhne do
          popředí), a jakmile web zná číslo lobby, druhý odkaz ho do ní vrátí,
          kdyby z ní vypadl. */}
      <div className="ovladani hostovi">
        <a className="cta" href="steam://run/813780" data-testid="spustit-hru" onClick={() => setHraSpustena(true)}>
          Spustit hru
        </a>
        {zapas.joinUri ? (
          <a className="cta" href={zapas.joinUri} data-testid="do-lobby">
            Připojit se do lobby
          </a>
        ) : null}
      </div>
      <DialogCreateLobby zapas={zapas} />

      {/* Hlavní cesta: web si lobby najde sám podle Steam ID hosta, ptá se
          každých pár vteřin, dokud číslo nemá. Ruční vložení odkazu zůstává
          níž jako záloha pro případ, že seznam ze hry zrovna neodpovídá. */}
      <h3>Až lobby založíš, web si ji najde sám</h3>
      <HledaniLobby
        zapasId={zapas.id}
        onHledat={onHledatLobby}
        popisek="Vyhledat teď"
        automaticky={zapas.lobbyId === null}
        intervalMs={hraSpustena ? 2_000 : 4_000}
      />
      {zapas.lobbyId ? (
        <p className="potvrzeno" data-testid="lobby-nalezena">
          Web zná číslo tvojí lobby: <strong>{zapas.lobbyId}</strong>. Hráči už mají odkaz.
        </p>
      ) : null}
      {zapas.lobbyId ? (
        <KontrolaLobby zapasId={zapas.id} onKontrola={onKontrolaLobby} automaticky={zapas.fazeLobby === "lobby"} />
      ) : null}
      <details className="zaloha-odkaz">
        <summary>Nebo vlož odkaz ručně (tlačítko Copy v lobby)</summary>
        <label>
          Odkaz z tlačítka Copy v lobby
          <input value={odkaz} onChange={(e) => setOdkaz(e.target.value)} placeholder="aoe2de://0/…" />
        </label>
        <button onClick={() => void uloz()}>Uložit odkaz</button>
      </details>
      {chyba ? (
        <p className="chyba chyba-pole" data-testid="chyba-odkazu" role="alert">
          {chyba}
        </p>
      ) : null}

      <h3>Takhle to má v lobby vypadat</h3>
      <ul className="zrcadlo">
        {zapas.ucastnici.map((u) => (
          <li key={u.steamId} data-testid="radek-lobby" className={`barva-${u.barva}`}>
            <span className="swatch" /> {jmenoHrace(u)} — {BARVA_NAZEV[u.barva]}, {popisTymu(u)}
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
        {/* Klik na hodnotu přímo v poli dialogu ji zkopíruje — host má
            před sebou totéž, co ve hře, a bere si to rovnou odtud. */}
        <Kopirovatelne
          hodnota={zapas.nazevLobby}
          popis="název lobby"
          className="vsazeno vsazeno-vstup vsazeno-nazev"
          testId="pole-nazev-lobby"
        />

        {/* Rozbalovací seznam: přebíjí se jen část se jménem, šipka vpravo ve
            snímku zůstává vidět. */}
        <span className="vsazeno vsazeno-vyber vsazeno-players" data-testid="pole-players">
          {pocetHracu}
        </span>

        <Kopirovatelne
          hodnota={zapas.heslo}
          popis="heslo"
          className="vsazeno vsazeno-vstup vsazeno-heslo"
          testId="pole-heslo"
        />
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
