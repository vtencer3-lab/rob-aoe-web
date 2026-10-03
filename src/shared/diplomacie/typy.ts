import type { HraZapasu, PolohaVeHre, SouhrnSondy } from "./hra.js";
import type { RozborScenare } from "./scenar.js";

/** Role hráče (spec §6.1). Nástupce se nelosuje — určí ho hra a odklikne GM. */
export type Role = "nastupce" | "garda" | "najezdnik" | "sasek" | "zoldak" | "kat";

/** Role, které GM může hráči přidělit roletkou (všechny kromě Nástupce), v pořadí pravidel. */
export const ROLE_VOLITELNE: readonly Role[] = ["garda", "najezdnik", "sasek", "zoldak", "kat"];

/** Šest rolí, které web rozdá mezi hráče kromě Nástupce: 1+1+2+1+1 — Nájezdníci jsou dva. */
export const ROLE_LOSOVANE: readonly Role[] = ROLE_VOLITELNE.flatMap((r) => (r === "najezdnik" ? [r, r] : [r]));

export type StavDiplo = "priprava" | "losovano" | "rozeslano";

export interface RoleHrace {
  hracId: string;
  role: Role;
  /** Oběť Kata nebo pakt Žoldáka; jinak null. */
  cilHracId: string | null;
}

/** Diplomacie jednoho zápasu, jak ji vidí GM (nic nezaslepeno). */
/** Ping GM na mapě: místo 0–1 na minimapě, komu (null = všem), kdy (ISO, čas serveru). */
export interface PingNaMape {
  id: number;
  x: number;
  y: number;
  komu: string | null;
  kdy: string;
}

/** Co GM ukazuje na mapě z běžící hry — pult i overlaye (uživatel 3. 10. 2026). */
export interface ZobrazeniMapy {
  kralove: boolean;
  relikvie: boolean;
}

export interface DiploZapas {
  zapasId: number;
  gmHracId: string;
  stav: StavDiplo;
  nastupceHracId: string | null;
  scenarId: number | null;
  /** Chybí u starších snímků stavu — pak se ukazuje všechno. */
  mapa?: ZobrazeniMapy;
  role: RoleHrace[];
  /**
   * Poslední data z běžící hry (most ke hře); chybí, dokud hra nic
   * neposlala. Jen pro GM — ostatním, i adminovi, je redakce maže.
   */
  hra?: HraZapasu;
  /**
   * Poloha vlastního krále z běžící hry pro hráče, který není GM (redakce ji
   * vybere z `hra`, kterou mu maže). Cizí krále hráč nevidí (uživatel
   * 3. 10. 2026: „hráči uvidí pouze svého krále“).
   */
  mujKral?: PolohaVeHre;
  /** Pingy GM na mapě, které ještě svítí. GM vidí všechny, hráč jen pro všechny a pro sebe. */
  pingy?: PingNaMape[];
}

/** Verze scénáře bez souboru a minimapy (ty jdou zvlášť adresou). */
export interface ScenarVerze {
  id: number;
  /** Jméno originálu, jak ho autor nahrál. */
  jmenoSouboru: string;
  /** Jméno pro hru (`jmenoScenareProHru`): pod ním se servíruje a porovnává. */
  jmenoHry: string;
  nahrano: string;
  nahralJmeno: string;
  poznamka: string | null;
  aktivni: boolean;
  rozbor: RozborScenare | null;
  chybaRozboru: string | null;
  /**
   * Krátký otisk obsahu minimapy do adresy obrázku: route ji posílá s roční
   * cache, takže po výměně obrázku u verze se musí změnit adresa. Bez
   * minimapy null.
   */
  minimapaOtisk: string | null;
  /**
   * Minimapa je obrázek ze hry nahraný ručně, ne terénní render z rozboru:
   * kosočtverce hráčů už v něm jsou, web ke startům kreslí jen jména.
   */
  minimapaVlastni: boolean;
  /**
   * XS sonda přibalená webem do kopie, kterou host stahuje: kolik cílů
   * v ní je a případná chyba přibalení. Null = verze nahraná dřív, sonda
   * se u ní ještě nepočítala.
   */
  sonda: SouhrnSondy | null;
}

/**
 * Větev `rezim.data` stavu pro prohlížeče u akce Diplomacie. Redakce
 * (viditelnost.ts) z ní pro každého diváka vyrobí jeho pohled.
 */
export interface DiploData {
  /** Aktivní verze scénáře; null = zatím nic nenahráno. */
  aktivni: ScenarVerze | null;
  /** Verze, které hrají zápasy akce (podle id); kvůli pravidlům otisknuté verze. */
  verze: Record<number, ScenarVerze>;
  zapasy: DiploZapas[];
}
