import type { PlayerView } from "../../../src/shared/types.js";
import { formatElo, formatHodiny, formatOdehrano } from "../format.js";
import type { Skladani } from "../skladani.js";
import { useTahani } from "../tahani.js";

interface Props {
  prihlaseni: PlayerView[];
  /**
   * Jen pro režii: tabulka je pak seznam nevybraných hráčů s tlačítkem „+“,
   * řádky jdou přetahovat a vybraní z ní odcházejí do panelu sestavy.
   */
  skladani?: Skladani;
}

export function SeznamPrihlasenych({ prihlaseni, skladani }: Props) {
  const tahani = useTahani(skladani?.presun ?? (() => {}));
  const radky = skladani ? skladani.nevybrani : prihlaseni;

  if (prihlaseni.length === 0) {
    return <p className="prazdno">Zatím se nikdo nepřihlásil.</p>;
  }
  if (radky.length === 0) {
    return <p className="prazdno">Všichni přihlášení jsou v sestavě.</p>;
  }

  return (
    <table className={skladani ? "seznam seznam-rezie" : "seznam"}>
      <thead>
        <tr>
          {skladani ? <th aria-label="Vybrat do sestavy" /> : null}
          <th>Hráč</th>
          <th>1v1 ELO</th>
          <th>Nejvýš</th>
          <th>Odehráno</th>
          <th>Hodin ve hře</th>
        </tr>
      </thead>
      <tbody>
        {radky.map((hrac) => {
          const jmeno = hrac.alias ?? hrac.steamName ?? hrac.steamId;
          return (
            <tr key={hrac.steamId} {...(skladani ? tahani("nevybrani", hrac.steamId) : {})}>
              {skladani ? (
                <td className="vybrat">
                  <button
                    type="button"
                    className="plus"
                    aria-label={`Vybrat hráče ${jmeno}`}
                    title="Vybrat hráče"
                    onClick={() => skladani.vyber(hrac.steamId)}
                  >
                    +
                  </button>
                </td>
              ) : null}
              <td>
                {hrac.avatarUrl ? <img src={hrac.avatarUrl} alt="" width={20} height={20} /> : null}
                {jmeno}
                {hrac.statyChyba ? (
                  <span className="varovani" title={hrac.statyChyba}>
                    ⚠
                  </span>
                ) : null}
              </td>
              <td>{formatElo(hrac.elo1v1)}</td>
              <td>{formatElo(hrac.eloNejvyssi)}</td>
              <td>{formatOdehrano(hrac.odehranoHer)}</td>
              {/* Bez avataru se Steamu nikdo neptal (chybí klíč, nebo dotaz
                  selhal) — pak NULL neznamená skrytý profil, ale „nevíme“. */}
              <td>{hrac.steamHodiny !== null || hrac.avatarUrl ? formatHodiny(hrac.steamHodiny) : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
