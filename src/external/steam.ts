export interface SteamProfile {
  personaName: string;
  avatarUrl: string;
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

export async function fetchSteamHours(
  steamId: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<number | null> {
  const url =
    `${ZAKLAD}/IPlayerService/GetOwnedGames/v1/?key=${apiKey}&steamid=${steamId}` +
    `&appids_filter[0]=${AOE2_APPID}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Steam odpovědělo ${res.status}`);
  return parseOwnedGames(await res.json());
}
