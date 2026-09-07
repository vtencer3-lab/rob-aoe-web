import type { FazeLobby } from "../shared/types.js";

/**
 * V jaké fázi je lobby zápasu: dokud je v seznamu otevřených lobby ve hře,
 * lidi v ní sedí („lobby“); jakmile ze seznamu zmizí, hra začala
 * („hraje_se“). Drží se jen v paměti — po restartu serveru se za pár vteřin
 * znovu odvodí ze seznamu (viz sledovaniLobby.ts). Do databáze to nepatří:
 * je to pozorování, ne rozhodnutí.
 */
const faze = new Map<string, FazeLobby>();

/**
 * Kolikrát po sobě lobby v seznamu chyběla. Seznam ze hry občas lobby na
 * jedno stažení vynechá (stránkování se posune, když mezi dvěma stránkami
 * nějaká lobby zanikne) — a jedno vynechání 7. 9. 2026 ukázalo „Hraje se“
 * u lobby, ve které se pořád sedělo. Proto se hra prohlásí za rozjetou až po
 * několika nepřítomnostech za sebou; návrat do „lobby“ je naopak okamžitý.
 */
const nepritomnosti = new Map<string, number>();

/** Tolik kontrol po sobě (à 10 s) musí lobby chybět, než se věří, že se hraje. */
export const NEPRITOMNOSTI_PRO_HRAJE_SE = 3;

export function fazeLobbyPro(lobbyId: string | null): FazeLobby | null {
  return lobbyId === null ? null : (faze.get(lobbyId) ?? null);
}

/** Vrátí true, když se fáze změnila (nebo je nová). „lobby“ zároveň nuluje počítadlo. */
export function nastavFaziLobby(lobbyId: string, nova: FazeLobby): boolean {
  if (nova === "lobby") nepritomnosti.delete(lobbyId);
  if (faze.get(lobbyId) === nova) return false;
  faze.set(lobbyId, nova);
  return true;
}

/**
 * Lobby v seznamu nebyla. Přepne na „hraje_se“ (a vrátí true při změně) až
 * po NEPRITOMNOSTI_PRO_HRAJE_SE nepřítomnostech za sebou; do té doby drží
 * stávající fázi (u neznámé lobby žádnou — Spectate pak fázi neukazuje).
 */
export function zaznamenejNepritomnost(lobbyId: string): boolean {
  const pocet = (nepritomnosti.get(lobbyId) ?? 0) + 1;
  nepritomnosti.set(lobbyId, pocet);
  if (pocet < NEPRITOMNOSTI_PRO_HRAJE_SE) return false;
  return nastavFaziLobby(lobbyId, "hraje_se");
}

/** Zapomene lobby, které už žádný běžící zápas nemá — ať mapa neroste. */
export function ponechJenFaze(aktivniLobbyIds: Iterable<string>): void {
  const ponechat = new Set(aktivniLobbyIds);
  for (const id of faze.keys()) if (!ponechat.has(id)) faze.delete(id);
  for (const id of nepritomnosti.keys()) if (!ponechat.has(id)) nepritomnosti.delete(id);
}
