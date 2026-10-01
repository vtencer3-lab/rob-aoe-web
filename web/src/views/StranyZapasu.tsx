import { Fragment } from "react";
import { strany } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, type UcastnikView } from "../../../src/shared/types.js";
import { jmenoHrace, popisTymu } from "../zapas.js";
import { VyberCivilizace } from "./VyberCivilizace.js";

/**
 * Strany zápasu vedle sebe, každá jako řádky ze skládání (barva, tým, jméno,
 * civilizace), jen ke čtení. Vlastní řádek je zvýrazněný. U dvou stran velké
 * VS mezi nimi; u víc stran (FFA) se VS nekreslí vůbec — u osmi samostatných
 * hráčů by nic neoddělovalo a jen by viselo na kraji zalomeného řádku.
 */
export function StranyZapasu({ ucastnici, ja }: { ucastnici: UcastnikView[]; ja: string }) {
  const seznam = strany(ucastnici);
  // FFA (každý sám za sebe, třeba 1v1v1v1v1v1v1v1) má víc stran než klasické
  // dva týmy — do jednoho řádku se nevejdou, proto se při víc než dvou
  // stranách přidá třída pro mřížku (CSS: .vs-rozlozeni.mnoho-stran) a
  // nekreslí se „VS“ (u FFA nic neodděluje, jen by přebývalo).
  const mnohoStran = seznam.length > 2;
  return (
    <div className={mnohoStran ? "vs-rozlozeni mnoho-stran" : "vs-rozlozeni"}>
      {seznam.map((strana, i) => (
        <Fragment key={i}>
          {i > 0 && !mnohoStran ? (
            <div className="vs" aria-label="proti">
              VS
            </div>
          ) : null}
          <div className="skladani jen-ke-cteni">
            <ul className="sestava">
              {strana.clenove.map((u) => (
                <li key={u.hracId} className={u.hracId === ja ? "radek ja" : "radek"} data-testid="radek-strany">
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
