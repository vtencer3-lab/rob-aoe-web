import { createHash, randomBytes } from "node:crypto";

const AUTORIZACE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
export const TOKEN_URL = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

/**
 * Adresa, na kterou Microsoft vrací kód. Jedno místo pro obě strany: staví ji
 * odchozí požadavek i výměna tokenu, takže se nemůžou rozejít — a Microsoft
 * obě porovnává.
 */
export function navratovaUrlMicrosoft(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/api/auth/microsoft/return`;
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * PKCE. Web sice má client secret, ale kód putuje přes prohlížeč uživatele —
 * verifier je to jediné, co drží útočníka, který kód odchytí, dál od tokenu.
 */
export function vytvorPkce(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildAuthUrlMicrosoft(
  baseUrl: string,
  clientId: string,
  state: string,
  challenge: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: navratovaUrlMicrosoft(baseUrl),
    // Nic než přihlášení k Xboxu nepotřebujeme: žádný e-mail, žádný profil
    // a hlavně žádný offline_access — refresh token by byl jen tajemství
    // navíc, které by se muselo hlídat.
    scope: "XboxLive.signin",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTORIZACE}?${params.toString()}`;
}

export function buildTokenBody(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
  kod: string,
  verifier: string,
): URLSearchParams {
  return new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: kod,
    grant_type: "authorization_code",
    redirect_uri: navratovaUrlMicrosoft(baseUrl),
    code_verifier: verifier,
  });
}
