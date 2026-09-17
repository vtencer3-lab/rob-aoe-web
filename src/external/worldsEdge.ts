import type { ZebricekRadek } from "../shared/zebricky.js";

export interface LeaderboardStats {
  alias: string;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
  /** Všechny žebříčky hráče (pro kartu se statistikami); prázdné = nikde nehrál. */
  zebricky: ZebricekRadek[];
  /** Kanonické jméno profilu, `/steam/…` nebo `/xboxlive/…`. */
  profil: string | null;
  /** Číslo profilu; používá ho obnova statistik i rozpoznání v lobby. */
  profilId: number | null;
}

/** SOLO_RM_RANKED — 1v1 Random Map. Ostatní žebříčky se ignorují. */
const ZEBRICEK_1V1 = 3;

const ZAKLAD = "https://aoe-api.worldsedgelink.com/community/leaderboard";

/** Rozšířit o dvě pole, která se dosud nečetla. */
interface Member {
  name?: unknown;
  alias?: unknown;
  personal_statgroup_id?: unknown;
  country?: unknown;
  profile_id?: unknown;
}

function cisloNeboNull(hodnota: unknown): number | null {
  return typeof hodnota === "number" && Number.isFinite(hodnota) ? hodnota : null;
}

/** Undocumented upstream — elementy pole nemusí být objekty. Nikdy nesahat na vlastnost bez tohoto testu. */
function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null;
}

/**
 * Najde člena podle vlastní podmínky; zbytek zpracování je pro obě platformy
 * stejný. Dosud bylo hledání podle `/steam/<id>` zadrátované uvnitř, takže
 * Xbox větev by se od Steam větve mohla nepozorovaně rozejít.
 */
function statyZOdpovedi(
  json: unknown,
  vyhovuje: (member: Record<string, unknown>) => boolean,
): LeaderboardStats | null {
  if (!jeObjekt(json)) return null;
  const data = json as { statGroups?: unknown; leaderboardStats?: unknown };
  if (!Array.isArray(data.statGroups)) return null;

  let member: Member | undefined;
  for (const skupina of data.statGroups) {
    if (!jeObjekt(skupina)) continue;
    const members = skupina.members;
    if (!Array.isArray(members)) continue;
    const nalezeny = members.find((m) => jeObjekt(m) && vyhovuje(m)) as Member | undefined;
    if (nalezeny) {
      member = nalezeny;
      break;
    }
  }
  if (!member || typeof member.alias !== "string") return null;

  const statgroupId = member.personal_statgroup_id;
  const staty = Array.isArray(data.leaderboardStats) ? data.leaderboardStats : [];
  const radek = staty.find(
    (s) => jeObjekt(s) && s["statgroup_id"] === statgroupId && s["leaderboard_id"] === ZEBRICEK_1V1,
  ) as Record<string, unknown> | undefined;

  const wins = radek ? cisloNeboNull(radek["wins"]) : null;
  const losses = radek ? cisloNeboNull(radek["losses"]) : null;
  const lastMatch = radek ? cisloNeboNull(radek["lastmatchdate"]) : null;

  // Všechny žebříčky hráče, jak je hra ukazuje po najetí na jméno v lobby.
  const zebricky: ZebricekRadek[] = [];
  for (const s of staty) {
    if (!jeObjekt(s) || s["statgroup_id"] !== statgroupId) continue;
    const id = cisloNeboNull(s["leaderboard_id"]);
    if (id === null) continue;
    zebricky.push({
      id,
      rating: cisloNeboNull(s["rating"]),
      nejvyssi: cisloNeboNull(s["highestrating"]),
      poradi: cisloNeboNull(s["rank"]),
      vyhry: cisloNeboNull(s["wins"]) ?? 0,
      prohry: cisloNeboNull(s["losses"]) ?? 0,
    });
  }

  return {
    alias: member.alias,
    country: typeof member.country === "string" ? member.country : null,
    elo1v1: radek ? cisloNeboNull(radek["rating"]) : null,
    eloNejvyssi: radek ? cisloNeboNull(radek["highestrating"]) : null,
    odehranoHer: wins !== null && losses !== null ? wins + losses : null,
    posledniZapas: lastMatch !== null ? new Date(lastMatch * 1000) : null,
    zebricky,
    profil: typeof member.name === "string" ? member.name : null,
    profilId: cisloNeboNull(member.profile_id),
  };
}

export function parsePersonalStat(json: unknown, hracId: string): LeaderboardStats | null {
  return statyZOdpovedi(json, (m) => m["name"] === `/steam/${hracId}`);
}

/**
 * Dohledání podle herního jména. `vyzadovanyPrefix` je pojistka: žebříček je
 * pro Steam i Xbox společný, takže bez něj by Microsoft hráč dostal
 * statistiky cizího Steam hráče, který má shodou okolností stejný alias.
 */
export function parsePersonalStatPodleAliasu(
  json: unknown,
  alias: string,
  vyzadovanyPrefix = "/xboxlive/",
): LeaderboardStats | null {
  return statyZOdpovedi(
    json,
    (m) =>
      m["alias"] === alias &&
      typeof m["name"] === "string" &&
      m["name"].startsWith(vyzadovanyPrefix),
  );
}

export function parsePersonalStatPodleProfilu(
  json: unknown,
  profilId: number,
): LeaderboardStats | null {
  return statyZOdpovedi(json, (m) => m["profile_id"] === profilId);
}

export async function fetchPersonalStat(
  hracId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const profily = encodeURIComponent(JSON.stringify([`/steam/${hracId}`]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&profile_names=${profily}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStat(await res.json(), hracId);
}

/**
 * První dohledání Microsoft hráče: přihlášení zná jen gamertag (alias),
 * profil se stálým číslem se dozvíme až z týhle odpovědi.
 */
export async function fetchPersonalStatPodleAliasu(
  alias: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const aliasy = encodeURIComponent(JSON.stringify([alias]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&aliases=${aliasy}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStatPodleAliasu(await res.json(), alias);
}

/**
 * Každá další obnova Microsoft hráče: podle profil_id, protože alias
 * (gamertag) si jde ve hře kdykoliv změnit.
 */
export async function fetchPersonalStatPodleProfilu(
  profilId: number,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const profily = encodeURIComponent(JSON.stringify([profilId]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&profile_ids=${profily}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStatPodleProfilu(await res.json(), profilId);
}
