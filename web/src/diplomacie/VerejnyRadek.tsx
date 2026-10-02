import type { DiploData, StavDiplo } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";
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
  const nastupce = d?.stav === "rozeslano" ? d.nastupceHracId : null;
  return (
    <span className="diplo-radek">
      Diplomacie
      {d ? <> · {POPIS_STAVU[d.stav]}</> : null}
      {/* Jako na kartě a v pultu: čtvereček barvy, stejně pojmenované AI rozliší „(pN)“. */}
      {nastupce ? (
        <>
          {" "}
          · Nástupce: <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={nastupce} />
        </>
      ) : null}
    </span>
  );
}
