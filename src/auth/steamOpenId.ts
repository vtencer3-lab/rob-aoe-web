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
  const claimed = params.get("openid.claimed_id");
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
  return /^is_valid\s*:\s*true\s*$/m.test(responseBody);
}

export async function verifyWithSteam(
  params: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const res = await fetchImpl(STEAM_OPENID, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildVerificationBody(params).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return false;
  return isVerified(await res.text());
}
