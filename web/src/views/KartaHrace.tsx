import { BARVA_NAZEV, type HledaniLobbyVysledek, type ZapasView } from "../../../src/shared/types.js";
import { nazevCivilizace } from "../../../src/shared/civilizace.js";
import { jmenoHrace, mujUcastnik, popisFormatu, popisTymu, sdiliCivilizaci, souperi } from "../zapas.js";
import { HledaniLobby } from "./HledaniLobby.js";

interface Props {
  zapas: ZapasView;
  ja: string;
  onPripojit: (zapasId: number) => void;
  onHledatLobby: (zapasId: number) => Promise<HledaniLobbyVysledek>;
}

export function KartaHrace({ zapas, ja, onPripojit, onHledatLobby }: Props) {
  const muj = mujUcastnik(zapas, ja);
  if (!muj) return null;
  // Civilizaci sdílí, kdo má stejnou barvu (Coop Kings) — ne kdo je ve stejném týmu.
  const parta = sdiliCivilizaci(zapas.ucastnici, ja);
  const proti = souperi(zapas, ja);
  const barva = BARVA_NAZEV[muj.barva];

  return (
    <section className={`karta barva-${muj.barva}`}>
      <header>
        Zápas #{zapas.poradi} · {popisFormatu(zapas.ucastnici)}
      </header>
      <div className="hero">
        <strong data-testid="moje-barva">{barva}</strong>
        <span>
          <span data-testid="muj-tym">{popisTymu(muj)}</span>
        </span>
      </div>
      <p>
        V lobby si nastav <strong>{barva} barvu</strong> a <strong>{popisTymu(muj)}</strong>
        {muj.civ !== null ? (
          <>
            {" "}
            a civilizaci <strong data-testid="moje-civ">{nazevCivilizace(muj.civ)}</strong>
          </>
        ) : null}
        .
      </p>
      {parta.length > 0 ? (
        <p>
          Civilizaci sdílíš s <strong>{parta.map(jmenoHrace).join(", ")}</strong> —
          musíte mít oba stejnou barvu.
        </p>
      ) : null}
      {zapas.joinUri ? (
        <a className="cta" href={zapas.joinUri} onClick={() => onPripojit(zapas.id)}>
          Připojit se do hry
        </a>
      ) : (
        <>
          <p className="ceka">Čeká se na hosta, až založí lobby.</p>
          {/* Čekající hráč si může pomoct sám: seznam otevřených lobby je
              společný, takže najde totéž číslo, které by našel host. */}
          <HledaniLobby zapasId={zapas.id} onHledat={onHledatLobby} nalezena={false} automaticky />
        </>
      )}
      <footer>
        <p>Proti vám: {proti.map(jmenoHrace).join(", ")}</p>
        {/* Bez odkazu nemá smysl ptát se, jestli nejde. Věta říká, co
            udělat teď: bez lobby počkat, s lobby ji najít ručně ve hře. */}
        {zapas.lobbyId ? (
          <p>
            Nefunguje tlačítko Připojit? V lobby prohlížeči ve hře hledej{" "}
            <strong>{zapas.nazevLobby}</strong> nebo vlož číslo <strong>{zapas.lobbyId}</strong>.
          </p>
        ) : (
          <p>
            Lobby se bude jmenovat <strong>{zapas.nazevLobby}</strong>; jakmile ji host založí,
            objeví se tu tlačítko Připojit.
          </p>
        )}
        {zapas.heslo ? (
          <p>
            Heslo: <strong>{zapas.heslo}</strong>
          </p>
        ) : null}
      </footer>
    </section>
  );
}
