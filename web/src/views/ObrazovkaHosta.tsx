import { useState, type ReactNode } from "react";
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
 * Zrcadlo herního dialogu Create Lobby. Anglické názvy polí jsou schválně —
 * host je očima porovnává s anglickým dialogem hry, český překlad by ho nutil
 * překládat zpátky. Pořadí je taky to ze hry.
 *
 * Vědomě jen pět polí, která web řídí. O Lobby Type, Co-Op Campaign, Hide
 * Civilizations, Spectator Delay, Server ani Data Mod se nemluví: web o nich
 * nic neví a Rob si je volí podle večera. Vymyslet je by znamenalo diktovat
 * hostovi nastavení, které nikdo nerozhodl.
 */
function DialogCreateLobby({ zapas }: { zapas: ZapasView }) {
  return (
    <div className="dialog-lobby">
      <header className="dialog-titulek">Create Lobby</header>

      <Pole nazev="Lobby Name" hodnota={zapas.nazevLobby} kopirovat="název lobby" />
      <Pole nazev="Visibility" hodnota="Public">
        Veřejná — u jiné volby nejde zapnout diváky.
      </Pole>
      <Pole nazev="Players" hodnota={String(zapas.ucastnici.length)}>
        Tolik, kolik je hráčů v zápase. Diváci slot neberou.
      </Pole>

      {/* Ta věta stojí v dialogu přesně tady a je to nejcennější řádek celého
          zrcadla: co je nad ní, se po založení lobby už neopraví. Kdo si toho
          nevšimne, zjistí to tím, že zakládá lobby znovu uprostřed streamu. */}
      <p className="dialog-varovani" data-testid="varovani-neni-zpet">
        <strong>These Settings can not be changed after game creation.</strong>
        <br />
        Tři pole nahoře po založení lobby už nezměníš. Heslo a diváky pod čarou
        ano.
      </p>

      <Pole nazev="Set Password" hodnota={zapas.heslo} kopirovat="heslo" />
      <Pole nazev="Allow Spectators" hodnota="✓">
        Zaškrtnout — bez toho se Rob dovnitř nedostane.
      </Pole>
    </div>
  );
}

interface PoleProps {
  nazev: string;
  hodnota: string;
  /** Když je vyplněné, přibude vedle hodnoty tlačítko na zkopírování. */
  kopirovat?: string;
  children?: ReactNode;
}

function Pole({ nazev, hodnota, kopirovat, children }: PoleProps) {
  return (
    <div className="dialog-pole" data-testid={`pole-${nazev}`}>
      <span className="dialog-nazev" data-testid="nazev-pole">
        {nazev}
      </span>
      <span className="dialog-hodnota">
        <strong>{hodnota}</strong>
        {kopirovat !== undefined ? (
          <KopirovaciTlacitko hodnota={hodnota} popis={kopirovat} />
        ) : null}
        {children !== undefined ? <em className="dialog-poznamka">{children}</em> : null}
      </span>
    </div>
  );
}
