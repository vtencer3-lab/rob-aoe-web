import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { jeAktivni, nabidnoutJsemTu, zbyvaMs } from "../../../src/shared/aktivita.js";
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
  /** Steam ID přihlášeného návštěvníka: jen on u sebe vidí „Jsem tu!“. */
  ja?: string | null;
  /** Kliknutí na „Jsem tu!“ — vrátí hráči plnou lhůtu aktivity. */
  onJsemTu?: () => void;
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

/**
 * Neaktivní hráči na konec, mezi sebou i uvnitř aktivních pořadí zůstává.
 * Vrací původní pole, když nikdo neusnul — ať se seznam zbytečně nepřekresluje.
 */
export function podleAktivity(hraci: PlayerView[], ted: number): PlayerView[] {
  const spici = hraci.filter((h) => !jeAktivni(h.aktivniDo, ted));
  if (spici.length === 0) return hraci;
  return [...hraci.filter((h) => jeAktivni(h.aktivniDo, ted)), ...spici];
}

/**
 * Hodiny, které tikají samy. Lhůta aktivity vyprší tichým během času, ne
 * zápisem do databáze — bez vlastního tikání by hráč ztmavl až s příští
 * zprávou ze serveru, tedy klidně za půl hodiny.
 */
function useTed(): number {
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTed(Date.now()), 20_000);
    return () => clearInterval(id);
  }, []);
  return ted;
}

/** Doba přejezdu řádku na nové místo. Delší už působí, že tabulka zlobí. */
const PRESUN_MS = 340;

/**
 * Přejezd řádků na nové místo místo skoku (technika FLIP).
 *
 * Když hráč usne, propadne na konec seznamu — a bez animace to vypadá, jako by
 * se tabulka sama přeskládala. Změřit se to musí ve stejném snímku, ve kterém
 * React vykreslil nové pořadí: řádek se posune zpátky tam, kde byl, a hned se
 * nechá dojet na nové místo.
 *
 * Měří se `offsetTop`, tedy poloha uvnitř tabulky, ne `getBoundingClientRect`.
 * Ta je vůči oknu, takže odrolování stránky mezi dvěma měřeními přičetlo všem
 * řádkům posun, který se nikdy nestal — a ty pak odlétaly ven ze seznamu.
 *
 * `poradi` je otisk pořadí; efekt se pouští jen když se opravdu změnilo.
 */
function usePresouvani(tabulka: React.RefObject<HTMLTableElement | null>, poradi: string) {
  const drive = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const prvek = tabulka.current;
    if (!prvek) return;
    // Kdo si nepřeje pohyb, dostane přeskládání naráz. Během tažení taky ne:
    // řádek pod kurzorem má jít za myší, ne si dojíždět po svém.
    const bezPohybu = (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false) || tahneSe();
    const nynejsi = new Map<string, number>();
    for (const radek of prvek.querySelectorAll<HTMLTableRowElement>("tbody > tr[data-hrac]")) {
      const kdo = radek.dataset["hrac"];
      if (!kdo) continue;
      const ted = radek.offsetTop;
      nynejsi.set(kdo, ted);
      const predtim = drive.current.get(kdo);
      // Nový řádek nemá odkud přijet; nulový posun není co animovat. V testovacím
      // DOM jsou všechny souřadnice nulové, takže se animace nepustí vůbec.
      if (bezPohybu || predtim === undefined || predtim === ted) continue;
      radek.style.transition = "none";
      radek.style.transform = `translateY(${predtim - ted}px)`;
      requestAnimationFrame(() => {
        radek.style.transition = `transform ${PRESUN_MS}ms ease`;
        radek.style.transform = "";
      });
    }
    drive.current = nynejsi;
  }, [tabulka, poradi]);
}

export function SeznamPrihlasenych({ prihlaseni, skladani, vZapase, ja, onJsemTu }: Props) {
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
  // Řazení je jen pro režii; hráči vidí pořadí přihlášení. Usnulí jdou na
  // konec za všech okolností — i za seřazeného seznamu.
  const ted = useTed();
  const radky = podleAktivity(skladani ? serad(skladani.nevybrani, razeni) : prihlaseni, ted);
  usePresouvani(tabulka, radky.map((h) => h.steamId).join(","));

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
          <th aria-label="Stav hráče" />
        </tr>
      </thead>
      <tbody>
        {radky.map((hrac) => {
          const jmeno = hrac.alias ?? hrac.steamName ?? hrac.steamId;
          // Přetahovat jde jen ve vlastním pořadí — v seřazeném seznamu by
          // přesun nebyl vidět.
          const tah = skladani && !razeni ? tahani("nevybrani", hrac.steamId) : {};
          return (
            <tr
              key={hrac.steamId}
              data-hrac={hrac.steamId}
              className={[jeAktivni(hrac.aktivniDo, ted) ? "" : "spici", hrac.steamId === ja ? "muj-radek" : ""]
                .filter(Boolean)
                .join(" ")}
              {...tah}
            >
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
              <td className="hraje">
                <StavHrace
                  hrac={hrac}
                  ted={ted}
                  jsemTo={ja !== null && ja !== undefined && ja === hrac.steamId}
                  vZapase={vZapase}
                  onJsemTu={onJsemTu}
                />
              </td>
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

/**
 * Odpočet vlastní lhůty. Tiká po vteřinách sám za sebe: tabulka se překresluje
 * po dvaceti a odpočet po vteřinách by ji hnal zbytečně celou.
 */
function MujCas({ aktivniDo }: { aktivniDo: string }) {
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTed(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const zbyva = zbyvaMs(aktivniDo, ted) ?? 0;
  if (zbyva <= 0) return null;
  // Minuty vždy na dvě číslice: „09:59“ je stejně široké jako „14:56“, takže
  // odpočet každou vteřinu nemění šířku sloupce a tabulka pod ním neposkakuje.
  const vteriny = Math.ceil(zbyva / 1000);
  const text = `${String(Math.floor(vteriny / 60)).padStart(2, "0")}:${String(vteriny % 60).padStart(2, "0")}`;
  return (
    <span className="muj-cas" title="Za jak dlouho tě seznam odsune mezi neaktivní">
      {text}
    </span>
  );
}

/**
 * Poslední sloupec tabulky: co je s hráčem teď.
 *
 * Vlastní usnulý řádek má přednost před vším ostatním — kdo usnul, potřebuje
 * hlavně cestu zpátky, ne informaci, že spí. Jinak jdou zkřížené meče před
 * ikonou spáče: že je někdo ve hře, je pro sestavování důležitější.
 */
function StavHrace({
  hrac,
  ted,
  jsemTo,
  vZapase,
  onJsemTu,
}: {
  hrac: PlayerView;
  ted: number;
  jsemTo: boolean;
  vZapase?: Map<string, number>;
  onJsemTu?: () => void;
}) {
  const spi = !jeAktivni(hrac.aktivniDo, ted);
  const zapas = vZapase?.get(hrac.steamId);
  const mece =
    zapas === undefined ? null : (
      <span className="mece" role="img" aria-label={`Právě hraje zápas #${zapas}`} title={`Právě hraje zápas #${zapas}`}>
        ⚔
      </span>
    );

  // Vlastní řádek: odpočet vlastní lhůty a od minuty po obnovení i tlačítko.
  // Cizí řádek cizí čas nezajímá, tam zůstává ikona spáče.
  if (jsemTo && hrac.aktivniDo) {
    return (
      <span className="muj-stav">
        {mece}
        {/* Tlačítko před odpočtem: úplně vpravo pak stojí buď odpočet, nebo
            „Zzz“ ostatních řádků, takže sloupec lícuje a tlačítko nemění
            polohu podle toho, jak jsou čísla široká. */}
        {onJsemTu && nabidnoutJsemTu(hrac.aktivniDo, ted) ? (
          <button type="button" className="jsem-tu" title="Vrátí tě mezi aktivní hráče" onClick={onJsemTu}>
            Jsem tu!
          </button>
        ) : null}
        <MujCas aktivniDo={hrac.aktivniDo} />
      </span>
    );
  }

  if (mece) return mece;
  if (!spi) return null;
  return (
    <span className="spi" role="img" aria-label="Delší dobu neaktivní" title="Delší dobu neaktivní">
      Zzz
    </span>
  );
}
