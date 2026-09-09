import type { PlayerView } from "./types.js";

/**
 * Počítačoví protivníci do lobby. Na rozdíl od zkušebních hráčů (matches/
 * zkusebniHraci.ts) nejsou berlička pro zkoušení večera nasucho, ale běžná
 * součást hry: Rob si klidně udělá zápas dvou lidí proti třem AI a takový
 * zápas má v historii zůstat i s nimi. Proto mají řádek v tabulce player
 * (migrace 015) a všude dál se chovají jako každý jiný účastník.
 *
 * Prefix „ai:“ je stejný trik jako „test:“ u zkušebních — skutečné 64bitové
 * Steam ID takhle nikdy nevypadá, takže se AI nemůže srazit s člověkem a v
 * databázi je poznat na první pohled.
 */
export const POCET_AI = 7;

/**
 * Jméno je u všech AI stejné, jako je má hra: v lobby sedí prostě „AI“ a
 * rozlišuje je barva se slotem, ne číslo v přezdívce. Číslo v id je jen
 * interní, aby jich šlo přidat víc — sestava nesnese dvakrát totéž id.
 */
export const JMENO_AI = "AI";

export function aiId(cislo: number): string {
  return `ai:${cislo}`;
}

export function jeAi(steamId: string): boolean {
  return steamId.startsWith("ai:");
}

/**
 * AI tak, jak je vidí prohlížeč: žádná čísla, protože počítač žádné ELO ani
 * odehrané hry nemá. Karta se statistikami se u nich proto neukazuje a do
 * součtu ELO týmu nevstupují.
 */
export const AI_HRACI: readonly PlayerView[] = Array.from({ length: POCET_AI }, (_, i) => ({
  steamId: aiId(i + 1),
  alias: JMENO_AI,
  steamName: JMENO_AI,
  avatarUrl: null,
  country: null,
  elo1v1: null,
  eloNejvyssi: null,
  odehranoHer: null,
  steamHodiny: null,
  posledniZapas: null,
  statyStazenyV: null,
  statyChyba: null,
  zebricky: null,
}));
