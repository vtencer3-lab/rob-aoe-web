import { useState, type ReactNode } from "react";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { BARVA_NAZEV, type HledaniLobbyVysledek, type ZapasView } from "../../../src/shared/types.js";
import { mujUcastnik, popisTymu } from "../zapas.js";
import { HledaniLobby } from "./HledaniLobby.js";
import { KontrolaLobby } from "./KontrolaLobby.js";
import { Kopirovatelne } from "./Kopirovatelne.js";
import { OknoCreateLobby } from "./OknoCreateLobby.js";

interface Props {
  /** Chat zápasu (Chat.tsx); dodává App, ať karta nezná API. */
  chat?: ReactNode;
  zapas: ZapasView;
  ja: string;
  /** Očekávané nastavení akce — okno Create Lobby z něj bere pre-lobby volby. */
  nastaveniLobby?: Record<string, unknown>;
  onHledatLobby: (zapasId: number) => Promise<HledaniLobbyVysledek>;
  onKontrolaLobby: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
}

/**
 * Obrazovka hosta: velký titulek zápasu, pruh s barvou, a pak tři kroky pod
 * sebou — „Zakládáš!“ (fajfka, jakmile web lobby najde), „Kontrola lobby“
 * (fajfka, když hlavní sekce prošla) a nakonec „Výborně, můžete hrát!“. Host
 * tak i uprostřed streamu vidí, kde je. Tlačítko do lobby tu není: host ji
 * zakládá, do lobby se odkazem připojují ostatní (KartaHrace).
 */
export function ObrazovkaHosta({ zapas, ja, nastaveniLobby, onHledatLobby, onKontrolaLobby, chat }: Props) {
  // Po kliknutí na „Spustit hru“ host lobby zakládá právě teď: hledání zrychlí
  // ze 4 s na 2 s, ať hráči dostanou odkaz, sotva lobby vznikne.
  const [hraSpustena, setHraSpustena] = useState(false);
  // Verdikt kontroly drží sekce kontroly; sem ho jen hlásí.
  const [vPoradku, setVPoradku] = useState<boolean | null>(null);

  // Host dostane tuhle obrazovku *místo* KartaHrace, ne k ní — svoji barvu by
  // jinak neviděl, zatímco každý druhý účastník má pruh přes půl obrazovky.
  const muj = mujUcastnik(zapas, ja);
  // Lobby je „nalezená“, dokud stojí v seznamu ze hry. Jakmile zmizí (hra
  // začala, nebo ji host zavřel), tlačítko hledání zase ožije.
  const nalezena = zapas.lobbyId !== null && zapas.fazeLobby !== "hraje_se";

  return (
    <section className={muj ? `host barva-${muj.barva}` : "host"}>
      <h2 className="titulek-zapasu" data-testid="titulek-zapasu">
        Zápas #{zapas.poradi}
      </h2>

      {muj ? (
        <div className="hero">
          <strong data-testid="moje-barva">{BARVA_NAZEV[muj.barva]}</strong>
          <span>
            <span data-testid="muj-tym">{popisTymu(muj)}</span>
          </span>
        </div>
      ) : null}

      <section className={nalezena ? "sekce-krok hotovo" : "sekce-krok"} data-testid="krok-lobby">
        <header className="zahlavi-sekce">
          <h3 className="zakladas">Zakládáš!</h3>
          {nalezena ? (
            <span className="fajfka" data-testid="fajfka-lobby" aria-label="Lobby nalezena">
              ✓
            </span>
          ) : null}
        </header>
        {/* Host si hru pouští odtud: steam://run ji nastartuje (nebo vytáhne
            do popředí). */}
        <div className="ovladani hostovi">
          <a className="cta" href="steam://run/813780" data-testid="spustit-hru" onClick={() => setHraSpustena(true)}>
            Spustit hru
          </a>
        </div>
        <OknoCreateLobby
          nazevLobby={zapas.nazevLobby}
          heslo={zapas.heslo}
          nastaveni={nastaveniLobby}
          pocetHracu={zapas.ucastnici.length}
        />

        {/* Web si lobby najde sám podle Steam ID hosta; tlačítko je pro
            netrpělivé a pro případ, že lobby ze seznamu vypadla. */}
        <HledaniLobby
          zapasId={zapas.id}
          onHledat={onHledatLobby}
          nalezena={nalezena}
          odkaz={zapas.joinUri}
          automaticky={zapas.lobbyId === null}
          intervalMs={hraSpustena ? 2_000 : 4_000}
        />
      </section>

      {zapas.lobbyId ? (
        <KontrolaLobby zapasId={zapas.id} onKontrola={onKontrolaLobby} automaticky={zapas.fazeLobby === "lobby"} onVerdikt={setVPoradku} />
      ) : null}

      {zapas.lobbyId && vPoradku ? (
        <section className="sekce-krok hotovo finale" data-testid="muzete-hrat">
          <header className="zahlavi-sekce">
            <h3>Výborně, můžete hrát!</h3>
            <span className="fajfka" aria-hidden="true">
              ✓
            </span>
          </header>
        </section>
      ) : null}
    {chat}
      </section>
  );
}

