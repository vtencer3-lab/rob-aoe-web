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

export function assertTransition(from: MatchState, to: MatchState, actor: Actor): void {
  if (!canTransition(from, to, actor)) {
    throw new Error(`Role ${actor} nesmí přejít z „${from}“ do „${to}“.`);
  }
}
