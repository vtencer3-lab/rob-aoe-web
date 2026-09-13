import { useEffect, useRef, type ReactNode } from "react";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { BARVA_NAZEV, type HledaniLobbyVysledek, type ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, mujUcastnik, popisTymu, sdiliCivilizaci } from "../zapas.js";
import { HledaniLobby } from "./HledaniLobby.js";
import { KontrolaLobby } from "./KontrolaLobby.js";
import { StranyZapasu } from "./StranyZapasu.js";

interface Props {
  /** Chat zápasu (Chat.tsx); dodává App, ať karta nezná API. */
  chat?: ReactNode;
  zapas: ZapasView;
  ja: string;
  onPripojit: (zapasId: number) => void;
  onHledatLobby: (zapasId: number) => Promise<HledaniLobbyVysledek>;
  /** Kontrola lobby jako u hosta; bez ní se sekce nevykreslí (starší volající). */
  onKontrolaLobby?: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
}

/**
 * Karta hráče, který se do lobby připojuje (host má ObrazovkaHosta). Stejný
 * rytmus jako u hosta: velký titulek, pruh s barvou a týmem, krok
 * „Připojuješ se!“ — dokud lobby není, čeká se na hosta a web ji hledá sám;
 * jakmile je, je tu tlačítko do hry. Pak kontrola lobby jako u hosta (hráč
 * vidí, co host ještě nemá nastavené — uživatel 13. 9. 2026) a strany zápasu
 * vedle sebe jako v lobby, s velkým VS mezi nimi.
 */
export function KartaHrace({ zapas, ja, onPripojit, onHledatLobby, onKontrolaLobby, chat }: Props) {
  const muj = mujUcastnik(zapas, ja);
  if (!muj) return null;
  // Civilizaci sdílí, kdo má stejnou barvu (Coop Kings) — ne kdo je ve stejném týmu.
  const parta = sdiliCivilizaci(zapas.ucastnici, ja);
  const barva = BARVA_NAZEV[muj.barva];
  const nalezena = zapas.joinUri !== null;
  // Jakmile host lobby založí, sjet na tlačítko Připojit; po kliknutí k chatu.
  // Jen při změně, ne při načtení stránky s už nalezenou lobby.
  const pripojit = useRef<HTMLAnchorElement>(null);
  const dole = useRef<HTMLDivElement>(null);
  const drivOdkaz = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const driv = drivOdkaz.current;
    drivOdkaz.current = zapas.joinUri;
    if (driv === undefined || driv !== null || zapas.joinUri === null) return;
    setTimeout(() => pripojit.current?.scrollIntoView?.({ behavior: "smooth", block: "center" }), 50);
  }, [zapas.joinUri]);

  return (
    <section className={`karta barva-${muj.barva}`}>
      <h2 className="titulek-zapasu" data-testid="titulek-zapasu">
        Zápas #{zapas.poradi}
      </h2>
      <div className="hero">
        <strong data-testid="moje-barva">{barva}</strong>
        <span>
          <span data-testid="muj-tym">{popisTymu(muj)}</span>
        </span>
      </div>
      {parta.length > 0 ? (
        <p className="stred">
          Civilizaci sdílíš s <strong>{parta.map(jmenoHrace).join(", ")}</strong> — musíte mít oba stejnou barvu.
        </p>
      ) : null}

      <section className={nalezena ? "sekce-krok hotovo" : "sekce-krok"} data-testid="krok-pripojeni">
        <header className="zahlavi-sekce">
          <h3 className="zakladas">Připojuješ se!</h3>
          {nalezena ? (
            <span className="fajfka" data-testid="fajfka-lobby" aria-label="Lobby nalezena">
              ✓
            </span>
          ) : null}
        </header>
        {zapas.joinUri ? (
          <div className="ovladani hostovi">
            <a
              className="cta"
              href={zapas.joinUri}
              ref={pripojit}
              onClick={() => {
                onPripojit(zapas.id);
                // Po kliknutí sjet k chatu a kontrole (uživatel).
                setTimeout(() => dole.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 50);
              }}
            >
              Připojit se do hry
            </a>
          </div>
        ) : (
          <>
            <p className="ceka stred">
              Čeká se na hosta, až založí lobby<span className="tecky" aria-hidden="true" />
            </p>
            {/* Čekající hráč si může pomoct sám: seznam otevřených lobby je
                společný, takže najde totéž číslo, které by našel host. Hláška
                „lobby není vidět“ tu není — říká totéž co věta nad tím. */}
            <HledaniLobby zapasId={zapas.id} onHledat={onHledatLobby} nalezena={false} automaticky tichy />
          </>
        )}
        {zapas.heslo ? (
          <p className="stred heslo">
            Heslo: <strong>{zapas.heslo}</strong>
          </p>
        ) : null}
      </section>

      {zapas.lobbyId && onKontrolaLobby ? (
        <KontrolaLobby zapasId={zapas.id} onKontrola={onKontrolaLobby} automaticky={zapas.fazeLobby === "lobby"} />
      ) : null}

      <section className="sekce-krok" data-testid="strany-zapasu">
        <StranyZapasu ucastnici={zapas.ucastnici} ja={ja} />
      </section>
    <div ref={dole}>{chat}</div>
      </section>
  );
}
