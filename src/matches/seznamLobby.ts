import { fetchAdvertisements } from "../external/worldsEdgeLobby.js";
import { SeznamLobby } from "./hledaniLobby.js";

/**
 * Jedna cache seznamu lobby pro celý proces: sdílí ji routa „Vyhledat hru“
 * i sledování fáze lobby na pozadí, takže se hra ptá nejvýš jednou za pár
 * vteřin bez ohledu na to, kolik lidí a smyček to zrovna potřebuje.
 */
export const seznamLobby = new SeznamLobby(() => fetchAdvertisements());
