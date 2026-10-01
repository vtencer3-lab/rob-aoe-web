import type { DiploData } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { jmenoVZapasu } from "../zapas.js";
import { diploZapasu } from "./KartaRole.js";

/** Zápas Diplomacie očima diváka: jen to, co je veřejné (spec §8.2). */
export function VerejnyRadek({ zapas, data }: { zapas: ZapasView; data: DiploData }) {
  const d = diploZapasu(data, zapas.id);
  // Jako na kartě a v pultu: víc AI se jmenuje stejně, rozliší je barva.
  const nastupce = d?.nastupceHracId ? jmenoVZapasu(zapas.ucastnici, d.nastupceHracId) : null;
  return <span className="diplo-radek">Diplomacie{nastupce ? <> · Nástupce: {nastupce}</> : null}</span>;
}
