import type { ReactNode } from "react";
import type { AkceStavPayload, Barva, RezimId, ZapasView } from "../../../src/shared/types.js";
import { diplomacieKlient } from "../diplomacie/index.js";

/** `hlidej` z App.tsx: spustí akci, chybu ukáže uživateli a dočte stav. */
export type Hlidej = (akce: () => Promise<unknown>) => Promise<void>;

export interface KontextZapasu {
  zapas: ZapasView;
  stav: AkceStavPayload;
  ja: string | null;
  hlidej: Hlidej;
}

/** Co mód přidá do obrazovek jádra (spec §4.1 H9). Klasický večer nic. */
export interface RezimKlienta {
  /** Štítek módu u názvu v panelu akce; klasický večer žádný nemá. */
  stitek?(): string;
  kartaHrace?(p: KontextZapasu): ReactNode;
  krokHosta?(p: KontextZapasu): ReactNode;
  verejnyZapas?(p: KontextZapasu): ReactNode;
  popisSlotu?(barva: Barva): string | null;
  /**
   * Řádek „Scénář“ v panelu Nastavení lobby (Custom Scenario): podmínky
   * vítězství z rozboru aktivní verze. Null = mód k tomu nemá co říct.
   */
  nastaveniScenare?(stav: AkceStavPayload): { vitezstvi: string | null } | null;
  /**
   * Smí divák mluvit (push-to-talk) do tohohle zápasu ze své karty, i když
   * není admin? Jen nabídka tlačítka — právo hlídá server stejnojmenným
   * háčkem (`RezimAkce.smiMluvitDoZapasu`).
   */
  smiMluvitDoZapasu?(p: KontextZapasu): boolean;
}

const KLIENTI: Record<RezimId, RezimKlienta> = { klasicky: {}, diplomacie: diplomacieKlient };

/** Bez módu (starší snímek stavu) je to klasický večer. */
export function rezimKlienta(id: RezimId | undefined): RezimKlienta {
  return KLIENTI[id ?? "klasicky"];
}
