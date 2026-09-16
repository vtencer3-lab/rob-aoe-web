import { buildTokenBody, TOKEN_URL } from "../auth/microsoftOAuth.js";

/**
 * Výměna autorizačního kódu za Microsoft access token — jediné odchozí volání
 * webu, které nese `client_secret`.
 *
 * Bydlí tady, mezi ostatními odchozími voláními, a bere `fetchImpl` jako
 * poslední parametr ze stejného důvodu jako `steam.ts`, `worldsEdge.ts` a
 * `xboxLive.ts`: bez toho se nedá hermeticky ověřit, jak se poskládá tělo,
 * co se stane s neúspěšnou odpovědí ani co s odpovědí, která není JSON.
 * Dřív sedělo inline ve `vychoziDeps()` v `src/http/server.ts`, kde ho testy
 * podstrkovaly celé, a tím pádem se neověřovalo nic z toho.
 *
 * Parametry jsou v objektu schválně: pět řetězců za sebou by se dalo prohodit
 * a záměna `clientId` s `clientSecret` by se poznala až na živém přihlášení.
 */
export interface VymenaKodu {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  /** Kód z návratu od Microsoftu. */
  kod: string;
  /** PKCE verifier z cookie, kterou drží odchozí krok. */
  verifier: string;
}

/**
 * Hláška je jedna pro všechny způsoby selhání a **nikdy neobsahuje nic
 * z odpovědi ani z požadavku**: `microsoftRoutes.ts` ji posílá rovnou hráči
 * do prohlížeče, takže cokoliv odsud je veřejné. Tajemství ani token se tedy
 * ven nedostane ani omylem.
 */
const CHYBA = "Microsoft nevydal přihlašovací token.";

export async function vymenKodZaToken(
  parametry: VymenaKodu,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: buildTokenBody(
      parametry.baseUrl,
      parametry.clientId,
      parametry.clientSecret,
      parametry.kod,
      parametry.verifier,
    ).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  // Rozvadeč před Microsoftem umí vrátit HTML se stavem 200; `json()` na tom
  // vyhodí SyntaxError, který by hráči vypadl místo hlášky.
  const json: unknown = await res.json().catch(() => null);
  const token =
    typeof json === "object" && json !== null
      ? (json as Record<string, unknown>)["access_token"]
      : null;
  if (!res.ok || typeof token !== "string") throw new Error(CHYBA);
  return token;
}
