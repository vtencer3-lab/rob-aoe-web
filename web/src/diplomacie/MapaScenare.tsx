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
 * Minimapa scénáře z rozboru (spec §5.4). Obrázek je jeden pro všechny,
 * starty jsou překryv — souřadnice 0–1 z rozboru, takže sedí při každé
 * velikosti. Barvy značek jsou třídy `barva-N` z palety, ne čísla napevno.
 */
/**
 * Start u kraje mapy dostane třídu, podle které CSS posune popisek dovnitř:
 * na LLC leží p3 a p5 12 % od levého a pravého kraje a p8 12 % od spodního,
 * kde by delší jméno vyčnívalo z mapy přes rám panelu.
 */
export function kraj(s: { x: number; y: number }): string {
  return `${s.x < 0.2 ? " kraj-levy" : s.x > 0.8 ? " kraj-pravy" : ""}${s.y > 0.85 ? " kraj-dolni" : ""}`;
}

export function MapaScenare({ verze, starty, jmena = {}, velikost = "mala" }: Props) {
  if (!verze.rozbor) return null;
  const viditelne = verze.rozbor.starty.filter((s) => starty === "vsechny" || s.barva === starty);
  return (
    <figure className={`mapa-scenare ${velikost}`}>
      <img src={diploApi.minimapaUrl(verze.id)} alt={`Mapa scénáře ${verze.jmenoSouboru}`} width={verze.rozbor.minimapa.sirka} height={verze.rozbor.minimapa.vyska} />
      {starty === "zadne"
        ? null
        : viditelne.map((s) => (
            <span key={s.barva} data-testid="start" className={`start barva-${s.barva}${kraj(s)}`} style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%` }} title={BARVA_NAZEV[s.barva]}>
              <span className="popisek">{starty === "vsechny" ? (jmena[s.barva] ?? BARVA_NAZEV[s.barva]) : "Tady začínáš"}</span>
            </span>
          ))}
    </figure>
  );
}
