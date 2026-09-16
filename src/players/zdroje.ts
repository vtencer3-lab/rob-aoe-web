import { savePlayerStats, type PlayerRow } from "../db/players.js";
import { steamZdroje } from "../external/steam.js";
import {
  fetchPersonalStat,
  fetchPersonalStatPodleAliasu,
  fetchPersonalStatPodleProfilu,
  type LeaderboardStats,
} from "../external/worldsEdge.js";
import type { RefreshDeps } from "./refresh.js";

export interface ZebricekZdroje {
  podleAliasu: (alias: string) => Promise<LeaderboardStats | null>;
  podleProfilu: (profilId: number) => Promise<LeaderboardStats | null>;
  podleSteamu: (steamId: string) => Promise<LeaderboardStats | null>;
}

const VYCHOZI: ZebricekZdroje = {
  podleAliasu: (alias) => fetchPersonalStatPodleAliasu(alias),
  podleProfilu: (profilId) => fetchPersonalStatPodleProfilu(profilId),
  podleSteamu: (steamId) => fetchPersonalStat(steamId),
};

/**
 * Odkud se berou statistiky konkrétního hráče. Microsoft hráč nemá Steam
 * profil ani hodiny, a jeho žebříček se poprvé hledá podle gamertagu —
 * podruhé už podle čísla profilu, protože alias si jde ve hře změnit.
 */
export function zdrojeProHrace(
  hrac: PlayerRow,
  steamApiKey: string,
  zdroje: ZebricekZdroje = VYCHOZI,
): RefreshDeps {
  if (hrac.platforma === "xbox") {
    return {
      nactiZebricek: () =>
        hrac.weProfilId !== null
          ? zdroje.podleProfilu(hrac.weProfilId)
          : hrac.xboxGamertag
            ? zdroje.podleAliasu(hrac.xboxGamertag)
            : Promise.resolve(null),
      nactiProfil: async () => null,
      // undefined = "nevíme", hodnoty v databázi se nesahají. Hodiny Microsoft
      // nezveřejňuje a vlastnictví se plní při přihlášení z herní historie.
      nactiHru: async () => undefined,
      uloz: savePlayerStats,
    };
  }
  return {
    nactiZebricek: (id) => zdroje.podleSteamu(id),
    ...steamZdroje(steamApiKey),
    uloz: savePlayerStats,
  };
}
