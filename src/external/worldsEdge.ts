export interface LeaderboardStats {
  alias: string;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
}

/** SOLO_RM_RANKED — 1v1 Random Map. Ostatní žebříčky se ignorují. */
const ZEBRICEK_1V1 = 3;

const ZAKLAD = "https://aoe-api.worldsedgelink.com/community/leaderboard";

interface Member {
  name?: unknown;
  alias?: unknown;
  personal_statgroup_id?: unknown;
  country?: unknown;
}

function cisloNeboNull(hodnota: unknown): number | null {
  return typeof hodnota === "number" && Number.isFinite(hodnota) ? hodnota : null;
}

/** Undocumented upstream — elementy pole nemusí být objekty. Nikdy nesahat na vlastnost bez tohoto testu. */
function jeObjekt(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null;
}

export function parsePersonalStat(json: unknown, steamId: string): LeaderboardStats | null {
  if (!jeObjekt(json)) return null;
  const data = json as { statGroups?: unknown; leaderboardStats?: unknown };
  if (!Array.isArray(data.statGroups)) return null;

  const hledane = `/steam/${steamId}`;
  let member: Member | undefined;
  for (const skupina of data.statGroups) {
    if (!jeObjekt(skupina)) continue;
    const members = skupina.members;
    if (!Array.isArray(members)) continue;
    const nalezeny = members.find((m) => jeObjekt(m) && m.name === hledane) as Member | undefined;
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

  return {
    alias: member.alias,
    country: typeof member.country === "string" ? member.country : null,
    elo1v1: radek ? cisloNeboNull(radek["rating"]) : null,
    eloNejvyssi: radek ? cisloNeboNull(radek["highestrating"]) : null,
    odehranoHer: wins !== null && losses !== null ? wins + losses : null,
    posledniZapas: lastMatch !== null ? new Date(lastMatch * 1000) : null,
  };
}

export async function fetchPersonalStat(
  steamId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LeaderboardStats | null> {
  const profily = encodeURIComponent(JSON.stringify([`/steam/${steamId}`]));
  const url = `${ZAKLAD}/getPersonalStat?title=age2&profile_names=${profily}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Worlds Edge odpovědělo ${res.status}`);
  return parsePersonalStat(await res.json(), steamId);
}
