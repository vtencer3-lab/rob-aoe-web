import { Fragment } from "react";
import { strany } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, type UcastnikView } from "../../../src/shared/types.js";
import { jmenoHrace, popisTymu } from "../zapas.js";
import { VyberCivilizace } from "./VyberCivilizace.js";

/**
 * Strany zápasu vedle sebe, každá jako řádky ze skládání (barva, tým, jméno,
 * civilizace), jen ke čtení. Mezi stranami velké VS. Vlastní řádek je
 * zvýrazněný.
 */
export function StranyZapasu({ ucastnici, ja }: { ucastnici: UcastnikView[]; ja: string }) {
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
