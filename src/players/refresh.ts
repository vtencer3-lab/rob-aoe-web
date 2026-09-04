import type { PlayerStatsUpdate } from "../db/players.js";
import type { SteamProfile } from "../external/steam.js";
import type { LeaderboardStats } from "../external/worldsEdge.js";

export const CACHE_TTL_MS = 15 * 60 * 1000;

export function jeCerstve(statyStazenyV: Date | null, ted: Date = new Date()): boolean {
  if (!statyStazenyV) return false;
  return ted.getTime() - statyStazenyV.getTime() < CACHE_TTL_MS;
}

export interface RefreshDeps {
  nactiZebricek: (steamId: string) => Promise<LeaderboardStats | null>;
  nactiProfil: (steamId: string) => Promise<SteamProfile | null>;
  nactiHodiny: (steamId: string) => Promise<number | null>;
  uloz: (steamId: string, staty: PlayerStatsUpdate) => Promise<void>;
}

/**
 * Stáhne a uloží statistiky. Nikdy nevyhodí výjimku — selhání externího zdroje
 * se zapíše do sloupce staty_chyba a nesmí zablokovat přihlášení uživatele.
 */
export async function refreshPlayerStats(steamId: string, deps: RefreshDeps): Promise<void> {
  // Obaluje celé tělo: jednotlivé .catch() níže chytí jen odmítnuté přísliby.
  // Závislost, která vyhodí synchronně (dřív, než příslib vůbec vznikne),
  // by jinak unikla a porušila garanci, že tato funkce nikdy nevyhodí výjimku.
  try {
    const chyby: string[] = [];

    const [zebricek, profil, hodiny] = await Promise.all([
      deps.nactiZebricek(steamId).catch((err: unknown) => {
        chyby.push(`Žebříček: ${popis(err)}`);
        return null;
      }),
      deps.nactiProfil(steamId).catch((err: unknown) => {
        chyby.push(`Steam profil: ${popis(err)}`);
        return null;
      }),
      deps.nactiHodiny(steamId).catch((err: unknown) => {
        chyby.push(`Steam hodiny: ${popis(err)}`);
        return undefined;
      }),
    ]);

    const staty: PlayerStatsUpdate = {
      alias: zebricek?.alias ?? null,
      country: zebricek?.country ?? null,
      elo1v1: zebricek?.elo1v1 ?? null,
      eloNejvyssi: zebricek?.eloNejvyssi ?? null,
      odehranoHer: zebricek?.odehranoHer ?? null,
      posledniZapas: zebricek?.posledniZapas ?? null,
      steamName: profil?.personaName ?? null,
      avatarUrl: profil?.avatarUrl ?? null,
      chyba: chyby.length > 0 ? chyby.join("; ") : null,
    };

    // undefined = načtení selhalo, hodnotu v databázi nesaháme.
    // null = profil je skrytý, a to se uložit musí.
    if (hodiny !== undefined) staty.steamHodiny = hodiny;

    await deps.uloz(steamId, staty);
  } catch {
    // Cokoliv selhalo mimo výše ošetřené případy (včetně synchronního pádu
    // některé závislosti nebo pádu zápisu). Přihlášení tím nesmí spadnout;
    // hodnoty se doplní příště.
  }
}

function popis(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
