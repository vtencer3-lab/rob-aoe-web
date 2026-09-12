import { useEffect, useMemo, useRef, useState } from "react";
import { MAPY, nazevMapy } from "../../../src/shared/mapy.js";
import { nahledMapy } from "../mapyNahledy.js";

interface Props {
  /** Vybraná mapa; null = libovolná. */
  hodnota: number | null;
  onVybrat: (id: number | null) => void;
  onZavrit: () => void;
}

/** Mapy podle jména, jak je řadí čeština; „libovolná“ jde zvlášť před ně. */
const MAPY_PODLE_JMENA = Object.entries(MAPY)
  .map(([id, nazev]) => ({ id: Number(id), nazev }))
  .sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));

/** Hledání bez ohledu na velikost písmen a diakritiku: „cerna“ najde „Černá“. */
function zjednodus(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Okno s výběrem mapy: mřížka minimap jako ve hře a vyhledávání nad ní. Pole
 * „Location“ vypadá dál jako rozbalovací seznam, jen se místo seznamu jmen
 * otevře tohle — u dvou set map řekne obrázek víc než jméno. Enter ve
 * vyhledávání vezme první nalezenou, Escape zavře bez změny.
 */
export function VyberMapy({ hodnota, onVybrat, onZavrit }: Props) {
  const [hledani, setHledani] = useState("");
  const pole = useRef<HTMLInputElement>(null);
  useEffect(() => {
    pole.current?.focus();
  }, []);
  useEffect(() => {
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZavrit();
    };
    window.addEventListener("keydown", klavesa);
    return () => window.removeEventListener("keydown", klavesa);
  }, [onZavrit]);

  const dotaz = zjednodus(hledani.trim());
  const nalezene = useMemo(
    () => (dotaz === "" ? MAPY_PODLE_JMENA : MAPY_PODLE_JMENA.filter((m) => zjednodus(m.nazev).includes(dotaz))),
    [dotaz],
  );
  const libovolnaSedi = dotaz === "" || zjednodus("libovolná").includes(dotaz);

  return (
    <div
      className="prelobby-stin"
      data-testid="vyber-mapy-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div className="prelobby-okno vyber-mapy" role="dialog" aria-modal="true" aria-label="Výběr mapy" data-testid="vyber-mapy">
        <header className="hlavicka-akce">
          <h2>Location</h2>
          <button type="button" className="zavrit" aria-label="Zavřít" onClick={onZavrit}>
            ✕
          </button>
        </header>
        <input
          ref={pole}
          type="search"
          className="hledani-map"
          placeholder="Hledat mapu…"
          aria-label="Hledat mapu"
          value={hledani}
          onChange={(e) => setHledani(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter") return;
            e.preventDefault();
            if (libovolnaSedi && dotaz !== "") onVybrat(null);
            else if (nalezene[0]) onVybrat(nalezene[0].id);
          }}
        />
        <div className="mrizka-map" role="listbox" aria-label="Mapy">
          {libovolnaSedi ? (
            <button
              type="button"
              role="option"
              aria-selected={hodnota === null}
              className={hodnota === null ? "mapa aktivni" : "mapa"}
              onClick={() => onVybrat(null)}
            >
              <span className="nahled bez" aria-hidden="true">
                ?
              </span>
              <span className="jmeno">{nazevMapy(null)}</span>
            </button>
          ) : null}
          {nalezene.map((m) => {
            const nahled = nahledMapy(m.id);
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={hodnota === m.id}
                className={hodnota === m.id ? "mapa aktivni" : "mapa"}
                onClick={() => onVybrat(m.id)}
              >
                {nahled ? (
                  <img className="nahled" src={nahled} alt="" width={96} height={96} loading="lazy" />
                ) : (
                  <span className="nahled bez" aria-hidden="true">
                    –
                  </span>
                )}
                <span className="jmeno">{m.nazev}</span>
              </button>
            );
          })}
          {!libovolnaSedi && nalezene.length === 0 ? <p className="nic">Žádná mapa neodpovídá.</p> : null}
        </div>
      </div>
    </div>
  );
}
