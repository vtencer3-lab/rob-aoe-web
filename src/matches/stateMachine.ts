export type MatchState =
  | "nachystany"
  | "vyhlaseny"
  | "lobby_otevrena"
  | "hraje_se"
  | "dohrano"
  | "zruseny";

export type Actor = "admin" | "host";

export const MATCH_STATES: readonly MatchState[] = [
  "nachystany",
  "vyhlaseny",
  "lobby_otevrena",
  "hraje_se",
  "dohrano",
  "zruseny",
];

const HOST_PRECHODY: ReadonlyArray<[MatchState, MatchState]> = [
  ["vyhlaseny", "lobby_otevrena"],
  ["lobby_otevrena", "hraje_se"],
];

export function canTransition(from: MatchState, to: MatchState, actor: Actor): boolean {
  if (from === to) return false;
  if (actor === "admin") return true;
  return HOST_PRECHODY.some(([a, b]) => a === from && b === to);
}

/**
 * Odmítnutý přechod je konflikt se skutečným stavem zápasu, ne interní chyba
 * serveru — routy ho překládají na 409 s touhle hláškou. Nejčastější spouštěč
 * je úplně nevinný: Rob v přímém přenosu dvakrát klikne na „Vyhlásit“ nebo
 * „Hraje se“. Za takový klik nesmí dostat červený „Něco se pokazilo na
 * serveru.“, ale větu, ze které pozná, že se vlastně nic nestalo.
 */
export class PrechodChyba extends Error {}

export function assertTransition(from: MatchState, to: MatchState, actor: Actor): void {
  if (canTransition(from, to, actor)) return;
  if (from === to) {
    throw new PrechodChyba(`Zápas už ve stavu „${to}“ je, nic se nemění.`);
  }
  throw new PrechodChyba(
    actor === "host"
      ? `Role host nesmí přejít z „${from}“ do „${to}“ — tohle může jen Rob.`
      : `Role ${actor} nesmí přejít z „${from}“ do „${to}“.`,
  );
}
