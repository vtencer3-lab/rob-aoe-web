import type { PlayerView } from "../../../src/shared/types.js";
import { procentoVyher, ZEBRICKY } from "../../../src/shared/zebricky.js";

/**
 * Karta se statistikami hráče, jak ji ukazuje hra po najetí na jméno v lobby:
 * avatar, jméno a tabulka žebříčků (rating, pořadí, výhry, prohry, procento).
 * Sedí v pravém dolním rohu okna, ať nepřekrývá řádek, na kterém je myš.
 */
export function StatistikyHrace({ hrac }: { hrac: PlayerView }) {
  const jmeno = hrac.alias ?? hrac.steamName ?? hrac.steamId;
  const podleId = new Map((hrac.zebricky ?? []).map((z) => [z.id, z]));
  return (
    <aside className="staty-hrace" role="tooltip" data-testid="staty-hrace">
      <header>
        {hrac.avatarUrl ? <img src={hrac.avatarUrl} alt="" width={48} height={48} /> : null}
        <strong>{jmeno}</strong>
      </header>
      <table>
        <thead>
          <tr>
            <th>Leaderboard</th>
            <th>Rating</th>
            <th>Rank</th>
            <th>Wins</th>
            <th>Losses</th>
            <th>Win%</th>
          </tr>
        </thead>
        <tbody>
          {ZEBRICKY.map(({ id, nazev, tymovy }) => {
            const z = podleId.get(id);
            return (
              <tr key={id} className={tymovy ? "tymovy" : undefined}>
                <td>{nazev}</td>
                <td>{z?.rating ?? "---"}</td>
                <td>{z?.poradi !== null && z?.poradi !== undefined ? `#${z.poradi}` : "---"}</td>
                <td>{z?.vyhry ?? 0}</td>
                <td>{z?.prohry ?? 0}</td>
                <td>{z ? procentoVyher(z) : 0}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {hrac.zebricky === null || hrac.zebricky === undefined ? <p className="zaloha">Žebříčky se ještě nestáhly.</p> : null}
    </aside>
  );
}
