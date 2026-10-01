import type { DiploData, StavDiplo } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { jmenoVZapasu } from "../zapas.js";
import { diploZapasu } from "./KartaRole.js";

/** Stav zápasu pro diváka i Roba v režii: ať je při streamu vidět, jestli už role došly. */
const POPIS_STAVU: Record<StavDiplo, string> = { priprava: "příprava", losovano: "role rozdány", rozeslano: "role rozeslány" };

/**
 * Zápas Diplomacie očima diváka: jen to, co je veřejné (spec §8.2) — stav a
 * po rozeslání jméno Nástupce. Totéž vidí admin v režii pod hlavičkou
 * karty, a ten může být zároveň GM: jemu server Nástupce nezaslepuje, tak
 * se před rozesláním nejmenuje tady — Rob streamuje a pult GM ho má pod
 * zakrytou kartou.
 */
export function VerejnyRadek({ zapas, data }: { zapas: ZapasView; data: DiploData }) {
  const d = diploZapasu(data, zapas.id);
  // Jako na kartě a v pultu: víc AI se jmenuje stejně, rozliší je barva.
  const nastupce = d?.stav === "rozeslano" && d.nastupceHracId ? jmenoVZapasu(zapas.ucastnici, d.nastupceHracId) : null;
  return (
    <span className="diplo-radek">
      Diplomacie
      {d ? <> · {POPIS_STAVU[d.stav]}</> : null}
      {nastupce ? <> · Nástupce: {nastupce}</> : null}
    </span>
  );
}
