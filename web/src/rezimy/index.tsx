import type { ReactElement, ReactNode } from "react";
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
  /**
   * Sekce módu na stránce akce pod zápasy — pro každého, i bez přihlášení
   * (Diplomacie: pravidla hry s mapou, uživatel 4. 10. 2026).
   */
  sekceAkce?(stav: AkceStavPayload): ReactNode;
  /**
   * Blok pod zápasy pro diváka s právem náhledu (Diplomacie: pohled
   * kteréhokoli hráče cizího zápasu, jen ke čtení). Null = nic.
   */
  nahledZapasu?(p: KontextZapasu): ReactNode;
  /**
   * Samostatné stránky módu podle cesty bez základu webu (Diplomacie:
   * overlaye do OBS „/obs/mapa“, „/obs/tabulka“). Nezávisí na otevřené
   * akci — browser source načítá adresu napřímo.
   */
  stranky?: Record<string, () => ReactElement>;
}

const KLIENTI: Record<RezimId, RezimKlienta> = { klasicky: {}, diplomacie: diplomacieKlient };

/** Samostatná stránka některého módu pro tuhle cestu, nebo null. */
export function strankaModu(cesta: string): ReactElement | null {
  for (const klient of Object.values(KLIENTI)) {
    const stranka = klient.stranky?.[cesta];
    if (stranka) return stranka();
  }
  return null;
}

/** Bez módu (starší snímek stavu) je to klasický večer. */
export function rezimKlienta(id: RezimId | undefined): RezimKlienta {
  return KLIENTI[id ?? "klasicky"];
}
