import { BARVA_NAZEV, type Barva } from "../../../src/shared/types.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { diploApi } from "./api.js";

interface Props {
  verze: ScenarVerze;
  /** Kterou pozici ukázat: žádnou (nastavení lobby), všechny (GM), nebo jen svou (hráč). */
  starty: "zadne" | "vsechny" | Barva;
  jmena?: Partial<Record<Barva, string>>;
  velikost?: "mala" | "velka";
}

/**
 * Start u levého nebo pravého kraje mapy dostane třídu, podle které CSS
 * zakotví popisek k vnitřní straně značky: na LLC leží p3 a p5 12 % od
 * kraje, kde by delší jméno vyčnívalo z mapy přes rám panelu. Spodní kraj
 * (p8) třídu nemá — popisek pod značkou se vejde i na telefonu a nad
 * značkou by narazil do popisku p6.
 */
export function kraj(x: number): string {
  return x < 0.2 ? " kraj-levy" : x > 0.8 ? " kraj-pravy" : "";
}

/**
 * Minimapa scénáře z rozboru (spec §5.4). Obrázek je jeden pro všechny,
 * starty jsou překryv — souřadnice 0–1 z rozboru, takže sedí při každé
 * velikosti. Barvy značek jsou třídy `barva-N` z palety, ne čísla napevno.
 */
export function MapaScenare({ verze, starty, jmena = {}, velikost = "mala" }: Props) {
  if (!verze.rozbor) return null;
  const viditelne = verze.rozbor.starty.filter((s) => starty === "vsechny" || s.barva === starty);
  return (
    <figure className={`mapa-scenare ${velikost}`}>
      <img src={diploApi.minimapaUrl(verze.id)} alt={`Mapa scénáře ${verze.jmenoSouboru}`} width={verze.rozbor.minimapa.sirka} height={verze.rozbor.minimapa.vyska} />
      {starty === "zadne"
        ? null
        : viditelne.map((s) => (
            <span key={s.barva} data-testid="start" className={`start barva-${s.barva}${kraj(s.x)}`} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} title={BARVA_NAZEV[s.barva]}>
              <span className="popisek">{starty === "vsechny" ? (jmena[s.barva] ?? BARVA_NAZEV[s.barva]) : "Tady začínáš"}</span>
            </span>
          ))}
    </figure>
  );
}
