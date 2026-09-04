export type MatchState = "bezi" | "dohrano" | "zruseny";

export const MATCH_STATES: readonly MatchState[] = ["bezi", "dohrano", "zruseny"];

/**
 * Ze tří stavů nezbylo co zakazovat. Hostovi po zrušení mezistavů nepatří žádný
 * přechod (smí jediné: vložit odkaz do lobby) a Rob smí cokoliv — i vrátit
 * dohraný zápas do běhu, aby ho jeden překliknutý „Vyhrál tým 1“ nestál zápas.
 * Jediné, co nedává smysl, je přechod na sebe sama.
 */
export function canTransition(from: MatchState, to: MatchState): boolean {
  return from !== to;
}

/**
 * Odmítnutý přechod je konflikt se skutečným stavem zápasu, ne interní chyba
 * serveru — routy ho překládají na 409 s touhle hláškou. Spouštěč je úplně
 * nevinný: Rob v přímém přenosu dvakrát klikne na „Vyhrál tým 1“. Za takový
 * klik nesmí dostat červený „Něco se pokazilo na serveru.“, ale větu, ze které
 * pozná, že se vlastně nic nestalo.
 */
export class PrechodChyba extends Error {}

export function assertTransition(from: MatchState, to: MatchState): void {
  if (canTransition(from, to)) return;
  throw new PrechodChyba(`Zápas už ve stavu „${to}“ je, nic se nemění.`);
}
