import { jeAi } from "../../../src/shared/aiHraci.js";
import { Potvrzeni } from "./Potvrzeni.js";
import type { Vlastnictvi } from "../../../src/shared/types.js";
import ikonaHryUrl from "../assets/aoe2-ikona.png";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { jeAktivni, nabidnoutJsemTu, nabidnoutZvonek, zbyvaMs } from "../../../src/shared/aktivita.js";
import poplachUrl from "../assets/poplach.mp3";
import { hlasitost, prehraj } from "../zvuk.js";
import type { PlayerView } from "../../../src/shared/types.js";
import { formatElo, formatHodiny, formatOdehrano } from "../format.js";
import type { Skladani } from "../skladani.js";
import { jmenoPodKurzorem, KONEC_TAHU, tahneSe, useTahani, animovanyPosunY } from "../tahani.js";
import { StatistikyHrace } from "./StatistikyHrace.js";

interface Props {
  prihlaseni: PlayerView[];
  /**
   * Jen pro režii: tabulka je pak seznam nevybraných hráčů s tlačítkem „+“,
   * řádky jdou přetahovat a vybraní z ní odcházejí do panelu sestavy.
   */
  skladani?: Skladani;
  /**
   * Jen pro režii: kdo právě hraje běžící zápas (hracId → číslo zápasu).
   * U takového hráče je v posledním sloupci ikona zkřížených mečů, ať Rob
   * nesestavuje další zápas z lidí, kteří jsou zrovna ve hře.
   */
  vZapase?: Map<string, number>;
  /** Klíč přihlášeného návštěvníka (`hracId`): jen on u sebe vidí „Jsem tu!“. */
  ja?: string | null;
  /** Debug mód: kliknutí na ikonu hry cykluje její stavy, ať jde vidět všechny. */
  ladeni?: boolean;
  /** Admin: zvonek u hráče — svolání do radnice (poplach ve hráčově prohlížeči). */
  onSvolat?: (hracId: string) => void;
  /** Admin: super zvonek v hlavičce — svolá naráz všechny, u kterých je zvonek. */
  onSvolatVsechny?: () => void;
  /** Lhůta aktivity večera; z ní se počítá práh pro „Jsem tu!“. */
  lhutaMinut?: number;
  /** Debug: pravé tlačítko na vlastním „Jsem tu!“ předvede svolání. */
  onZkusebniSvolani?: () => void;
  /** Admin vidí odpočet u všech, ať má přehled, kdo za chvíli usne. */
  admin?: boolean;
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
 *
 * Po pěti vteřinách, ne po dvaceti: odpočet vedle si tiká po vteřinách a
 * doběhne na nulu dřív než tyhle hodiny. Do té doby se řádek tvářil jako
 * aktivní a v místě značky nebylo nic.
 */
function useTed(): number {
  const [ted, setTed] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setTed(Date.now()), 5_000);
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
 * Měří se poloha vůči tabulce, ne vůči oknu ani stránce. Vůči oknu by posun
 * přičetlo odrolování; vůči stránce zase cokoliv, co se nad tabulkou zvětší
 * nebo objeví (další zápas, panel), protože uložená poloha z minula pak už
 * neplatí. V obou případech řádek odlétal daleko mimo seznam.
 *
 * Přejíždí se i přibytí a úbytek hráče (uživatel 13. 9. 2026: „aby se zbytek
 * listu posunul plynule, a stejně tak při přihlášení“): kdo v seznamu zůstal,
 * dojede ze staré polohy na novou; kdo přibyl, se objeví prolnutím (třída
 * `pribyl`); kdo odešel, zmizí hned a řádky pod ním dojedou nahoru. Polohy se
 * měří vůči tabulce, takže změna její výšky přejezd nerozhodí.
 *
 * `poradi` je otisk pořadí; efekt se pouští jen když se opravdu změnilo.
 */
function usePresouvani(tabulka: React.RefObject<HTMLTableElement | null>, poradi: string) {
  const drive = useRef(new Map<string, number>());
  const driveSirky = useRef<number[]>([]);
  const animaceSirek = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const prvek = tabulka.current;
    if (!prvek) return;
    // Sloupce mají šířku podle obsahu; když odejde nejdelší jméno, přeskočí.
    // Hlavičky se proto změří a šířka se přejede z původní na novou — tabulka
    // si podle hlavičky srovná i buňky pod ní. Když se pořadí změní uprostřed
    // rozjetého přejezdu, vyjde se z toho, kde sloupce právě opticky jsou.
    const hlavicky = [...prvek.querySelectorAll<HTMLTableCellElement>("thead th")];
    let bylySirky = driveSirky.current;
    if (animaceSirek.current !== undefined) {
      window.clearTimeout(animaceSirek.current);
      animaceSirek.current = undefined;
      bylySirky = hlavicky.map((th) => th.getBoundingClientRect().width);
      uklidSirky(prvek, hlavicky);
    }
    const sirky = hlavicky.map((th) => th.getBoundingClientRect().width);
    driveSirky.current = sirky;
    // Během tažení se sem nesahá vůbec: řádky si posouvá pomocník tažení sám
    // a polohy naměřené uprostřed tahu by po puštění poslaly řádky jinam.
    // Uložené polohy zůstanou z doby před tahem, takže po puštění řádky
    // dojedou z původních míst na nová.
    if (tahneSe()) return;
    // Kdo si nepřeje pohyb, dostane přeskládání naráz.
    const bezPohybu = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const ramecek = prvek.getBoundingClientRect();
    const vrchTabulky = ramecek.top;
    const vyskaTabulky = ramecek.height;
    const nynejsi = new Map<string, number>();
    const radky = [...prvek.querySelectorAll<HTMLTableRowElement>("tbody > tr[data-hrac]")];
    const prvniKolo = drive.current.size === 0;
    for (const radek of radky) {
      const kdo = radek.dataset["hrac"];
      if (!kdo) continue;
      // Řádek, který ještě dojíždí z tahu (pomocník mu nechal transform), se
      // změří bez toho posunu a nechá se dojet po svém.
      const rozpracovany = radek.style.transform !== "" && radek.style.transition !== "";
      const ted = radek.getBoundingClientRect().top - vrchTabulky - (rozpracovany ? animovanyPosunY(radek) : 0);
      nynejsi.set(kdo, ted);
      const predtim = drive.current.get(kdo);
      if (rozpracovany) continue;
      // Nový řádek nemá odkud přijet — objeví se prolnutím (ne při prvním
      // vykreslení tabulky, to by blikal celý seznam). V testovacím DOM jsou
      // všechny souřadnice nulové, takže se přejezd nepustí vůbec.
      if (predtim === undefined) {
        if (!bezPohybu && !prvniKolo) {
          radek.classList.add("pribyl");
          radek.addEventListener("animationend", () => radek.classList.remove("pribyl"), { once: true });
        }
        continue;
      }
      if (bezPohybu || predtim === ted) continue;
      // Zábradlí: dál než přes celou tabulku se řádek posunout nemohl. Když
      // takový posun vyjde, je uložená poloha z jiného rozvržení a přejezd by
      // řádek poslal mimo seznam — v tom případě se prostě přeskládá.
      if (Math.abs(predtim - ted) > vyskaTabulky) continue;
      radek.style.transition = "none";
      radek.style.transform = `translateY(${predtim - ted}px)`;
      requestAnimationFrame(() => {
        radek.style.transition = `transform ${PRESUN_MS}ms ease`;
        radek.style.transform = "";
      });
    }
    drive.current = nynejsi;

    // Přejezd šířek až po změření řádků, ať se měří přirozené rozvržení.
    //
    // Po dobu přejezdu má tabulka pevné rozvržení (`table-layout: fixed`)
    // a všechny hlavičky explicitní šířku: v automatickém rozvržení si
    // prohlížeč každý snímek rozděloval šířky znovu podle obsahu, sloupec
    // nemohl pod nejdelší text a přejezd se zadrhával a přeskakoval. Šířky
    // jsou změřené včetně vnitřního okraje, proto `box-sizing: border-box`.
    if (bezPohybu || bylySirky.length !== hlavicky.length || !sirky.some((sirka, i) => Math.abs(sirka - bylySirky[i]!) > 0.5)) return;
    prvek.style.tableLayout = "fixed";
    prvek.classList.add("sirky-prejizdi");
    hlavicky.forEach((th, i) => {
      th.style.boxSizing = "border-box";
      th.style.transition = "none";
      th.style.width = `${bylySirky[i]}px`;
    });
    void prvek.offsetHeight; // reflow, ať se výchozí šířky opravdu použijí
    requestAnimationFrame(() => {
      hlavicky.forEach((th, i) => {
        th.style.transition = `width ${PRESUN_MS}ms ease`;
        th.style.width = `${sirky[i]}px`;
      });
    });
    animaceSirek.current = window.setTimeout(() => {
      animaceSirek.current = undefined;
      uklidSirky(prvek, hlavicky);
    }, PRESUN_MS + 60);
  }, [tabulka, poradi]);
}

/** Vrátí tabulce automatické rozvržení a hlavičkám šířku podle obsahu. */
function uklidSirky(tabulka: HTMLTableElement, hlavicky: HTMLTableCellElement[]) {
  tabulka.style.tableLayout = "";
  tabulka.classList.remove("sirky-prejizdi");
  for (const th of hlavicky) {
    th.style.transition = "";
    th.style.width = "";
    th.style.boxSizing = "";
  }
}

/** Jak dlouho po kliknutí je zvonek zašedlý. */
const ZVONEK_CHLADNUTI_MS = 5_000;

export function SeznamPrihlasenych({ prihlaseni, skladani, vZapase, ja, admin = false, onJsemTu, ladeni, onSvolat, onSvolatVsechny, lhutaMinut, onZkusebniSvolani }: Props) {
  // Debug: klik na ikonu hry přepne její stav jen v prohlížeči (má → nelze
  // ověřit → nemá), ať jde všechny tři podoby vidět bez cizího účtu.
  const [prepsaneHry, setPrepsaneHry] = useState<Record<string, Vlastnictvi>>({});
  const stavHry = (h: PlayerView): Vlastnictvi | null => prepsaneHry[h.hracId] ?? h.hraVlastnictvi ?? null;
  const dalsiStavHry = (h: PlayerView) => {
    const poradi: Vlastnictvi[] = ["ma", "soukromy", "nema"];
    const ted = stavHry(h) ?? "nema";
    setPrepsaneHry((p) => ({ ...p, [h.hracId]: poradi[(poradi.indexOf(ted) + 1) % poradi.length]! }));
  };
  // „Hráč nemá hru“: + zůstává klikací, ale napřed se ptá.
  const [potvrditVyber, setPotvrditVyber] = useState<PlayerView | null>(null);
  // Zvonek jde použít jednou za pět vteřin (po tu dobu je zašedlý); admin
  // sám ho slyší jen na desetinu své hlasitosti, ať ví, že odešel.
  const [zvonekChladne, setZvonekChladne] = useState<Record<string, boolean>>({});
  const zazvon = (hracId: string) => {
    if (!onSvolat || zvonekChladne[hracId]) return;
    onSvolat(hracId);
    prehraj(poplachUrl, hlasitost() * 0.3);
    setZvonekChladne((z) => ({ ...z, [hracId]: true }));
    setTimeout(() => setZvonekChladne((z) => ({ ...z, [hracId]: false })), ZVONEK_CHLADNUTI_MS);
  };
  // Super zvonek: totéž pro všechny, u kterých by byl zvonek; chladne pod
  // klíčem „*“. Ukáže se, jen když má koho svolat.
  const zazvonVsem = () => {
    if (!onSvolatVsechny || zvonekChladne["*"]) return;
    onSvolatVsechny();
    prehraj(poplachUrl, hlasitost() * 0.3);
    setZvonekChladne((z) => ({ ...z, "*": true }));
    setTimeout(() => setZvonekChladne((z) => ({ ...z, "*": false })), ZVONEK_CHLADNUTI_MS);
  };
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
      setNahled(id ? (prihlaseni.find((h) => h.hracId === id) ?? null) : null);
    };
    window.addEventListener(KONEC_TAHU, srovnej);
    return () => window.removeEventListener(KONEC_TAHU, srovnej);
  }, [prihlaseni]);
  // Řazení je jen pro režii; hráči vidí pořadí přihlášení. Usnulí jdou na
  // konec za všech okolností — i za seřazeného seznamu.
  const ted = useTed();
  const radky = podleAktivity(skladani ? serad(skladani.nevybrani, razeni) : prihlaseni, ted);
  usePresouvani(tabulka, radky.map((h) => h.hracId).join(","));

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
    <>
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
          <th className="jsem-tu-bunka" aria-label="Návrat mezi aktivní">
            {onSvolatVsechny && prihlaseni.some((h) => h.hracId !== ja && !jeAi(h.hracId) && nabidnoutZvonek(h.aktivniDo, ted, lhutaMinut)) ? (
              <button
                type="button"
                className={zvonekChladne["*"] ? "zvonek super-zvonek chladne" : "zvonek super-zvonek"}
                aria-label="Svolat všechny"
                title="Svolat do radnice všechny, u kterých je zvonek"
                disabled={Boolean(zvonekChladne["*"])}
                onClick={zazvonVsem}
              >
                <span className="dva-zvonky" aria-hidden="true">
                  <span className="zadni">🔔</span>
                  <span className="predni">🔔</span>
                </span>
              </button>
            ) : null}
          </th>
          <th aria-label="Stav hráče" />
        </tr>
      </thead>
      <tbody>
        {radky.map((hrac) => {
          const jmeno = hrac.alias ?? hrac.platformaJmeno ?? hrac.hracId;
          // Přetahovat jde jen ve vlastním pořadí — v seřazeném seznamu by
          // přesun nebyl vidět.
          // Aktivní se řadí jen mezi aktivními, spící mezi spícími — v seznamu
          // jsou tak stejně oddělení, ať je pořadí v paměti jakékoli.
          const tah = skladani && !razeni ? tahani("nevybrani", hrac.hracId, jeAktivni(hrac.aktivniDo, ted) ? "aktivni" : "spici") : {};
          return (
            <tr
              key={hrac.hracId}
              data-hrac={hrac.hracId}
              className={[jeAktivni(hrac.aktivniDo, ted) ? "" : "spici", hrac.hracId === ja ? "muj-radek" : ""]
                .filter(Boolean)
                .join(" ")}
              {...tah}
            >
              {skladani ? (
                <td className="vybrat">
                  <button
                    type="button"
                    className={stavHry(hrac) === "nema" ? "plus bez-hry" : "plus"}
                    aria-label={`Vybrat hráče ${jmeno}`}
                    title={stavHry(hrac) === "nema" ? "Hráč nemá hru na svém účtě" : "Vybrat hráče"}
                    onClick={() => (stavHry(hrac) === "nema" ? setPotvrditVyber(hrac) : skladani.vyber(hrac.hracId))}
                  >
                    +
                  </button>
                </td>
              ) : null}
              <td>
                <span
                  className="jmeno-hrace"
                  data-jmeno-hrace={hrac.hracId}
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
                  <OdznakHry stav={stavHry(hrac)} platforma={hrac.platforma} onKlik={ladeni ? () => dalsiStavHry(hrac) : undefined} />
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
              {/* Bez avataru se platformy nikdo nezeptal (chybí Steam klíč,
                  nebo dotaz selhal) — pak NULL neznamená skrytý profil, ale
                  „nevíme“. Microsoft hodiny nezveřejňuje vůbec, tam je pomlčka
                  správná odpověď i s avatarem. */}
              <td>{hrac.steamHodiny !== null || hrac.avatarUrl ? formatHodiny(hrac.steamHodiny) : "—"}</td>
              {/* Tlačítko a značka mají vlastní sloupce. V jednom by šířka
                  tlačítka odsouvala odpočet a ten by se řádek od řádku
                  neshodoval. */}
              <td className="jsem-tu-bunka">
                {ja === hrac.hracId && onJsemTu && nabidnoutJsemTu(hrac.aktivniDo, ted, lhutaMinut) ? (
                  <button
                    type="button"
                    className="jsem-tu"
                    title={onZkusebniSvolani ? "Vrátí tě mezi aktivní hráče (pravé tlačítko: předvést svolání)" : "Vrátí tě mezi aktivní hráče"}
                    onClick={onJsemTu}
                    onContextMenu={(e) => {
                      if (!onZkusebniSvolani) return;
                      e.preventDefault();
                      e.stopPropagation();
                      onZkusebniSvolani();
                    }}
                  >
                    Jsem tu!
                  </button>
                ) : onSvolat && ja !== hrac.hracId && !jeAi(hrac.hracId) && nabidnoutZvonek(hrac.aktivniDo, ted, lhutaMinut) ? (
                  <button
                    type="button"
                    className={zvonekChladne[hrac.hracId] ? "zvonek chladne" : "zvonek"}
                    aria-label={`Svolat hráče ${jmeno}`}
                    title="Svolat do radnice — hráči zazvoní poplach"
                    disabled={Boolean(zvonekChladne[hrac.hracId])}
                    onClick={() => zazvon(hrac.hracId)}
                  >
                    🔔
                  </button>
                ) : null}
              </td>
              <td className="hraje">
                <span className="stav-znacka">
                  <ZnackaHrace
                    hrac={hrac}
                    ted={ted}
                    vlastni={ja !== null && ja !== undefined && ja === hrac.hracId}
                    admin={admin}
                    vZapase={vZapase}
                  />
                </span>
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
      {potvrditVyber && skladani ? (
        <Potvrzeni
          text="Hráč nemá hru na svém účtě. Opravdu přidat?"
          potvrdit="Přidat"
          zrusit="Zrušit"
          onPotvrdit={() => {
            skladani.vyber(potvrditVyber.hracId);
            setPotvrditVyber(null);
          }}
          onZrusit={() => setPotvrditVyber(null)}
        />
      ) : null}
    </>
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
  return (
    <span className="muj-cas napoveda" data-napoveda="Za jak dlouho tě seznam odsune mezi neaktivní">
      {formatOdpoctu(zbyva)}
    </span>
  );
}

/**
 * Odpočet jako „09:59“. Minuty vždy na dvě číslice, aby se šířka buňky s každou
 * vteřinou neměnila a tabulka pod ní neposkakovala.
 *
 * Doběhlý odpočet ukazuje nuly, ne prázdno: značku „Zzz“ nasadí až seznam,
 * který tiká pomaleji, a do té chvíle musí být vidět, že čas došel.
 */
export function formatOdpoctu(zbyvaMs: number): string {
  const vteriny = Math.max(0, Math.ceil(zbyvaMs / 1000));
  return `${String(Math.floor(vteriny / 60)).padStart(2, "0")}:${String(vteriny % 60).padStart(2, "0")}`;
}

/** Doba slovy: „7 min“, „1 h 20 min“. Pod minutu se přesnost nehodí ani nezajímá. */
function trvani(ms: number): string {
  const minut = Math.floor(ms / 60_000);
  if (minut < 1) return "necelou minutu";
  if (minut < 60) return `${minut} min`;
  const zbytek = minut % 60;
  return zbytek === 0 ? `${Math.floor(minut / 60)} h` : `${Math.floor(minut / 60)} h ${zbytek} min`;
}

/**
 * Značka stavu v posledním sloupci: meče, odpočet, nebo „Zzz“.
 *
 * Sloupec je jen pro ni a má pevnou šířku, takže značky stojí pod sebou, ať je
 * u koho která. Tlačítko „Jsem tu!“ má vlastní sloupec vedle — v jednom by
 * jeho šířka odpočet odsouvala.
 *
 * Odpočet vidí hráč u sebe a admin u všech: potřebuje přehled, kdo za chvíli
 * usne, a zkušební hráči mají lhůtu jako každý jiný. Kdo už spí, má místo
 * čísel „Zzz“; zkřížené meče jdou před obojím, protože „hraje zápas“ je pro
 * sestavování důležitější než lhůta.
 */
function ZnackaHrace({
  hrac,
  ted,
  vlastni,
  admin,
  vZapase,
}: {
  hrac: PlayerView;
  ted: number;
  vlastni: boolean;
  admin: boolean;
  vZapase?: Map<string, number>;
}) {
  const zapas = vZapase?.get(hrac.hracId);
  if (zapas !== undefined) {
    // Meče zaberou místo odpočtu i „Zzz“, tak lhůta zůstává aspoň v bublině:
    // kdo v zápase usnul, má tam i jak dlouho. Kdo je v lhůtě, nic navíc.
    const spi = !jeAktivni(hrac.aktivniDo, ted);
    const pryc = spi ? -(zbyvaMs(hrac.aktivniDo, ted) ?? 0) : 0;
    const popis = spi ? `Právě hraje zápas #${zapas}\nNeaktivní ${trvani(pryc)}` : `Právě hraje zápas #${zapas}`;
    // Vlastní bublina místo `data-napoveda`: dvě informace v jedné bublině
    // dostanou mezi sebou oddělovač, což atribut neumí.
    return (
      <span className="mece napoveda-vlastni" role="img" aria-label={popis}>
        ⚔
        <span className="bublina" aria-hidden="true">
          <span>Právě hraje zápas #{zapas}</span>
          {spi ? (
            <>
              <hr />
              <span>Neaktivní {trvani(pryc)}</span>
            </>
          ) : null}
        </span>
      </span>
    );
  }
  if (!jeAktivni(hrac.aktivniDo, ted)) {
    // Jak dlouho už spí: kladné číslo je doba od vypršení lhůty.
    const pryc = -(zbyvaMs(hrac.aktivniDo, ted) ?? 0);
    const popis = `Neaktivní ${trvani(pryc)}`;
    return (
      <span className="spi napoveda" role="img" aria-label={popis} data-napoveda={popis}>
        Zzz
      </span>
    );
  }
  if ((vlastni || admin) && hrac.aktivniDo) return <MujCas aktivniDo={hrac.aktivniDo} />;
  return null;
}

/**
 * Co která platforma o hře doopravdy říká. Ptáme se jinde a hráči se to má
 * říct tak, jak to je: u Steamu rozhoduje knihovna účtu, u Microsoftu herní
 * historie Xbox profilu (vlastnictví se u něj zjistit nedá, viz návrh §6.1).
 * Společné oběma je „tuhle hru na tomhle účtu hrál“ — a přesně tohle ikona
 * znamená.
 */
const POPIS_HRY: Record<"steam" | "xbox", Record<Vlastnictvi, string>> = {
  steam: {
    ma: "Hru má v knihovně na Steamu",
    soukromy: "Knihovna na Steamu je skrytá, ověřit hru nejde",
    nema: "V knihovně na Steamu tahle hra není",
  },
  xbox: {
    ma: "Hru na tomhle Microsoft účtu hrál",
    soukromy: "Herní historie na Microsoft účtu je skrytá, ověřit hru nejde",
    nema: "V herní historii Microsoft účtu tahle hra není",
  },
};

/**
 * Ikona hry vedle jména: potvrzení, že hráč AoE2 na svém účtu má (Steam) nebo
 * hrál (Microsoft). Skryté soukromí dostane siluetu s tichým otazníkem
 * (ověřit nejde), účet bez hry ikonu s vykřičníkem — to je stav, na který má
 * Rob přijít před večerem, ne až v lobby. Dokud platforma nic neřekla (bez
 * Steam klíče, před prvním stažením), nic.
 */
function OdznakHry({
  stav,
  platforma,
  onKlik,
}: {
  stav: Vlastnictvi | null;
  /** Chybí u starších snímků a zástupných hráčů; Steam je ta cesta, co tu byla vždycky. */
  platforma?: "steam" | "xbox";
  onKlik?: () => void;
}) {
  if (stav === null) return null;
  const popis = POPIS_HRY[platforma === "xbox" ? "xbox" : "steam"][stav];
  return (
    <span
      className={`odznak-hry ${stav} napoveda${onKlik ? " klikaci" : ""}`}
      role="img"
      aria-label={popis}
      data-napoveda={popis}
      data-testid="odznak-hry"
      onClick={(e) => {
        if (!onKlik) return;
        e.stopPropagation();
        onKlik();
      }}
    >
      <img src={ikonaHryUrl} alt="" width={18} height={18} />
      {stav === "soukromy" ? <span className="znacka" aria-hidden="true">?</span> : null}
      {stav === "nema" ? <span className="znacka" aria-hidden="true">!</span> : null}
    </span>
  );
}
