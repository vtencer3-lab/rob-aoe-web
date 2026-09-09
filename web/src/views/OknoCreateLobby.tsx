import type { NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import { DATA_MODY, doplnNastaveni, LOBBY_TYPY, VIDITELNOST, ZPOZDENI_DIVAKU } from "../../../src/shared/lobbyKontrola.js";
import { Kopirovatelne } from "./Kopirovatelne.js";

interface Props {
  /** Jméno, které má lobby dostat — host ho opisuje do hry. */
  nazevLobby: string;
  /** Heslo pro lobby; kliknutím se kopíruje. */
  heslo: string;
  /** Očekávané nastavení akce; pre-lobby klíče z něj okno bere. */
  nastaveni: Record<string, unknown> | undefined;
  /** Kolik hráčů má zápas — Players, když si režie nevybrala jinak. */
  pocetHracu: number;
}

/**
 * Okno „Create Lobby“ ze hry, postavené z herních assetů: host má před sebou
 * přesně to, co uvidí ve hře, jen s vyplněnými hodnotami.
 *
 * Do 9. 9. 2026 tu byl snímek obrazovky s přebitými třemi poli. Nešlo na něm
 * ale ukázat nic dalšího: když režie změnila třeba server nebo zpoždění
 * diváků, snímek dál tvrdil své. Postavené okno se mění celé.
 *
 * Je to jen obrázek k opsání, ne formulář — nastavuje se v panelu režie
 * (PreLobby.tsx), tady se to zobrazuje. Klikací je jen jméno a heslo, aby
 * se daly zkopírovat.
 */
export function OknoCreateLobby({ nazevLobby, heslo, nastaveni, pocetHracu }: Props) {
  const n: Nastaveni = doplnNastaveni(nastaveni as Partial<Nastaveni>);
  const nebo = <T,>(hodnota: T | null, zaloha: T): T => (hodnota === null ? zaloha : hodnota);
  // Players se bere ze syrového nastavení, ne z doplněného: výchozí dvojka
  // je požadavek pro kontrolu, ale v okně má stát, kolik hráčů zápas opravdu
  // má, dokud si režie počet slotů nenastaví sama.
  const zadanyPocet = (nastaveni as Partial<Nastaveni> | undefined)?.maxHracu ?? null;

  return (
    <div className="okno-lobby" data-testid="okno-create-lobby">
      <header className="okno-lobby-zahlavi">
        <h4>Create Lobby</h4>
        <span className="okno-lobby-zavrit" aria-hidden="true" />
      </header>

      <div className="okno-lobby-telo">
        <Radek popis="Lobby Name">
          <Kopirovatelne hodnota={nazevLobby} popis="název lobby" className="okno-lobby-vstup" testId="okno-nazev" />
        </Radek>
        <Radek popis="Lobby Type">
          <Vyber>{LOBBY_TYPY[nebo(n.lobbyTyp, 0)]}</Vyber>
        </Radek>
        <Radek popis="Visibility">
          <Vyber>{VIDITELNOST[nebo(n.viditelnost, 0)]}</Vyber>
        </Radek>
        <Radek popis="Players">
          {/* Když režie počet slotů nenastavila, platí kolik hráčů zápas má. */}
          <Vyber testId="okno-players">{String(zadanyPocet ?? pocetHracu)}</Vyber>
        </Radek>
        <Zaskrtavatko zapnuto={n.coopKampan === true} popis="Co-Op Campaign" />

        <p className="okno-lobby-varovani">These Settings can not be changed after game creation.</p>

        <Radek popis="Set Password">
          <Kopirovatelne hodnota={heslo} popis="heslo" className="okno-lobby-vstup" testId="okno-heslo" />
        </Radek>
        <div className="okno-lobby-dvojice">
          <Zaskrtavatko zapnuto={n.povolitDivaky !== false} popis="Allow Spectators" />
          <Zaskrtavatko zapnuto={n.skrytCivilizace === true} popis="Hide Civilizations" />
        </div>
        <Radek popis="Spectator Delay">
          <Vyber>{ZPOZDENI_DIVAKU[nebo(n.zpozdeniDivaku, 0)]}</Vyber>
        </Radek>
        <Radek popis="Server">
          <Vyber testId="okno-server">{nebo(n.server, "Default")}</Vyber>
        </Radek>
        <Radek popis="Data Mod">
          <Vyber>{nebo(n.dataMod, DATA_MODY[0]!)}</Vyber>
        </Radek>
      </div>
    </div>
  );
}

function Radek({ popis, children }: { popis: string; children: React.ReactNode }) {
  return (
    <div className="okno-lobby-radek">
      <span className="okno-lobby-popis">{popis}</span>
      {children}
    </div>
  );
}

/** Rozbalovátko: herní pole se šipkou, ale nic se nerozbaluje — jen ukazuje. */
function Vyber({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <span className="okno-lobby-vyber" data-testid={testId}>
      {children}
    </span>
  );
}

function Zaskrtavatko({ zapnuto, popis }: { zapnuto: boolean; popis: string }) {
  return (
    <span className={zapnuto ? "okno-lobby-zaskrtavatko zapnuto" : "okno-lobby-zaskrtavatko"}>
      <span className="ctverec" aria-hidden="true" />
      {popis}
    </span>
  );
}
