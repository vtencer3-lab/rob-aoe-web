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
 * Zrcadlo herního dialogu Create Lobby, vykreslené co nejblíž tomu, co host
 * uvidí ve hře: stejná pole, stejné pořadí, stejné anglické názvy, stejné
 * tvary ovládacích prvků. Cílem je, aby to šlo porovnávat očima, ne číst.
 *
 * Web ale řídí jen pět z těch polí. Zbytek se kreslí proto, aby dialog seděl,
 * a nese hodnoty, které ve hře stojí ve výchozím stavu — proto `diktovano`.
 * Bez toho rozlišení by host nastavoval i to, o čem nikdo nerozhodl, a věřil
 * by tomu jako pokynu.
 */
function DialogCreateLobby({ zapas }: { zapas: ZapasView }) {
  return (
    <div className="dialog-lobby">
      <div className="dialog-ram">
        <header className="dialog-titulek" data-testid="dialog-titulek">
          Create Lobby
        </header>

        <div className="dialog-telo">
          <PoleText
            nazev="Lobby Name"
            hodnota={zapas.nazevLobby}
            diktovano
            kopirovat="název lobby"
          />
          <PoleVyber nazev="Lobby Type" hodnota="Unranked" />
          <PoleVyber nazev="Visibility" hodnota="Public" diktovano />
          <PoleVyber nazev="Players" hodnota={String(zapas.ucastnici.length)} diktovano />
          <PoleZaskrtavatko nazev="Co-Op Campaign" zaskrtnuto={false} />

          {/* Ta věta stojí v dialogu přesně tady a je to nejcennější řádek
              celého zrcadla: co je nad ní, se po založení lobby už neopraví.
              Kdo si toho nevšimne, zjistí to tím, že zakládá lobby znovu
              uprostřed streamu. */}
          <p className="dialog-varovani" data-testid="varovani-neni-zpet">
            These Settings can not be changed after game creation.
          </p>

          <PoleText nazev="Set Password" hodnota={zapas.heslo} diktovano kopirovat="heslo" />

          <div className="dialog-radek-zaskrtavatek">
            <PoleZaskrtavatko nazev="Allow Spectators" zaskrtnuto diktovano />
            <PoleZaskrtavatko nazev="Hide Civilizations" zaskrtnuto={false} />
          </div>

          <PoleVyber nazev="Spectator Delay" hodnota="None" />
          <PoleVyber nazev="Server" hodnota="Default" />
          <PoleVyber nazev="Data Mod" hodnota="Definitive Set" />

          {/* Jen dokreslení, ať dialog nekončí uprostřed. Opravdová tlačítka to
              být nesmí — host by na Create Lobby klikl a čekal, že se něco
              stane. Proto div, ne button, a aria-hidden. */}
          <div className="dialog-tlacitka" data-testid="dialog-tlacitka" aria-hidden="true">
            <span className="dialog-tlacitko">Create Lobby</span>
            <span className="dialog-tlacitko">Cancel</span>
          </div>
        </div>
      </div>

      <p className="dialog-legenda">
        Zvýrazněná pole ti diktuje web — <strong>{zapas.nazevLobby}</strong>,{" "}
        <strong>Public</strong> (jinak nejde zapnout diváky), <strong>Players</strong> podle počtu
        hráčů, heslo a <strong>Allow Spectators</strong> (bez toho se Rob dovnitř nedostane).
        Ostatní pole jsou tu jen kvůli podobě — nastav si je, jak chceš.{" "}
        <strong>Tři pole nad čárou po založení lobby už nezměníš</strong>, heslo a diváky ano.
      </p>
    </div>
  );
}

interface PoleProps {
  nazev: string;
  /** Řídí to web, nebo je pole jen kvůli podobě dialogu? */
  diktovano?: boolean;
  children?: ReactNode;
}

function Radek({ nazev, diktovano = false, children }: PoleProps) {
  return (
    <div
      className="dialog-pole"
      data-testid={`pole-${nazev}`}
      data-diktovano={diktovano ? "ano" : "ne"}
    >
      <span className="dialog-nazev" data-testid="nazev-pole">
        {nazev}
      </span>
      {children}
    </div>
  );
}

/** Textové pole: ve hře tmavý obdélník se zeleným písmem. */
function PoleText({
  nazev,
  hodnota,
  diktovano,
  kopirovat,
}: PoleProps & { hodnota: string; kopirovat: string }) {
  return (
    <Radek nazev={nazev} diktovano={diktovano}>
      <span className="dialog-vstup">{hodnota}</span>
      <KopirovaciTlacitko hodnota={hodnota} popis={kopirovat} />
    </Radek>
  );
}

/** Rozbalovací seznam: světlý pruh se šipkou vpravo. */
function PoleVyber({ nazev, hodnota, diktovano }: PoleProps & { hodnota: string }) {
  return (
    <Radek nazev={nazev} diktovano={diktovano}>
      <span className="dialog-vyber">
        {hodnota}
        <span className="dialog-sipka" aria-hidden="true" />
      </span>
    </Radek>
  );
}

/** Zaškrtávátko: čtvereček, zaškrtnutý červenou fajfkou. */
function PoleZaskrtavatko({
  nazev,
  zaskrtnuto,
  diktovano,
}: PoleProps & { zaskrtnuto: boolean }) {
  return (
    <div
      className="dialog-pole dialog-pole-zaskrtavatko"
      data-testid={`pole-${nazev}`}
      data-diktovano={diktovano ? "ano" : "ne"}
    >
      <span className="dialog-ctverecek">{zaskrtnuto ? "✓" : ""}</span>
      <span className="dialog-nazev" data-testid="nazev-pole">
        {nazev}
      </span>
    </div>
  );
}
