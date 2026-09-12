import type { SteamVlastnictvi } from "../shared/types.js";

export interface SteamProfile {
  personaName: string;
  avatarUrl: string;
}

/** Jedna odpověď GetOwnedGames říká obojí: kolik hodin a jestli hru vůbec má. */
export interface SteamHra {
  hodiny: number | null;
  vlastnictvi: SteamVlastnictvi;
}

const AOE2_APPID = 813780;
const ZAKLAD = "https://api.steampowered.com";

/** Undocumented upstream — elementy pole nemusí být objekty. Nikdy nesahat na vlastnost bez tohoto testu. */
function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null;
}

export function parsePlayerSummaries(json: unknown, steamId: string): SteamProfile | null {
  const hraci = (json as { response?: { players?: unknown } })?.response?.players;
  if (!Array.isArray(hraci)) return null;
  const hrac = hraci.find((h) => jeObjekt(h) && h["steamid"] === steamId) as
    | Record<string, unknown>
    | undefined;
  if (!hrac) return null;
  const personaName = hrac["personaname"];
  const avatarUrl = hrac["avatarfull"];
  if (typeof personaName !== "string" || typeof avatarUrl !== "string") return null;
  return { personaName, avatarUrl };
}

/** Vrací celé hodiny, nebo null když je profil skrytý nebo hru nevlastní. */
export function parseOwnedGames(json: unknown): number | null {
  const hry = (json as { response?: { games?: unknown } })?.response?.games;
  if (!Array.isArray(hry)) return null;
  const aoe = hry.find((h) => jeObjekt(h) && h["appid"] === AOE2_APPID) as
    | { playtime_forever?: unknown }
    | undefined;
  const minuty = aoe?.playtime_forever;
  if (typeof minuty !== "number" || !Number.isFinite(minuty)) return null;
  return Math.floor(minuty / 60);
}

/**
 * Vlastnictví hry z téže odpovědi. Steam rozlišuje skrytou knihovnu a prázdnou
 * knihovnu jen tvarem: skrytá vrací `response: {}` bez `game_count`, veřejná
 * má `game_count` vždy, i když je nula. Na tom stojí rozdíl mezi „nejde
 * ověřit“ a „hru nemá“.
 */
export function parseSteamHra(json: unknown): SteamHra {
  const response = (json as { response?: unknown })?.response;
  if (!jeObjekt(response) || typeof response["game_count"] !== "number") {
    return { hodiny: null, vlastnictvi: "soukromy" };
  }
  const hodiny = parseOwnedGames(json);
  return { hodiny, vlastnictvi: hodiny === null ? "nema" : "ma" };
}

/**
 * Zdroje, které potřebují klíč ke Steam Web API. Bez klíče se Steamu neptáme
 * vůbec — dotaz s prázdným `key=` vrací 403, což by se každému hráči zapsalo do
 * `staty_chyba` a zobrazilo jako varování u jeho jména. Chybějící klíč není
 * porucha, jen míň údajů: ELO, herní přezdívka i počet odehraných her chodí ze
 * žebříčku Worlds Edge, který žádný klíč nechce.
 *
 * `undefined` u hodin znamená "nevíme" a hodnota v databázi se nechá být;
 * `null` by znamenalo "profil je skrytý", což je jiná informace.
 */
export function steamZdroje(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): {
  nactiProfil: (steamId: string) => Promise<SteamProfile | null>;
  nactiHru: (steamId: string) => Promise<SteamHra | undefined>;
} {
  if (apiKey === "") {
    return {
      nactiProfil: async () => null,
      nactiHru: async () => undefined,
    };
  }
  return {
    nactiProfil: (steamId) => fetchSteamProfile(steamId, apiKey, fetchImpl),
    nactiHru: (steamId) => fetchSteamHra(steamId, apiKey, fetchImpl),
  };
}

export async function fetchSteamProfile(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamProfile | null> {
  const url = `${ZAKLAD}/ISteamUser/GetPlayerSummaries/v2/?key=${apiKey}&steamids=${steamId}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Steam odpovědělo ${res.status}`);
  return parsePlayerSummaries(await res.json(), steamId);
}

export async function fetchSteamHra(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SteamHra> {
  const url =
    `${ZAKLAD}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
    `&appids_filter[0]=${AOE2_APPID}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Steam odpovědělo ${res.status}`);
  return parseSteamHra(await res.json());
}
