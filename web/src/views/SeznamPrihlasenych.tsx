import { useEffect, useRef, useState } from "react";
import type { PlayerView } from "../../../src/shared/types.js";
import { formatElo, formatHodiny, formatOdehrano } from "../format.js";
import type { Skladani } from "../skladani.js";
import { jmenoPodKurzorem, KONEC_TAHU, tahneSe, useTahani } from "../tahani.js";
import { StatistikyHrace } from "./StatistikyHrace.js";

interface Props {
  prihlaseni: PlayerView[];
  /**
   * Jen pro režii: tabulka je pak seznam nevybraných hráčů s tlačítkem „+“,
   * řádky jdou přetahovat a vybraní z ní odcházejí do panelu sestavy.
   */
  skladani?: Skladani;
  /**
   * Jen pro režii: kdo právě hraje běžící zápas (steamId → číslo zápasu).
   * U takového hráče je v posledním sloupci ikona zkřížených mečů, ať Rob
   * nesestavuje další zápas z lidí, kteří jsou zrovna ve hře.
   */
  vZapase?: Map<string, number>;
}

type Sloupec = "elo1v1" | "eloNejvyssi" | "odehranoHer" | "steamHodiny";
type Smer = "asc" | "desc";
interface Razeni {
  sloupec: Sloupec;
  smer: Smer;
}

const SLOUPCE: ReadonlyArray<{ klic: Sloupec; popis: string }> = [
  { klic: "elo1v1", popis: "1v1 ELO" },
  { klic: "eloNejvyssi", popis: "Nejvýš" },
  { klic: "odehranoHer", popis: "Odehráno" },
  { klic: "steamHodiny", popis: "Hodin ve hře" },
];

const KLIC_RAZENI = "rezie.razeni";

function nactiRazeni(): Razeni | null {
  try {
    const raw = localStorage.getItem(KLIC_RAZENI);
    return raw ? (JSON.parse(raw) as Razeni) : null;
  } catch {
    return null;
  }
}

/** Kliknutí na hlavičku jde dokola: vzestupně → sestupně → vlastní pořadí (přetažením). */
function dalsiRazeni(soucasne: Razeni | null, sloupec: Sloupec): Razeni | null {
  if (soucasne?.sloupec !== sloupec) return { sloupec, smer: "asc" };
  if (soucasne.smer === "asc") return { sloupec, smer: "desc" };
  return null;
}

/** Seřazení podle sloupce; kdo hodnotu nemá („—“), jde vždy na konec. */
export function serad(hraci: PlayerView[], razeni: Razeni | null): PlayerView[] {
  if (!razeni) return hraci;
  const znamenko = razeni.smer === "asc" ? 1 : -1;
  return [...hraci].sort((a, b) => {
    const x = a[razeni.sloupec];
    const y = b[razeni.sloupec];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * znamenko;
  });
}

export function SeznamPrihlasenych({ prihlaseni, skladani, vZapase }: Props) {
  const tahani = useTahani(skladani?.presun ?? (() => {}));
  const [razeni, setRazeni] = useState<Razeni | null>(() => (skladani ? nactiRazeni() : null));
  const tabulka = useRef<HTMLTableElement>(null);
  // Najetí na jméno ukáže kartu se statistikami v rohu okna.
  const [nahled, setNahled] = useState<PlayerView | null>(null);
  // Po tažení se karta srovná podle toho, kde kurzor opravdu skončil —
  // najetí/odjetí se během tahu ignorovalo, takže by jinak mohla zůstat viset.
  useEffect(() => {
    const srovnej = (e: Event) => {
      const id = jmenoPodKurzorem(e, tabulka.current);
      setNahled(id ? (prihlaseni.find((h) => h.steamId === id) ?? null) : null);
    };
    window.addEventListener(KONEC_TAHU, srovnej);
    return () => window.removeEventListener(KONEC_TAHU, srovnej);
  }, [prihlaseni]);
  // Řazení je jen pro režii; hráči vidí pořadí přihlášení.
  const radky = skladani ? serad(skladani.nevybrani, razeni) : prihlaseni;

  const prepni = (sloupec: Sloupec) => {
    const nove = dalsiRazeni(razeni, sloupec);
    setRazeni(nove);
    try {
      if (nove) localStorage.setItem(KLIC_RAZENI, JSON.stringify(nove));
      else localStorage.removeItem(KLIC_RAZENI);
    } catch {
      // Bez úložiště se řazení po obnovení stránky vrátí na vlastní pořadí.
    }
  };

  if (prihlaseni.length === 0) {
    return <p className="prazdno">Zatím se nikdo nepřihlásil.</p>;
  }
  if (radky.length === 0) {
    return <p className="prazdno">Všichni přihlášení jsou v sestavě.</p>;
  }

  return (
    <table className={skladani ? "seznam seznam-rezie" : "seznam"} ref={tabulka}>
      <thead>
        <tr>
          {skladani ? <th aria-label="Vybrat do sestavy" /> : null}
          <th>Hráč</th>
          {SLOUPCE.map(({ klic, popis }) => {
            const aktivni = razeni?.sloupec === klic ? razeni.smer : null;
            return (
              <th key={klic} aria-sort={aktivni === "asc" ? "ascending" : aktivni === "desc" ? "descending" : "none"}>
                {skladani ? (
                  <button
                    type="button"
                    className={aktivni ? "razeni aktivni" : "razeni"}
                    title="Klik: vzestupně → sestupně → vlastní pořadí"
                    onClick={() => prepni(klic)}
                  >
                    {popis}
                    <span className="sipka-razeni" aria-hidden="true">
                      {aktivni === "asc" ? "▲" : aktivni === "desc" ? "▼" : "⇅"}
                    </span>
                  </button>
                ) : (
                  popis
                )}
              </th>
            );
          })}
          {skladani ? <th aria-label="Právě hraje" /> : null}
        </tr>
      </thead>
      <tbody>
        {radky.map((hrac) => {
          const jmeno = hrac.alias ?? hrac.steamName ?? hrac.steamId;
          // Přetahovat jde jen ve vlastním pořadí — v seřazeném seznamu by
          // přesun nebyl vidět.
          const tah = skladani && !razeni ? tahani("nevybrani", hrac.steamId) : {};
          return (
            <tr key={hrac.steamId} {...tah}>
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
                <span
                  className="jmeno-hrace"
                  data-jmeno-hrace={hrac.steamId}
                  data-testid="jmeno-hrace"
                  onPointerEnter={() => {
                    if (!tahneSe()) setNahled(hrac);
                  }}
                  onPointerLeave={() => {
                    if (!tahneSe()) setNahled(null);
                  }}
                  onFocus={() => setNahled(hrac)}
                  onBlur={() => setNahled(null)}
                  tabIndex={0}
                >
                  {hrac.avatarUrl ? <img src={hrac.avatarUrl} alt="" width={28} height={28} /> : null}
                  {jmeno}
                </span>
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
              {skladani ? (
                <td className="hraje">
                  {vZapase?.has(hrac.steamId) ? (
                    <span className="mece" role="img" aria-label={`Právě hraje zápas #${vZapase.get(hrac.steamId)}`} title={`Právě hraje zápas #${vZapase.get(hrac.steamId)}`}>
                      ⚔
                    </span>
                  ) : null}
                </td>
              ) : null}
            </tr>
          );
        })}
      </tbody>
      {nahled ? (
        <tfoot>
          <tr>
            <td colSpan={99} style={{ padding: 0, border: "none" }}>
              <StatistikyHrace hrac={nahled} />
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}
