import type { Vlastnictvi } from "../shared/types.js";

const XBL = "https://user.auth.xboxlive.com/user/authenticate";
const XSTS = "https://xsts.auth.xboxlive.com/xsts/authorize";
const PROFIL = "https://profile.xboxlive.com";
const TITULY = "https://titlehub.xboxlive.com";

/**
 * AoE2 DE v herní historii. Naměřeno sondou 16. 9. 2026. Porovnává se id,
 * ne jméno: v téže historii sedí i Age of Empires Online (1297289123), takže
 * hledání podle „Age of Empires“ by sedlo na špatnou hru.
 */
const AOE2_TITLE_ID = "2064168993";

export interface XboxIdentita {
  xuid: string;
  gamertag: string;
  /** User hash; patří do hlavičky Authorization vedle tokenu. */
  uhs: string;
  token: string;
}

/** Undocumented upstream — elementy pole nemusí být objekty. Nikdy nesahat na vlastnost bez tohoto testu. */
function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null;
}

/**
 * Xbox nevrací HTTP chybu, ale 401 s číslem v `XErr`. Dvě čísla znamenají něco,
 * s čím hráč sám něco udělat může — a jen ta dvě má smysl překládat.
 */
export function parseXstsChybu(json: unknown): string | null {
  if (!jeObjekt(json)) return null;
  const kod = json["XErr"];
  if (typeof kod !== "number") return null;
  if (kod === 2148916233) {
    return "Tenhle Microsoft účet nemá Xbox profil. Založ si ho na xbox.com a zkus to znovu.";
  }
  if (kod === 2148916238) {
    return "Dětský účet se musí nejdřív přidat do rodiny na Xboxu.";
  }
  return `Xbox přihlášení odmítl (kód ${kod}).`;
}

/**
 * XBL krok (`user/authenticate`) vrací `DisplayClaims.xui[0]` jen s `uhs` —
 * gamertag a XUID se objeví teprve u XSTS. `xui[0]` navíc nese víc klíčů
 * (usr, utr, prv, agg, ugc…), které se ignorují.
 */
export function parseXstsIdentitu(json: unknown): Omit<XboxIdentita, "token"> | null {
  if (!jeObjekt(json)) return null;
  const claims = json["DisplayClaims"];
  if (!jeObjekt(claims)) return null;
  const xui = claims["xui"];
  if (!Array.isArray(xui) || !jeObjekt(xui[0])) return null;
  const { uhs, xid, gtg } = xui[0];
  if (typeof uhs !== "string" || typeof xid !== "string" || typeof gtg !== "string") return null;
  return { uhs, xuid: xid, gamertag: gtg };
}

export function parseGamerpic(json: unknown): string | null {
  if (!jeObjekt(json)) return null;
  const users = json["profileUsers"];
  if (!Array.isArray(users) || !jeObjekt(users[0])) return null;
  const settings = users[0]["settings"];
  if (!Array.isArray(settings)) return null;
  const pic = settings.find((s) => jeObjekt(s) && s["id"] === "GameDisplayPicRaw");
  const value = jeObjekt(pic) ? pic["value"] : null;
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * Stav vlastnictví plus datum posledního spuštění. Obojí se čte ze stejného
 * záznamu `titles[]`, takže jde o jednu funkci, ne dvě: druhá by musela buď
 * parsovat tutéž odpověď znovu (riziko, že se při změně tvaru Xboxu rozjedou),
 * nebo by si musely posílat rozparsovaný titul mezi sebou, což je zbytečná
 * vazba navíc — jediný volající (`nactiVlastnictvi`) obě hodnoty stejně
 * potřebuje pohromadě.
 */
export interface HerniHistorie {
  stav: Vlastnictvi;
  /**
   * Kdy hráč hru na tomhle účtu naposledy spustil (`titleHistory.lastTimePlayed`).
   * `null` když ji nemá, má skryté soukromí, nebo Xbox u nalezeného titulu
   * datum nevrátil / vrátil nesmysl — nikdy nepadá, jen datum nenastaví.
   */
  hranoV: Date | null;
}

/**
 * Skryté soukromí a chybějící hra jsou dvě různé věci: Xbox na skrytou historii
 * odpoví bez pole `titles`. Sloučit je by znamenalo ukázat vykřičník člověku,
 * který hru má — přesně to, kvůli čemu má `soukromy` vlastní stav už u Steamu.
 */
export function parseHerniHistorii(json: unknown): HerniHistorie {
  if (!jeObjekt(json)) return { stav: "soukromy", hranoV: null };
  const titles = json["titles"];
  if (!Array.isArray(titles)) return { stav: "soukromy", hranoV: null };
  const nalezen = titles.find((t) => jeObjekt(t) && String(t["titleId"]) === AOE2_TITLE_ID);
  if (!jeObjekt(nalezen)) return { stav: "nema", hranoV: null };
  const historie = nalezen["titleHistory"];
  const raw = jeObjekt(historie) ? historie["lastTimePlayed"] : null;
  const datum = typeof raw === "string" ? new Date(raw) : null;
  return { stav: "ma", hranoV: datum && !Number.isNaN(datum.getTime()) ? datum : null };
}

async function postJson(
  url: string,
  telo: unknown,
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; json: unknown }> {
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(telo),
    signal: AbortSignal.timeout(10_000),
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

/**
 * Microsoft token → XSTS. Prefix `d=` u `RpsTicket` je povinný pro vlastní
 * registraci aplikace; bez něj Xbox ticket odmítne a hláška to neprozradí.
 */
export async function ziskejXboxIdentitu(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<XboxIdentita> {
  const xbl = await postJson(
    XBL,
    {
      Properties: {
        AuthMethod: "RPS",
        SiteName: "user.auth.xboxlive.com",
        RpsTicket: `d=${accessToken}`,
      },
      RelyingParty: "http://auth.xboxlive.com",
      TokenType: "JWT",
    },
    fetchImpl,
  );
  const uzivatelskyToken = jeObjekt(xbl.json) ? xbl.json["Token"] : null;
  if (!xbl.ok || typeof uzivatelskyToken !== "string") {
    throw new Error(parseXstsChybu(xbl.json) ?? "Xbox Live nepřijal přihlášení.");
  }

  const xsts = await postJson(
    XSTS,
    {
      Properties: { SandboxId: "RETAIL", UserTokens: [uzivatelskyToken] },
      RelyingParty: "http://xboxlive.com",
      TokenType: "JWT",
    },
    fetchImpl,
  );
  if (!xsts.ok) throw new Error(parseXstsChybu(xsts.json) ?? "Xbox přihlášení odmítl.");

  const identita = parseXstsIdentitu(xsts.json);
  const token = jeObjekt(xsts.json) ? xsts.json["Token"] : null;
  if (!identita || typeof token !== "string") {
    throw new Error("Xbox nevrátil identifikátor účtu.");
  }
  return { ...identita, token };
}

function hlavicka(id: XboxIdentita, verze: string): Record<string, string> {
  return {
    Authorization: `XBL3.0 x=${id.uhs};${id.token}`,
    accept: "application/json",
    "x-xbl-contract-version": verze,
  };
}

export async function nactiGamerpic(
  id: XboxIdentita,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const url = `${PROFIL}/users/xuid(${id.xuid})/profile/settings?settings=GameDisplayPicRaw`;
  const res = await fetchImpl(url, { headers: hlavicka(id, "3"), signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Xbox profil odpověděl ${res.status}`);
  return parseGamerpic(await res.json());
}

/**
 * `undefined` = nepovedlo se zeptat, hodnotu v databázi nesaháme. Stejná úmluva
 * jako u `nactiHru` ve `steam.ts`.
 */
export async function nactiVlastnictvi(
  id: XboxIdentita,
  fetchImpl: typeof fetch = fetch,
): Promise<HerniHistorie | undefined> {
  const url = `${TITULY}/users/xuid(${id.xuid})/titles/titlehistory/decoration/detail`;
  const res = await fetchImpl(url, {
    headers: { ...hlavicka(id, "2"), "accept-language": "en-US" },
    signal: AbortSignal.timeout(10_000),
  });
  // 403 je odpověď na skryté soukromí, ne porucha.
  if (res.status === 403) return { stav: "soukromy", hranoV: null };
  if (!res.ok) return undefined;
  return parseHerniHistorii(await res.json());
}
