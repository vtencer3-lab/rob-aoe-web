import { BARVA_NAZEV, type ZapasView } from "../../../src/shared/types.js";
import { mujUcastnik, souperi, spoluhraci } from "../zapas.js";

interface Props {
  zapas: ZapasView;
  ja: string;
  onPripojit: (zapasId: number) => void;
}

export function KartaHrace({ zapas, ja, onPripojit }: Props) {
  const muj = mujUcastnik(zapas, ja);
  if (!muj) return null;

  const parta = spoluhraci(zapas, ja);
  const proti = souperi(zapas, ja);
  const barva = BARVA_NAZEV[muj.barva];

  return (
    <section className={`karta barva-${muj.barva}`}>
      <header>
        Zápas #{zapas.poradi} · {zapas.format === "1v1" ? "1v1" : "Coop Kings"}
      </header>

      <div className="hero">
        <strong data-testid="moje-barva">{barva}</strong>
        <span>
          tým <span data-testid="muj-tym">{muj.tym}</span>
        </span>
      </div>

      <p>
        V lobby si nastav <strong>{barva} barvu</strong> a <strong>tým {muj.tym}</strong>.
      </p>
      {parta.length > 0 ? (
        <p>
          Civilizaci sdílíš s <strong>{parta.map((s) => s.alias ?? s.steamId).join(", ")}</strong> —
          musíte mít oba stejnou barvu.
        </p>
      ) : null}

      {zapas.joinUri ? (
        <a className="cta" href={zapas.joinUri} onClick={() => onPripojit(zapas.id)}>
          Připojit se do hry
        </a>
      ) : (
        <p className="ceka">Čeká se na hosta, až založí lobby.</p>
      )}

      <footer>
        <p>Proti vám: {proti.map((s) => s.alias ?? s.steamId).join(", ")}</p>
        <p>
          Nejde odkaz? V lobby prohlížeči hledej <strong>{zapas.nazevLobby}</strong>
          {zapas.lobbyId ? (
            <>
              {" "}
              nebo vlož číslo <strong>{zapas.lobbyId}</strong>
            </>
          ) : null}
          .
        </p>
        {zapas.heslo ? (
          <p>
            Heslo: <strong>{zapas.heslo}</strong>
          </p>
        ) : null}
      </footer>
    </section>
  );
}
