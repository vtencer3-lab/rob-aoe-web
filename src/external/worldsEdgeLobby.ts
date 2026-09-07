/**
 * Seznam otevřených lobby ze stejného backendu, ze kterého web bere žebříček.
 * Nezdokumentovaný, bez přihlášení, vrací všechny veřejné lobby před startem
 * hry. Ověřeno 7. 9. 2026: `id` inzerátu je přesně číslo z odkazu
 * `aoe2de://0/<id>`, host i členové jsou v `avatars` pod `/steam/<steamId>`.
 *
 * Endpoint žádné filtrování neumí (parametry ignoruje), takže se vždycky
 * stáhne celý seznam a vybírá se až tady. Nikdy nesahat na vlastnost bez
 * kontroly typu — prvky polí nemusí být objekty.
 */
export interface LobbyInzerat {
  /** Číslo lobby, totéž jako v `aoe2de://0/<id>`. */
  lobbyId: string;
  hostSteamId: string | null;
  nazev: string;
  maHeslo: boolean;
  povolujeDivaky: boolean;
  /** Steam ID všech, kdo v lobby sedí (včetně hosta). */
  clenoveSteamIds: string[];
}

const ZAKLAD = "https://aoe-api.worldsedgelink.com/community/advertisement";
const STEAM_PREFIX = "/steam/";

function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null;
}

function cisloJakoText(hodnota: unknown): string | null {
  if (typeof hodnota === "number" && Number.isSafeInteger(hodnota) && hodnota > 0) {
    return String(hodnota);
  }
  if (typeof hodnota === "string" && /^\d+$/.test(hodnota)) return hodnota;
  return null;
}

/** Z pole `avatars` postaví mapu profile_id → Steam ID (jen účty ze Steamu). */
function mapaSteamId(avatars: unknown): Map<number, string> {
  const mapa = new Map<number, string>();
  if (!Array.isArray(avatars)) return mapa;
  for (const a of avatars) {
    if (!jeObjekt(a)) continue;
    const id = a["profile_id"];
    const name = a["name"];
    if (typeof id !== "number" || typeof name !== "string") continue;
    if (!name.startsWith(STEAM_PREFIX)) continue;
    const steamId = name.slice(STEAM_PREFIX.length);
    if (/^\d{17}$/.test(steamId)) mapa.set(id, steamId);
  }
  return mapa;
}

export function parseAdvertisements(json: unknown): LobbyInzerat[] {
  if (!jeObjekt(json)) return [];
  const matches = json["matches"];
  if (!Array.isArray(matches)) return [];
  const steam = mapaSteamId(json["avatars"]);

  const vysledek: LobbyInzerat[] = [];
  for (const m of matches) {
    if (!jeObjekt(m)) continue;
    const lobbyId = cisloJakoText(m["id"]);
    if (!lobbyId) continue;
    const host = m["host_profile_id"];
    const clenove: string[] = [];
    const members = m["matchmembers"];
    if (Array.isArray(members)) {
      for (const c of members) {
        if (!jeObjekt(c)) continue;
        const pid = c["profile_id"];
        const sid = typeof pid === "number" ? steam.get(pid) : undefined;
        if (sid) clenove.push(sid);
      }
    }
    vysledek.push({
      lobbyId,
      hostSteamId: typeof host === "number" ? (steam.get(host) ?? null) : null,
      nazev: typeof m["description"] === "string" ? m["description"] : "",
      maHeslo: m["passwordprotected"] === 1 || m["passwordprotected"] === true,
      povolujeDivaky: m["isobservable"] === 1 || m["isobservable"] === true,
      clenoveSteamIds: clenove,
    });
  }
  return vysledek;
}

export async function fetchAdvertisements(
  fetchImpl: typeof fetch = fetch,
): Promise<LobbyInzerat[]> {
  const res = await fetchImpl(`${ZAKLAD}/findAdvertisements?title=age2`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parseAdvertisements(await res.json());
}
