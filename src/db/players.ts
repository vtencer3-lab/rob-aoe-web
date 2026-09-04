import { getPool } from "./pool.js";

export interface PlayerRow {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  avatarUrl: string | null;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
  steamHodiny: number | null;
  statyStazenyV: Date | null;
  statyChyba: string | null;
  jeAdmin: boolean;
}

export interface PlayerStatsUpdate {
  alias?: string | null;
  steamName?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  elo1v1?: number | null;
  eloNejvyssi?: number | null;
  odehranoHer?: number | null;
  posledniZapas?: Date | null;
  steamHodiny?: number | null;
  chyba: string | null;
}

// Sdílený seznam sloupců tabulky player — jediné místo, které zná jejich
// jména. `listSignups` v events.ts z něj skládá stejný seznam s aliasem
// tabulky, aby JOINy nemusely sloupce vyjmenovávat znovu a nezávisle.
export const PLAYER_SLOUPEC_NAZVY = [
  "steam_id",
  "alias",
  "steam_name",
  "avatar_url",
  "country",
  "elo_1v1",
  "elo_nejvyssi",
  "odehrano_her",
  "posledni_zapas",
  "steam_hodiny",
  "staty_stazeny_v",
  "staty_chyba",
  "je_admin",
] as const;

const SLOUPCE = PLAYER_SLOUPEC_NAZVY.join(", ");

export interface DbRow {
  steam_id: string;
  alias: string | null;
  steam_name: string | null;
  avatar_url: string | null;
  country: string | null;
  elo_1v1: number | null;
  elo_nejvyssi: number | null;
  odehrano_her: number | null;
  posledni_zapas: Date | null;
  steam_hodiny: number | null;
  staty_stazeny_v: Date | null;
  staty_chyba: string | null;
  je_admin: boolean;
}

export function mapuj(row: DbRow): PlayerRow {
  return {
    steamId: row.steam_id,
    alias: row.alias,
    steamName: row.steam_name,
    avatarUrl: row.avatar_url,
    country: row.country,
    elo1v1: row.elo_1v1,
    eloNejvyssi: row.elo_nejvyssi,
    odehranoHer: row.odehrano_her,
    posledniZapas: row.posledni_zapas,
    steamHodiny: row.steam_hodiny,
    statyStazenyV: row.staty_stazeny_v,
    statyChyba: row.staty_chyba,
    jeAdmin: row.je_admin,
  };
}

export async function upsertPlayer(steamId: string, jeAdmin: boolean): Promise<PlayerRow> {
  const { rows } = await getPool().query<DbRow>(
    `INSERT INTO player (steam_id, je_admin) VALUES ($1, $2)
     ON CONFLICT (steam_id) DO UPDATE SET je_admin = EXCLUDED.je_admin
     RETURNING ${SLOUPCE}`,
    [steamId, jeAdmin],
  );
  return mapuj(rows[0]!);
}

export async function savePlayerStats(steamId: string, staty: PlayerStatsUpdate): Promise<void> {
  await getPool().query(
    `UPDATE player SET
       alias           = COALESCE($2, alias),
       steam_name      = COALESCE($3, steam_name),
       avatar_url      = COALESCE($4, avatar_url),
       country         = COALESCE($5, country),
       elo_1v1         = COALESCE($6, elo_1v1),
       elo_nejvyssi    = COALESCE($7, elo_nejvyssi),
       odehrano_her    = COALESCE($8, odehrano_her),
       posledni_zapas  = COALESCE($9, posledni_zapas),
       steam_hodiny    = CASE WHEN $10::boolean THEN $11::integer ELSE steam_hodiny END,
       staty_stazeny_v = now(),
       staty_chyba     = $12
     WHERE steam_id = $1`,
    [
      steamId,
      staty.alias ?? null,
      staty.steamName ?? null,
      staty.avatarUrl ?? null,
      staty.country ?? null,
      staty.elo1v1 ?? null,
      staty.eloNejvyssi ?? null,
      staty.odehranoHer ?? null,
      staty.posledniZapas ?? null,
      "steamHodiny" in staty,
      staty.steamHodiny ?? null,
      staty.chyba,
    ],
  );
}

export async function getPlayer(steamId: string): Promise<PlayerRow | null> {
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SLOUPCE} FROM player WHERE steam_id = $1`,
    [steamId],
  );
  return rows[0] ? mapuj(rows[0]) : null;
}

export async function getPlayers(steamIds: string[]): Promise<PlayerRow[]> {
  if (steamIds.length === 0) return [];
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SLOUPCE} FROM player WHERE steam_id = ANY($1::text[])`,
    [steamIds],
  );
  return rows.map(mapuj);
}
