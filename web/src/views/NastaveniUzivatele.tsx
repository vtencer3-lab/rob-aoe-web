import { useState } from "react";
import { LHUTA_MAX_MINUT, LHUTA_MIN_MINUT } from "../../../src/shared/aktivita.js";
import zvonUrl from "../assets/zvon.mp3";
import { useZamekScrollu } from "../zamekScrollu.js";
import { nastavHlasitost, prehraj } from "../zvuk.js";

interface Props {
  hlasitost: number;
  onHlasitost: (procent: number) => void;
  /** Jen admin: lhůta aktivity večera v minutách. */
  lhutaMinut?: number;
  onLhuta?: (minut: number) => void;
  onZavrit: () => void;
}

/**
 * Ozubené kolečko vedle jména: nastavení, které se týká jen tohohle
 * prohlížeče (hlasitost) a — pro admina — večera (lhůta aktivity). Hlasitost
 * se ukládá při každém posunu a hned se zkouší zvonem; lhůta jde po minutě
 * šipkami, meze hlídá i server.
 */
export function NastaveniUzivatele({ hlasitost, onHlasitost, lhutaMinut, onLhuta, onZavrit }: Props) {
  useZamekScrollu();
  const [posun, setPosun] = useState(hlasitost);
  const zmenLhutu = (o: number) => {
    if (lhutaMinut === undefined || !onLhuta) return;
    const nova = Math.min(LHUTA_MAX_MINUT, Math.max(LHUTA_MIN_MINUT, lhutaMinut + o));
    if (nova !== lhutaMinut) onLhuta(nova);
  };

  return (
    <div
      className="prelobby-stin"
      data-testid="nastaveni-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div className="prelobby-okno nastaveni-uzivatele" role="dialog" aria-modal="true" aria-label="Nastavení" data-testid="nastaveni-uzivatele">
        <header className="hlavicka-akce">
          <h2>Nastavení</h2>
          <button type="button" className="zavrit" aria-label="Zavřít" onClick={onZavrit}>
            ✕
          </button>
        </header>
        <label className="radek-nastaveni">
          <span>Hlasitost zvuků</span>
          <input
            type="range"
            min={0}
            max={100}
            value={posun}
            aria-label="Hlasitost zvuků"
            onChange={(e) => {
              const v = Number(e.target.value);
              setPosun(v);
              nastavHlasitost(v);
              onHlasitost(v);
            }}
            onMouseUp={() => prehraj(zvonUrl, posun)}
            onKeyUp={() => prehraj(zvonUrl, posun)}
          />
          <output>{posun} %</output>
        </label>
        {lhutaMinut !== undefined && onLhuta ? (
          <div className="radek-nastaveni" role="group" aria-label="Lhůta aktivity">
            <span>Lhůta aktivity</span>
            <div className="krokovac">
              <button type="button" aria-label="O minutu méně" disabled={lhutaMinut <= LHUTA_MIN_MINUT} onClick={() => zmenLhutu(-1)}>
                ▼
              </button>
              <input type="text" readOnly value={`${lhutaMinut} min`} aria-label="Lhůta aktivity v minutách" data-testid="lhuta-minut" />
              <button type="button" aria-label="O minutu více" disabled={lhutaMinut >= LHUTA_MAX_MINUT} onClick={() => zmenLhutu(1)}>
                ▲
              </button>
            </div>
            <small>
              {LHUTA_MIN_MINUT}–{LHUTA_MAX_MINUT} minut; platí pro celý večer.
            </small>
          </div>
        ) : null}
      </div>
    </div>
  );
}
