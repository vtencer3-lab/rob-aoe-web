import type { DiploData } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace } from "../zapas.js";
import { diploZapasu } from "./KartaRole.js";

/** Zápas Diplomacie očima diváka: jen to, co je veřejné (spec §8.2). */
export function VerejnyRadek({ zapas, data }: { zapas: ZapasView; data: DiploData }) {
  const d = diploZapasu(data, zapas.id);
  const nastupce = d?.nastupceHracId ? zapas.ucastnici.find((u) => u.hracId === d.nastupceHracId) : undefined;
  return <span className="diplo-radek">Diplomacie{nastupce ? <> · Nástupce: {jmenoHrace(nastupce)}</> : null}</span>;
}
