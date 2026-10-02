import { prectiSondu, type SondaScenare } from "../shared/diplomacie/hra.js";
import { spustKrokPythonu, type VolbyKroku } from "./krokPythonu.js";
import { jeHlavickaScenare } from "./rozbor.js";

export type VysledekSondy = { ok: true; soubor: Buffer; sonda: SondaScenare } | { ok: false; chyba: string };

/**
 * Přibalí do scénáře XS sondu (sonda.py + sonda.xs): vrací kopii, kterou
 * host stahuje, a výpis cílů. Selhání je výsledek `ok: false` — verze se
 * pak uloží bez sondy s důvodem a hraje se jako dřív, jen bez dat ze hry.
 */
export async function pribalSondu(soubor: Buffer, volby: VolbyKroku = {}): Promise<VysledekSondy> {
  const v = await spustKrokPythonu({
    skript: "sonda.py",
    jmeno: "Krok sondy",
    vstup: soubor,
    ...volby,
    precti: (json) => {
      if (typeof json["soubor"] !== "string") throw new Error("Krok sondy nevrátil soubor.");
      const kopie = Buffer.from(json["soubor"], "base64");
      // Co web rozdává ke stažení, musí být zase scénář — ne půlka výstupu.
      if (!jeHlavickaScenare(kopie)) throw new Error("Krok sondy nevrátil scénář.");
      return { soubor: kopie, sonda: prectiSondu(json) };
    },
  });
  return v.ok ? { ok: true, ...v.hodnota } : v;
}

/** Co se uloží k verzi, když přibalení selhalo: žádné cíle a důvod. */
export function sondaSChybou(chyba: string): SondaScenare {
  return { cile: [], oznaceno: 0, chyba };
}
