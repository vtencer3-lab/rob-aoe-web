const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_PREFIX = "https://steamcommunity.com/openid/id/";

export function buildAuthUrl(baseUrl: string): string {
  const zaklad = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": `${zaklad}/api/auth/steam/return`,
    "openid.realm": zaklad,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${STEAM_OPENID}?${params.toString()}`;
}

export function extractSteamId(params: URLSearchParams): string | null {
  // Exactly one occurrence required: URLSearchParams#get silently returns only
  // the first of several duplicated values, which would let an attacker smuggle
  // a victim's claimed_id ahead of the value Steam actually verifies.
  const all = params.getAll("openid.claimed_id");
  if (all.length !== 1) return null;
  const claimed = all[0];
  if (!claimed?.startsWith(CLAIMED_ID_PREFIX)) return null;
  const id = claimed.slice(CLAIMED_ID_PREFIX.length);
  return /^\d{17}$/.test(id) ? id : null;
}

export function buildVerificationBody(params: URLSearchParams): URLSearchParams {
  const body = new URLSearchParams(params);
  body.set("openid.mode", "check_authentication");
  return body;
}

export function isVerified(responseBody: string): boolean {
  // Parse the Key-Value body's is_valid line(s) exactly, rather than pattern-matching
  // anywhere in the text. Steam echoes an unrecognised openid.assoc_handle back as
  // invalidate_handle:<value> (OpenID 2.0 §11.4.2.2); an attacker-chosen handle could
  // otherwise inject a forged "is_valid:true" line next to Steam's real answer.
  const values = responseBody
    .split(/\r?\n/)
    .filter((line) => line.startsWith("is_valid:"))
    .map((line) => line.slice("is_valid:".length).trim());
  return values.length === 1 && values[0] === "true";
}

export function hasDuplicateOpenIdKeys(params: URLSearchParams): boolean {
  const seen = new Set<string>();
  for (const key of params.keys()) {
    if (!key.startsWith("openid.")) continue;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

export async function verifyWithSteam(
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  // Refuse outright rather than silently de-duplicating: a duplicated signed field
  // is not a request we should be trying to interpret, and it is the same injection
  // vector that a forged is_valid line and a smuggled claimed_id both rely on.
  if (hasDuplicateOpenIdKeys(params)) return false;
  const res = await fetchImpl(STEAM_OPENID, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildVerificationBody(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return false;
  return isVerified(await res.text());
}
