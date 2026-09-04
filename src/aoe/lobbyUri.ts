export type LobbyUriError = "prazdne" | "divacky_odkaz" | "spatny_tvar";

export type ParseResult =
  | { ok: true; lobbyId: string }
  | { ok: false; error: LobbyUriError };

const JOIN = /^aoe2de:\/\/0\/(\d+)$/;
const SPECTATOR = /^aoe2de:\/\/1\/\d+$/;

export function parseJoinUri(input: string): ParseResult {
  const text = (input ?? "").trim();
  if (text === "") return { ok: false, error: "prazdne" };
  if (SPECTATOR.test(text)) return { ok: false, error: "divacky_odkaz" };
  const match = JOIN.exec(text);
  if (!match?.[1]) return { ok: false, error: "spatny_tvar" };
  return { ok: true, lobbyId: match[1] };
}

export function joinUri(lobbyId: string): string {
  return `aoe2de://0/${lobbyId}`;
}

export function spectatorUri(lobbyId: string): string {
  return `aoe2de://1/${lobbyId}`;
}
