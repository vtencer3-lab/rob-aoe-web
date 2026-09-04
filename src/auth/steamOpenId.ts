const STEAM_OPENID = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_PREFIX = "https://steamcommunity.com/openid/id/";

/**
 * Adresa, na kterou Steam vrací assertion. Jedno místo pro obě strany: staví ji
 * odchozí požadavek i kontrola návratu, takže se nemůžou rozejít.
 */
export function navratovaUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/auth/steam/return`;
}

export function buildAuthUrl(baseUrl: string): string {
  const zaklad = baseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": navratovaUrl(zaklad),
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

/**
 * OpenID 2.0 §11.1 říká MUSÍ: příjemce ověří, že `openid.return_to` míří na
 * URL, na které assertion opravdu přijal. Ve stateless režimu Steam podepíše
 * jen to, že se ten člověk přihlásil — netuší, KDO se ptá. Bez téhle kontroly
 * by tedy assertion vygenerovaná na jakémkoliv jiném webu s „Sign in with
 * Steam" (a těch je v AoE2/CS ekosystému spousta) prošla i tady a založila
 * relaci jako oběť. Kdyby tou obětí byl Rob, je to rovnou admin.
 */
export function maNasNavrat(params: URLSearchParams, baseUrl: string): boolean {
  return params.get("openid.return_to") === navratovaUrl(baseUrl);
}

/**
 * Pole, která musí být v `openid.signed`. Bez `claimed_id` bychom identitu
 * četli z nepodepsané hodnoty; bez `return_to` by šla kontrola výše obejít
 * přepsáním adresy. OpenID 2.0 §10.1 obě vyžaduje a Steam obě posílá —
 * tohle je pojistka, ne nová podmínka.
 */
const POVINNE_PODEPSANE = ["claimed_id", "return_to"] as const;

export function maPodepsanaPovinnaPole(params: URLSearchParams): boolean {
  const signed = params.get("openid.signed");
  if (signed === null) return false;
  const pole = new Set(signed.split(",").map((jmeno) => jmeno.trim()));
  return POVINNE_PODEPSANE.every((jmeno) => pole.has(jmeno));
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
