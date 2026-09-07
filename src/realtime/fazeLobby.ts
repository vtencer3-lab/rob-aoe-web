import type { FazeLobby } from "../shared/types.js";

/**
 * V jaké fázi je lobby zápasu: dokud je v seznamu otevřených lobby ve hře,
 * lidi v ní sedí („lobby“); jakmile ze seznamu zmizí, hra začala
 * („hraje_se“). Drží se jen v paměti — po restartu serveru se za pár vteřin
 * znovu odvodí ze seznamu (viz sledovaniLobby.ts). Do databáze to nepatří:
 * je to pozorování, ne rozhodnutí.
 */
const faze = new Map<string, FazeLobby>();

export function fazeLobbyPro(lobbyId: string | null): FazeLobby | null {
  return lobbyId === null ? null : (faze.get(lobbyId) ?? null);
}

/** Vrátí true, když se fáze změnila (nebo je nová). */
export function nastavFaziLobby(lobbyId: string, nova: FazeLobby): boolean {
  if (faze.get(lobbyId) === nova) return false;
  faze.set(lobbyId, nova);
  return true;
}

/** Zapomene lobby, které už žádný běžící zápas nemá — ať mapa neroste. */
export function ponechJenFaze(aktivniLobbyIds: Iterable<string>): void {
  const ponechat = new Set(aktivniLobbyIds);
  for (const id of faze.keys()) if (!ponechat.has(id)) faze.delete(id);
}
