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
  upravenoPoRozeslani: boolean;
}

/** Diplomacie jednoho zápasu, jak ji vidí GM (nic nezaslepeno). */
export interface DiploZapas {
  zapasId: number;
  gmHracId: string;
  stav: StavDiplo;
  nastupceHracId: string | null;
  scenarId: number | null;
  role: RoleHrace[];
}

/** Verze scénáře bez souboru a minimapy (ty jdou zvlášť adresou). */
export interface ScenarVerze {
  id: number;
  jmenoSouboru: string;
  nahrano: string;
  nahralJmeno: string;
  poznamka: string | null;
  aktivni: boolean;
  rozbor: RozborScenare | null;
  chybaRozboru: string | null;
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
