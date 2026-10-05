import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  return { cile: [], oznaceno: 0, chyba, revize: null, varovani: [] };
}

let revize: string | null | undefined;

/**
 * Otisk dnešního kódu sondy — stejný, jaký sonda.py ukládá ke kopii
 * (`revize_xs`: SHA-256 textu s konci řádků LF, prvních 12 znaků). Verze,
 * jejíž kopie nese jiný, potřebuje „Přibalit sondu“ znovu. Null, když se
 * soubor nepodaří přečíst — pak se za zastaralé neoznačí nic.
 */
export function revizeSondy(): string | null {
  if (revize === undefined) {
    try {
      const xs = readFileSync(join(import.meta.dirname, "sonda.xs"), "latin1").replace(/\r\n/g, "\n");
      revize = createHash("sha256").update(xs, "latin1").digest("hex").slice(0, 12);
    } catch {
      revize = null;
    }
  }
  return revize;
}
