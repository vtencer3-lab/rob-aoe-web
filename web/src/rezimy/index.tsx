import type { ReactElement, ReactNode } from "react";
import type { NastaveniLobby } from "../../../src/shared/lobbyKontrola.js";
import type { AkceStavPayload, Barva, RezimId, ZapasView } from "../../../src/shared/types.js";
import { diplomacieKlient } from "../diplomacie/index.js";

/** `hlidej` z App.tsx: spustí akci, chybu ukáže uživateli a dočte stav. */
export type Hlidej = (akce: () => Promise<unknown>) => Promise<void>;

export interface KontextZapasu {
  zapas: ZapasView;
  stav: AkceStavPayload;
  ja: string | null;
  hlidej: Hlidej;
  /** Otevře úpravu zápasu (ozubené kolečko) — jádro ji dá, jen když to mód dovolí (`smiUpravitZapas`). */
  onUpravitZapas?: () => void;
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
  nastaveniScenare?(stav: AkceStavPayload, zapas?: ZapasView): { vitezstvi: string | null } | null;
  /**
   * Výběr verze scénáře do řádku „Scénář“ v úpravě zápasu (Diplomacie:
   * uživatel 5. 10. 2026). Mód změnu uloží sám a `onVybrano` vrátí, co
   * z verze patří do nastavení lobby zápasu — okno úpravy si to vezme do
   * návrhu, ať ho při dalším propsání nepřepíše starým jménem. Null = jen text.
   */
  vyberScenare?(p: KontextZapasu & { onVybrano: (nastaveni: Partial<NastaveniLobby>) => void }): ReactNode;
  /**
   * Smí divák mluvit (push-to-talk) do tohohle zápasu ze své karty, i když
   * není admin? Jen nabídka tlačítka — právo hlídá server stejnojmenným
   * háčkem (`RezimAkce.smiMluvitDoZapasu`).
   */
  smiMluvitDoZapasu?(p: KontextZapasu): boolean;
  /**
   * Smí divák upravit zápas jako admin (Diplomacie: GM svého běžícího
   * zápasu)? Jen nabídka okna — právo hlídá server stejnojmenným háčkem.
   */
  smiUpravitZapas?(p: KontextZapasu): boolean;
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
   * Správa podkladů módu pod panelem akce (Diplomacie: verze scénáře).
   * Volá se pro mód běžící akce, nebo pro mód zvolený ve formuláři založení
   * akce. `smiSpravovat` = server dovolil (/api/me); mód může přidat vlastní
   * důvod (GM běžícího zápasu). Null = nic.
   */
  sprava?(p: { stav: AkceStavPayload | null; ja: string; smiSpravovat: boolean; hlidej: Hlidej }): ReactNode;
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
