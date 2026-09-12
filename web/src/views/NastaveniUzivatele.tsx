import { createPortal } from "react-dom";
import { useState, type CSSProperties } from "react";
import { LHUTA_MAX_MINUT, LHUTA_MIN_MINUT, ZVONEK_PO_MINUTACH } from "../../../src/shared/aktivita.js";
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

  return createPortal(
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
            style={{ "--podil": `${posun}%` } as CSSProperties}
            aria-label="Hlasitost zvuků"
            onChange={(e) => {
              const v = Number(e.target.value);
              setPosun(v);
              nastavHlasitost(v);
              onHlasitost(v);
            }}
            onMouseUp={() => prehraj(zvonUrl, posun)}
            onKeyUp={() => prehraj(zvonUrl, posun)}
            onWheel={(e) => {
              // Kolečko po procentu (uživatel); hodnota se uloží jako při tažení.
              e.preventDefault();
              const v = Math.min(100, Math.max(0, posun + (e.deltaY < 0 ? 1 : -1)));
              setPosun(v);
              nastavHlasitost(v);
              onHlasitost(v);
            }}
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
              <input
                type="text"
                readOnly
                value={`${lhutaMinut} min`}
                aria-label="Lhůta aktivity v minutách"
                data-testid="lhuta-minut"
                onWheel={(e) => {
                  // Kolečko myši nad polem: po minutě (uživatel), místo rolování stránky.
                  e.preventDefault();
                  zmenLhutu(e.deltaY < 0 ? 1 : -1);
                }}
              />
              <button type="button" aria-label="O minutu více" disabled={lhutaMinut >= LHUTA_MAX_MINUT} onClick={() => zmenLhutu(1)}>
                ▲
              </button>
            </div>
            {/* Náhled, kdy se co objeví: „Jsem tu!“ minutu po začátku odpočtu,
                zvonek po pěti minutách. Jen k podívání, ne ke kliknutí. */}
            <div className="nahled-lhuty" aria-label="Kdy se co objeví" data-testid="nahled-lhuty">
              <span className="polozka">
                <button type="button" className="jsem-tu" disabled>
                  Jsem tu!
                </button>
                <small>od {lhutaMinut - 1} min</small>
              </span>
              <span className="polozka">
                <button type="button" className="zvonek" disabled aria-label="Zvonek">
                  🔔
                </button>
                <small>od {lhutaMinut - ZVONEK_PO_MINUTACH} min</small>
              </span>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
