import { prectiRozbor, type RozborScenare } from "../shared/diplomacie/scenar.js";
import { spustKrokPythonu, type VolbyKroku } from "./krokPythonu.js";

export type VysledekRozboru = { ok: true; rozbor: RozborScenare; minimapa: Buffer } | { ok: false; chyba: string };

/** Scénář AoE2 DE začíná textovou verzí formátu, např. „1.59“ (spec §5.2 bod 1). */
export function jeHlavickaScenare(soubor: Buffer): boolean {
  return soubor.length > 8 && /^\d\.\d\d$/.test(soubor.subarray(0, 4).toString("latin1"));
}

/**
 * Spustí rozbor.py, pošle mu soubor na stdin a přečte JSON. Každé selhání
 * (pád, limit, nesmyslný výstup) je výsledek `ok: false`, ne výjimka —
 * nahrání se pak uloží s chybou rozboru (spec §5.2 bod 4).
 */
export async function rozeberScenar(soubor: Buffer, volby: VolbyKroku = {}): Promise<VysledekRozboru> {
  const v = await spustKrokPythonu({
    skript: "rozbor.py",
    jmeno: "Rozbor",
    vstup: soubor,
    ...volby,
    precti: (json) => {
      if (typeof json["minimapa"] !== "string") throw new Error("Rozbor nevrátil minimapu.");
      return { rozbor: prectiRozbor(json["rozbor"]), minimapa: Buffer.from(json["minimapa"], "base64") };
    },
  });
  return v.ok ? { ok: true, ...v.hodnota } : v;
}
