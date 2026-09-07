import type { LobbyInzerat } from "../external/worldsEdgeLobby.js";
import { fazeLobbyPro, nastavFaziLobby, ponechJenFaze } from "../realtime/fazeLobby.js";
import type { AkceStavPayload } from "../shared/types.js";

export interface SledovaniDeps {
  nactiStav: () => Promise<AkceStavPayload>;
  nactiInzeraty: () => Promise<LobbyInzerat[]>;
  broadcast: () => Promise<void>;
}

/** Jak často se server dívá, jestli lobby běžících zápasů ještě stojí. */
export const INTERVAL_SLEDOVANI_MS = 10_000;

/**
 * Jeden krok sledování: pro každý běžící zápas s číslem lobby se podívá,
 * jestli je lobby pořád v seznamu otevřených her. Je-li, sedí se v ní
 * („lobby“); není-li, hra se rozjela („hraje_se“). Rob tak u Spectate vidí,
 * jestli vleze do lobby, nebo do rozehrané hry.
 *
 * Bez běžícího zápasu s lobby se seznam vůbec nestahuje. Výpadek seznamu
 * nic nemění: nevíme, tak nic netvrdíme. Vrací true, když se něco změnilo
 * a rozeslal se nový stav.
 */
export async function zkontrolujFazeLobby(deps: SledovaniDeps): Promise<boolean> {
  const stav = await deps.nactiStav();
  const sledovane = stav.zapasy.filter(
    (z): z is typeof z & { lobbyId: string } => z.stav === "bezi" && z.lobbyId !== null,
  );
  ponechJenFaze(sledovane.map((z) => z.lobbyId));
  if (sledovane.length === 0) return false;

  let inzeraty: LobbyInzerat[];
  try {
    inzeraty = await deps.nactiInzeraty();
  } catch {
    return false;
  }

  const otevrene = new Set(inzeraty.map((l) => l.lobbyId));
  let zmena = false;
  for (const z of sledovane) {
    const nova = otevrene.has(z.lobbyId) ? "lobby" : "hraje_se";
    if (nastavFaziLobby(z.lobbyId, nova)) zmena = true;
  }
  if (zmena) await deps.broadcast();
  return zmena;
}

/**
 * Spustí sledování v pozadí. `unref`, aby proces nedržel při vypínání.
 * Vrací funkci, která ho zastaví (testy).
 */
export function spustSledovaniLobby(
  deps: SledovaniDeps,
  intervalMs = INTERVAL_SLEDOVANI_MS,
): () => void {
  let bezi = false;
  const krok = async () => {
    if (bezi) return;
    bezi = true;
    try {
      await zkontrolujFazeLobby(deps);
    } catch {
      // Sledování je jen vylepšení; spadnout kvůli němu nesmí nic.
    } finally {
      bezi = false;
    }
  };
  const casovac = setInterval(() => void krok(), intervalMs);
  casovac.unref();
  return () => clearInterval(casovac);
}

export { fazeLobbyPro };
