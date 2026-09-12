import { Fragment, useEffect, useRef, type ReactNode } from "react";
import { strany } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, type HledaniLobbyVysledek, type UcastnikView, type ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, mujUcastnik, popisTymu, sdiliCivilizaci } from "../zapas.js";
import { HledaniLobby } from "./HledaniLobby.js";
import { VyberCivilizace } from "./VyberCivilizace.js";

interface Props {
  /** Chat zápasu (Chat.tsx); dodává App, ať karta nezná API. */
  chat?: ReactNode;
  zapas: ZapasView;
  ja: string;
  onPripojit: (zapasId: number) => void;
  onHledatLobby: (zapasId: number) => Promise<HledaniLobbyVysledek>;
}

/**
 * Karta hráče, který se do lobby připojuje (host má ObrazovkaHosta). Stejný
 * rytmus jako u hosta: velký titulek, pruh s barvou a týmem, krok
 * „Připojuješ se!“ — dokud lobby není, čeká se na hosta a web ji hledá sám;
 * jakmile je, je tu tlačítko do hry. Pod tím strany zápasu vedle sebe jako
 * v lobby, s velkým VS mezi nimi.
 */
export function KartaHrace({ zapas, ja, onPripojit, onHledatLobby, chat }: Props) {
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

      <section className="sekce-krok" data-testid="strany-zapasu">
        <Strany ucastnici={zapas.ucastnici} ja={ja} />
      </section>
    <div ref={dole}>{chat}</div>
      </section>
  );
}

/**
 * Strany zápasu vedle sebe, každá jako řádky ze skládání (barva, tým, jméno,
 * civilizace), jen ke čtení. Mezi stranami velké VS. Vlastní řádek je
 * zvýrazněný.
 */
function Strany({ ucastnici, ja }: { ucastnici: UcastnikView[]; ja: string }) {
  const seznam = strany(ucastnici);
  return (
    <div className="vs-rozlozeni">
      {seznam.map((strana, i) => (
        <Fragment key={i}>
          {i > 0 ? (
            <div className="vs" aria-label="proti">
              VS
            </div>
          ) : null}
          <div className="skladani jen-ke-cteni">
            <ul className="sestava">
              {strana.clenove.map((u) => (
                <li key={u.steamId} className={u.steamId === ja ? "radek ja" : "radek"} data-testid="radek-strany">
                  <span className={`volba volba-barva barva-${u.barva}`} aria-label={`Barva ${BARVA_NAZEV[u.barva]}`}>
                    {u.barva}
                  </span>
                  <span className="volba volba-tym" aria-label={popisTymu(u)}>
                    {u.tym === 0 ? "–" : u.tym}
                  </span>
                  <span className="jmeno">{jmenoHrace(u)}</span>
                  <span className="elo">{u.elo1v1 !== null && u.elo1v1 !== undefined ? <small>({u.elo1v1})</small> : null}</span>
                  <VyberCivilizace popisek={`Civilizace ${jmenoHrace(u)}`} sada={null} hodnota={u.civ} onZmena={() => {}} vypnuto />
                </li>
              ))}
            </ul>
          </div>
        </Fragment>
      ))}
    </div>
  );
}
