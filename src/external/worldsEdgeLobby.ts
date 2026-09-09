import { inflateSync } from "node:zlib";
import type { AiSlot, PoznatekLobby, SlotLobby } from "../shared/lobbyKontrola.js";
import type { Barva, Tym } from "../shared/types.js";

/**
 * Seznam otevřených lobby ze stejného backendu, ze kterého web bere žebříček.
 * Nezdokumentovaný, bez přihlášení, vrací veřejné lobby před startem hry.
 * Ověřeno 7. 9. 2026: `id` inzerátu je přesně číslo z odkazu
 * `aoe2de://0/<id>`, host i členové jsou v `avatars` pod `/steam/<steamId>`.
 *
 * Endpoint vrací nejvýš 100 lobby na stránku (nejnovější první) a starší
 * odsouvá na `start=100`, `start=200`, … Filtrovat neumí (parametry
 * ignoruje), takže se stáhnou všechny stránky a vybírá se až tady.
 *
 * Sloty a nastavení jsou zabalené: base64 → zlib → text, u slotů „N,[…]“
 * s JSON polem, u nastavení JSON řetězec s dalším base64, ve kterém je bajt
 * s počtem položek a pak řetězce „klíč:hodnota“ s délkou (uint32 LE) před
 * sebou. Metadata slotu mají stejný tvar (klíč, hodnota, klíč, hodnota…).
 * Co který klíč znamená, je zmapované naživo 7. 9. 2026
 * (docs/analyza-automaticke-hledani-lobby.md). Nikdy nesahat na vlastnost
 * bez kontroly typu — prvky polí nemusí být objekty.
 */
export interface LobbyInzerat extends PoznatekLobby {
  nazev: string;
  /** Steam ID všech, kdo v lobby sedí (včetně hosta). Totéž co sloty, jen jména. */
  clenoveSteamIds: string[];
}

const ZAKLAD = "https://aoe-api.worldsedgelink.com/community/advertisement";
const STEAM_PREFIX = "/steam/";
const STRANKA = 100;

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

/** Bajt s počtem, pak řetězce s délkou uint32 LE před sebou. */
function retezceSDelkou(raw: Buffer): string[] {
  const out: string[] = [];
  let i = 1;
  while (i + 4 <= raw.length) {
    const delka = raw.readUInt32LE(i);
    i += 4;
    if (i + delka > raw.length) break;
    out.push(raw.subarray(i, i + delka).toString("utf8"));
    i += delka;
  }
  return out;
}

function rozbal(zabalene: unknown): string | null {
  if (typeof zabalene !== "string" || zabalene === "") return null;
  try {
    return inflateSync(Buffer.from(zabalene, "base64")).toString("utf8");
  } catch {
    return null;
  }
}

/** options: zlib → JSON řetězec → base64 → „klíč:hodnota“ po řetězcích. */
export function parseOptions(zabalene: unknown): Map<string, string> | null {
  const text = rozbal(zabalene);
  if (text === null) return null;
  try {
    const vnitrek: unknown = JSON.parse(text);
    if (typeof vnitrek !== "string") return null;
    const mapa = new Map<string, string>();
    for (const polozka of retezceSDelkou(Buffer.from(vnitrek, "base64"))) {
      const i = polozka.indexOf(":");
      if (i > 0) mapa.set(polozka.slice(0, i), polozka.slice(i + 1));
    }
    return mapa;
  } catch {
    return null;
  }
}

const cislo = (hodnota: string | undefined): number | null => {
  if (hodnota === undefined) return null;
  const n = Number(hodnota);
  return Number.isFinite(n) ? n : null;
};

/** Klíče `options` → položky nastavení; zaškrtávátka jsou „y“/„n“. Mapa viz docs §6. */
export function nastaveniZOptions(o: Map<string, string>): NonNullable<PoznatekLobby["nastaveni"]> {
  const ano = (klic: string): boolean | null => (o.has(klic) ? o.get(klic) === "y" : null);
  return {
    mapaId: cislo(o.get("10")),
    velikost: cislo(o.get("8")),
    rychlost: cislo(o.get("41")),
    populace: cislo(o.get("28")),
    vitezstvi: cislo(o.get("81")),
    cheaty: ano("1"),
    sadaCivilizaci: cislo(o.get("101")),
    rezim: cislo(o.get("5")),
    aiObtiznost: cislo(o.get("61")),
    suroviny: cislo(o.get("37")),
    odkrytiMapy: cislo(o.get("82")),
    pocatecniVek: cislo(o.get("0")),
    konecnyVek: cislo(o.get("4")),
    primeri: cislo(o.get("57")),
    lockTeams: ano("66"),
    teamTogether: ano("78"),
    teamPositions: ano("77"),
    sharedExploration: ano("76"),
    lockSpeed: ano("65"),
    turbo: ano("79"),
    fullTechTree: ano("62"),
    empireWars: ano("89"),
    suddenDeath: ano("90"),
    regicide: ano("91"),
    antiquity: ano("100"),
    recordGame: ano("75"),
  };
}

/**
 * Metadata slotu: „ScenarioPlayerIndex“ 0–7 je barva 1–8 (−1 = random),
 * „Team“ 1 je „–“, 2–5 tým 1–4, 6 náhodný. Čte se stejně u člověka i u AI —
 * liší se jen tím, že u AI k tomu není žádné id.
 */
function slotZMetadat(slot: Record<string, unknown>): AiSlot {
  let barva: Barva | null = null;
  let tym: Tym | "?" | null = null;
  let civ: number | null = null;
  const meta = slot["metaData"];
  if (typeof meta === "string") {
    try {
      const vnitrek: unknown = JSON.parse(Buffer.from(meta, "base64").toString("utf8"));
      if (typeof vnitrek === "string") {
        const polozky = retezceSDelkou(Buffer.from(vnitrek, "base64"));
        const dvojice = new Map<string, string>();
        for (let i = 0; i + 1 < polozky.length; i += 2) dvojice.set(polozky[i]!, polozky[i + 1]!);
        const index = cislo(dvojice.get("ScenarioPlayerIndex"));
        if (index !== null && index >= 0 && index <= 7) barva = (index + 1) as Barva;
        // Klíč „1“: herní id civilizace; hodnoty s nastaveným horním slovem
        // (65537 = 0x10001) jsou náhodná volba, ne konkrétní civilizace.
        const c = cislo(dvojice.get("1"));
        if (c !== null && c > 0 && c < 65536) civ = c;
        const t = cislo(dvojice.get("Team"));
        if (t === 6) tym = "?";
        else if (t !== null && t >= 1 && t <= 5) tym = (t - 1) as Tym;
      }
    } catch {
      // Nečitelná metadata: barva i tým zůstanou null a kontrola to řekne.
    }
  }
  return { barva, tym, civ, pripraven: slot["isReady"] === 1 };
}

/**
 * Stav slotu (`status`), jak ho posílá hra — odečteno z živé lobby
 * 9. 9. 2026: 0 sedí člověk, 1 slot je prázdný, 2 sedí počítač.
 */
const STAV_AI = 2;

/**
 * slotinfo: zlib → „N,[sloty…]“. Lidi a AI zvlášť.
 *
 * AI má stejně jako prázdný slot `profileInfo.id` −1, takže se pozná až
 * podle stavu slotu a podle toho, že má vyplněná metadata (prázdný slot má
 * `"AA=="`, tedy nic). Barvu a tým z nich přečte stejná funkce jako u lidí.
 */
export function parseSloty(
  zabalene: unknown,
  steam: Map<number, string>,
): { lide: SlotLobby[]; ai: AiSlot[] } {
  const prazdne = { lide: [], ai: [] };
  const text = rozbal(zabalene);
  if (text === null) return prazdne;
  const carka = text.indexOf(",");
  if (carka === -1) return prazdne;
  const zbytek = text.slice(carka + 1);
  // Za polem může být ještě něco (nula) — JSON.parse by na tom spadl, takže
  // se vezme jen část po uzavírací hranaté závorce.
  const konec = zbytek.lastIndexOf("]");
  if (konec === -1) return prazdne;
  let pole: unknown;
  try {
    pole = JSON.parse(zbytek.slice(0, konec + 1));
  } catch {
    return prazdne;
  }
  if (!Array.isArray(pole)) return prazdne;
  const lide: SlotLobby[] = [];
  const ai: AiSlot[] = [];
  for (const s of pole) {
    if (!jeObjekt(s)) continue;
    const pid = s["profileInfo.id"];
    const steamId = typeof pid === "number" ? steam.get(pid) : undefined;
    if (steamId) {
      lide.push({ steamId, ...slotZMetadat(s) });
      continue;
    }
    if (s["status"] === STAV_AI) ai.push(slotZMetadat(s));
  }
  return { lide, ai };
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
    const options = parseOptions(m["options"]);
    vysledek.push({
      lobbyId,
      hostSteamId: typeof host === "number" ? (steam.get(host) ?? null) : null,
      nazev: typeof m["description"] === "string" ? m["description"] : "",
      maHeslo: m["passwordprotected"] === 1 || m["passwordprotected"] === true,
      povolujeDivaky: m["isobservable"] === 1 || m["isobservable"] === true,
      clenoveSteamIds: clenove,
      ...(({ lide, ai }) => ({ sloty: lide, aiSloty: ai }))(parseSloty(m["slotinfo"], steam)),
      preLobby: {
        zpozdeniDivaku: typeof m["observerdelay"] === "number" ? m["observerdelay"] : null,
        maxHracu: typeof m["maxplayers"] === "number" ? m["maxplayers"] : null,
        hesloDivaku:
          m["hasobserverpassword"] === undefined ? null : m["hasobserverpassword"] === 1 || m["hasobserverpassword"] === true,
        region: typeof m["relayserver_region"] === "string" ? m["relayserver_region"] : null,
      },
      nastaveni: options ? nastaveniZOptions(options) : null,
    });
  }
  return vysledek;
}

/** Stáhne všechny stránky (po 100) a slije je do jednoho seznamu. */
export async function fetchAdvertisements(
  fetchImpl: typeof fetch = fetch,
): Promise<LobbyInzerat[]> {
  const vsechny: LobbyInzerat[] = [];
  for (let start = 0; start < 1000; start += STRANKA) {
    const res = await fetchImpl(`${ZAKLAD}/findAdvertisements?title=age2&start=${start}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
    const json: unknown = await res.json();
    const stranka = parseAdvertisements(json);
    vsechny.push(...stranka);
    const surovych = jeObjekt(json) && Array.isArray(json["matches"]) ? json["matches"].length : 0;
    if (surovych < STRANKA) break;
  }
  // Stránky se občas překrývají (mezi dotazy přibude lobby); stejné id jen jednou.
  const podleId = new Map(vsechny.map((l) => [l.lobbyId, l]));
  return [...podleId.values()];
}
