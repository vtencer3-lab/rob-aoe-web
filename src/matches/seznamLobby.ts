import { hraciPodleProfilu, hraciPodleSteamId } from "../db/players.js";
import {
  fetchAdvertisements,
  prelozHrace,
  profilyVInzeratech,
  type InzeratSProfily,
} from "../external/worldsEdgeLobby.js";
import { SeznamLobby } from "./hledaniLobby.js";

/**
 * Obě cesty do databáze, jak je potřebuje `hraciZInzeratu`. Podstrkují se
 * v testech, aby překlad šel ověřit bez databáze — stejný vzor jako
 * `zdrojeProHrace` u obnovy statistik.
 */
export interface ZdrojeHracu {
  podleProfilu: (profily: number[]) => Promise<Map<number, string>>;
  podleSteamId: (steamIds: string[]) => Promise<Map<string, string>>;
}

const VYCHOZI_ZDROJE: ZdrojeHracu = {
  podleProfilu: hraciPodleProfilu,
  podleSteamId: hraciPodleSteamId,
};

/**
 * Z čísel profilů v inzerátech udělá mapu na hráče webu. Dvě cesty, a záleží
 * na jejich pořadí:
 *
 * 1. **`player.we_profil_id`** — hlavní. Číslo profilu má v `avatars` každý
 *    záznam bez ohledu na platformu, takže jedna cesta pokrývá Steam i Xbox.
 * 2. **`player.steam_id`** — záloha, jen pro to, co první cesta nepokryla.
 *    `we_profil_id` se stávajícím hráčům doplní teprve při obnově statistik,
 *    a ta se patnáct minut po předchozí přeskakuje; komu se dotaz na Worlds
 *    Edge nikdy nepovede, zůstane prázdné natrvalo. Bez téhle zálohy by byl
 *    takový hráč v lobby neviditelný, ačkoliv před přechodem na čísla profilů
 *    se poznal vždycky — a zhoršit chování dnešním Steam hráčům je to jediné,
 *    co se stát nesmělo.
 *
 * Druhý dotaz se pokládá jen na profily, které první nepokryl: nad stovkami
 * profilů v každém načtení seznamu lobby by se jinak platilo za odpověď,
 * kterou už máme. Jakmile budou mít všichni `we_profil_id`, bude seznam
 * prázdný a dotaz se nepoloží vůbec.
 */
export async function hraciZInzeratu(
  inzeraty: InzeratSProfily[],
  steamIdyProfilu: Map<number, string>,
  zdroje: ZdrojeHracu = VYCHOZI_ZDROJE,
): Promise<Map<number, string>> {
  const profily = profilyVInzeratech(inzeraty);
  const mapa = await zdroje.podleProfilu(profily);

  const nepokryte = profily.filter((p) => !mapa.has(p));
  const steamIdy = [
    ...new Set(
      nepokryte.flatMap((p) => {
        const steamId = steamIdyProfilu.get(p);
        return steamId ? [steamId] : [];
      }),
    ),
  ];
  const podleSteamId = await zdroje.podleSteamId(steamIdy);
  for (const profil of nepokryte) {
    const steamId = steamIdyProfilu.get(profil);
    const hracId = steamId === undefined ? undefined : podleSteamId.get(steamId);
    if (hracId !== undefined) mapa.set(profil, hracId);
  }
  return mapa;
}

/**
 * Jedna cache seznamu lobby pro celý proces: sdílí ji routa „Vyhledat hru“
 * i sledování fáze lobby na pozadí, takže se hra ptá nejvýš jednou za pár
 * vteřin bez ohledu na to, kolik lidí a smyček to zrovna potřebuje. Čísla
 * profilů z inzerátů se hned překládají na hráče webu, aby zbytek kódu
 * o platformách vůbec nevěděl.
 */
export const seznamLobby = new SeznamLobby(async () => {
  const { inzeraty, steamIdy } = await fetchAdvertisements();
  return prelozHrace(inzeraty, await hraciZInzeratu(inzeraty, steamIdy));
});
