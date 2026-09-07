import type { PlayerStatsUpdate } from "../db/players.js";
import type { SteamProfile } from "../external/steam.js";
import type { LeaderboardStats } from "../external/worldsEdge.js";

export const CACHE_TTL_MS = 15 * 60 * 1000;

export function jeCerstve(statyStazenyV: Date | null, ted: Date = new Date()): boolean {
  if (!statyStazenyV) return false;
  return ted.getTime() - statyStazenyV.getTime() < CACHE_TTL_MS;
}

/**
 * Jestli se dá obnova přeskočit. Vedle stáří rozhoduje i to, zda řádek vůbec
 * má žebříčky: sloupec přibyl v migraci 011 a řádek stažený starší verzí
 * serveru je jinak „čerstvý“, ale bez nich. 7. 9. 2026 tak Jouki minutu po
 * releasu viděl kartu s „Žebříčky se ještě nestáhly“ a čtvrt hodiny se
 * nic nedělo — starý server mu data stáhl těsně před nasazením nového.
 */
export function maCerstveStaty(
  hrac: { statyStazenyV: Date | null; zebricky: unknown[] | null } | null,
  ted: Date = new Date(),
): boolean {
  if (!hrac || hrac.zebricky === null) return false;
  return jeCerstve(hrac.statyStazenyV, ted);
}

export interface RefreshDeps {
  nactiZebricek: (steamId: string) => Promise<LeaderboardStats | null>;
  nactiProfil: (steamId: string) => Promise<SteamProfile | null>;
  /** `undefined` = nevíme (chybí klíč), hodnotu v databázi nesaháme. `null` = skrytý profil. */
  nactiHodiny: (steamId: string) => Promise<number | null | undefined>;
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
      zebricky: zebricek?.zebricky ?? null,
      steamName: profil?.personaName ?? null,
      avatarUrl: profil?.avatarUrl ?? null,
      chyba: chyby.length > 0 ? chyby.join("; ") : null,
    };

    // undefined = načtení selhalo, hodnotu v databázi nesaháme.
    // null = profil je skrytý, a to se uložit musí.
    if (hodiny !== undefined) staty.steamHodiny = hodiny;

    await deps.uloz(steamId, staty);
  } catch (err: unknown) {
    // Cokoliv selhalo mimo výše ošetřené případy (včetně synchronního pádu
    // některé závislosti nebo pádu zápisu). Přihlášení tím nesmí spadnout, ale
    // na rozdíl od dílčích chyb výše bychom jinak neměli žádný záznam o tom,
    // že se obnova statistik vůbec nepovedla — zkusíme to zapsat, nejlépe.
    // try/catch, ne .catch(): `.catch` visí až na vráceném příslibu, takže
    // závislost, která vyhodí synchronně, by unikla i tomuhle poslednímu
    // záchytu — a to zrovna v handleru, který tu je kvůli garanci „nikdy
    // nevyhodí výjimku“.
    try {
      await deps.uloz(steamId, { chyba: `Obnova selhala: ${popis(err)}` });
    } catch {
      // Zapsat chybu se nepovedlo. Přihlášení tím spadnout nesmí, a víc už
      // udělat nejde.
    }
  }
}

function popis(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
