import { createPortal } from "react-dom";
import { useState, type CSSProperties } from "react";
import { LHUTA_MAX_MINUT, LHUTA_MIN_MINUT, ZVONEK_PO_MINUTACH } from "../../../src/shared/aktivita.js";
import chatUrl from "../assets/chat.mp3";
import zvonUrl from "../assets/zvon.mp3";
import { nastavZesileniMikrofonu, VYCHOZI_ZESILENI, ZESILENI_MAX, ZESILENI_MIN } from "../hlas.js";
import { useZamekScrollu } from "../zamekScrollu.js";
import { hlasitostUdalosti, nastavHlasitost, nastavHlasitostChatu, prehraj } from "../zvuk.js";

interface Props {
  /** Master Volume, 0–100. */
  hlasitost: number;
  onHlasitost: (procent: number) => void;
  /** Podíl chatu z Master Volume, 0–100 (výchozí 50). */
  hlasitostChatu: number;
  onHlasitostChatu: (procent: number) => void;
  /** Jen admin (push-to-talk): zesílení mikrofonu v procentech, 100–400. */
  zesileniMikrofonu?: number;
  onZesileniMikrofonu?: (procent: number) => void;
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
export function NastaveniUzivatele({ hlasitost, onHlasitost, hlasitostChatu, onHlasitostChatu, zesileniMikrofonu, onZesileniMikrofonu, lhutaMinut, onLhuta, onZavrit }: Props) {
  useZamekScrollu();
  const [master, setMaster] = useState(hlasitost);
  const [chat, setChat] = useState(hlasitostChatu);
  const [mikrofon, setMikrofon] = useState(zesileniMikrofonu ?? VYCHOZI_ZESILENI);
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
        {/* Master Volume je strop, chat z něj bere svůj podíl: 70 % × 50 % = 35 %.
            Každý posuvník se po puštění zkusí zvukem, který řídí. */}
        <Posuvnik
          popisek="Master Volume"
          info="Neovlivňuje hlasitost svolávání — poplach od admina zazvoní vždy naplno."
          hodnota={master}
          onZmena={(v) => {
            setMaster(v);
            nastavHlasitost(v);
            onHlasitost(v);
          }}
          onZkouska={() => prehraj(zvonUrl, master)}
        />
        <Posuvnik
          popisek="Hlasitost chatu"
          hodnota={chat}
          onZmena={(v) => {
            setChat(v);
            nastavHlasitostChatu(v);
            onHlasitostChatu(v);
          }}
          onZkouska={() => prehraj(chatUrl, hlasitostUdalosti(chat, master))}
        />
        {zesileniMikrofonu !== undefined && onZesileniMikrofonu ? (
          <Posuvnik
            popisek="Zesílení mikrofonu"
            info="Jen pro tvůj push-to-talk: 100 % je mikrofon tak, jak ho slyší systém. Vyšší hodnota zesílí tichý mikrofon; přebuzení hlídá limiter."
            hodnota={mikrofon}
            min={ZESILENI_MIN}
            max={ZESILENI_MAX}
            krok={5}
            onZmena={(v) => {
              setMikrofon(v);
              nastavZesileniMikrofonu(v);
              onZesileniMikrofonu(v);
            }}
          />
        ) : null}
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

interface PosuvnikProps {
  popisek: string;
  hodnota: number;
  onZmena: (procent: number) => void;
  /** Po puštění (myš, klávesa) se zvuk zkusí; bez toho se jen posouvá. */
  onZkouska?: () => void;
  /** Kroužek (i) za popiskem s bublinou. */
  info?: string;
  /** Rozsah a krok; výchozí 0–100 po jednom procentu. */
  min?: number;
  max?: number;
  krok?: number;
}

function Posuvnik({ popisek, hodnota, onZmena, onZkouska, info, min = 0, max = 100, krok = 1 }: PosuvnikProps) {
  const podil = ((hodnota - min) / (max - min)) * 100;
  return (
    <label className="radek-nastaveni">
      <span>
        {popisek}
        {info ? (
          <span className="info napoveda" data-napoveda={info} role="img" aria-label={info} tabIndex={0}>
            i
          </span>
        ) : null}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={krok}
        value={hodnota}
        style={{ "--podil": `${podil}%` } as CSSProperties}
        aria-label={popisek}
        onChange={(e) => onZmena(Number(e.target.value))}
        onMouseUp={onZkouska}
        onKeyUp={onZkouska}
        onWheel={(e) => {
          // Kolečko po kroku (uživatel); hodnota se uloží jako při tažení.
          // Fokus, ať se ukáže rámeček jako při kliknutí.
          e.currentTarget.focus();
          e.preventDefault();
          onZmena(Math.min(max, Math.max(min, hodnota + (e.deltaY < 0 ? krok : -krok))));
        }}
      />
      <output>{hodnota} %</output>
    </label>
  );
}
