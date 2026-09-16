import { hraciPodleProfilu } from "../db/players.js";
import {
  fetchAdvertisements,
  prelozHrace,
  profilyVInzeratech,
} from "../external/worldsEdgeLobby.js";
import { SeznamLobby } from "./hledaniLobby.js";

/**
 * Jedna cache seznamu lobby pro celý proces: sdílí ji routa „Vyhledat hru“
 * i sledování fáze lobby na pozadí, takže se hra ptá nejvýš jednou za pár
 * vteřin bez ohledu na to, kolik lidí a smyček to zrovna potřebuje. Čísla
 * profilů z inzerátů se hned překládají na hráče webu, aby zbytek kódu
 * o platformách vůbec nevěděl.
 */
export const seznamLobby = new SeznamLobby(async () => {
  const surove = await fetchAdvertisements();
  return prelozHrace(surove, await hraciPodleProfilu(profilyVInzeratech(surove)));
});
