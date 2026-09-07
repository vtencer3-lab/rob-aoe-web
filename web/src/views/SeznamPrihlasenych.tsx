import type { PlayerView } from "../../../src/shared/types.js";
import { formatElo, formatHodiny, formatOdehrano } from "../format.js";

export function SeznamPrihlasenych({ prihlaseni }: { prihlaseni: PlayerView[] }) {
  if (prihlaseni.length === 0) {
    return <p className="prazdno">Zatím se nikdo nepřihlásil.</p>;
  }

  return (
    <table className="seznam">
      <thead>
        <tr>
          <th>Hráč</th>
          <th>1v1 ELO</th>
          <th>Nejvýš</th>
          <th>Odehráno</th>
          <th>Hodin ve hře</th>
        </tr>
      </thead>
      <tbody>
        {prihlaseni.map((hrac) => (
          <tr key={hrac.steamId}>
            <td>
              {hrac.avatarUrl ? <img src={hrac.avatarUrl} alt="" width={20} height={20} /> : null}
              {hrac.alias ?? hrac.steamName ?? hrac.steamId}
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
        ))}
      </tbody>
    </table>
  );
}
