import type { Vlastnictvi } from "../shared/types.js";
import type { ZebricekRadek } from "../shared/zebricky.js";
import { getPool } from "./pool.js";

export type Platforma = "steam" | "xbox";

export interface PlayerRow {
  hracId: string;
  platforma: Platforma;
  /** Vyplněné jen u Steam hráčů; u Microsoft hráčů null. */
  steamId: string | null;
  xboxXuid: string | null;
  xboxGamertag: string | null;
  /** Kanonické jméno profilu ve Worlds Edge, `/steam/…` nebo `/xboxlive/…`. */
  weProfil: string | null;
  /** Číselný profil ve Worlds Edge; na něm stojí rozpoznání v lobby. */
  weProfilId: number | null;
  alias: string | null;
  platformaJmeno: string | null;
  avatarUrl: string | null;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  posledniZapas: Date | null;
  steamHodiny: number | null;
  /** Vlastnictví hry; null = ještě nezjištěno. */
  hraVlastnictvi: Vlastnictvi | null;
  statyStazenyV: Date | null;
  statyChyba: string | null;
  /** Všechny žebříčky (karta se statistikami); null = ještě nestaženo. */
  zebricky: ZebricekRadek[] | null;
  jeAdmin: boolean;
}

export interface PlayerStatsUpdate {
  alias?: string | null;
  platformaJmeno?: string | null;
  avatarUrl?: string | null;
  country?: string | null;
  elo1v1?: number | null;
  eloNejvyssi?: number | null;
  odehranoHer?: number | null;
  posledniZapas?: Date | null;
  steamHodiny?: number | null;
  hraVlastnictvi?: Vlastnictvi | null;
  zebricky?: ZebricekRadek[] | null;
  /** Kanonické jméno profilu ve Worlds Edge, `/steam/…` nebo `/xboxlive/…`. */
  weProfil?: string | null;
  /** Číselný profil; u Microsoft hráčů z něj jde další obnova, u Steam hráčů se plní zdarma ze stejné odpovědi. */
  weProfilId?: number | null;
  chyba: string | null;
}

// Sdílený seznam sloupců tabulky player — jediné místo, které zná jejich
// jména. `listSignups` v events.ts z něj skládá stejný seznam s aliasem
// tabulky, aby JOINy nemusely sloupce vyjmenovávat znovu a nezávisle.
export const PLAYER_SLOUPEC_NAZVY = [
  "hrac_id",
  "platforma",
  "steam_id",
  "xbox_xuid",
  "xbox_gamertag",
  "we_profil",
  "we_profil_id",
  "alias",
  "platforma_jmeno",
  "avatar_url",
  "country",
  "elo_1v1",
  "elo_nejvyssi",
  "odehrano_her",
  "posledni_zapas",
  "steam_hodiny",
  "hra_vlastnictvi",
  "staty_stazeny_v",
  "staty_chyba",
  "zebricky",
  "je_admin",
] as const;

const SLOUPCE = PLAYER_SLOUPEC_NAZVY.join(", ");

export interface DbRow {
  hrac_id: string;
  platforma: Platforma;
  steam_id: string | null;
  xbox_xuid: string | null;
  xbox_gamertag: string | null;
  we_profil: string | null;
  we_profil_id: number | null;
  alias: string | null;
  platforma_jmeno: string | null;
  avatar_url: string | null;
  country: string | null;
  elo_1v1: number | null;
  elo_nejvyssi: number | null;
  odehrano_her: number | null;
  posledni_zapas: Date | null;
  steam_hodiny: number | null;
  hra_vlastnictvi: Vlastnictvi | null;
  staty_stazeny_v: Date | null;
  staty_chyba: string | null;
  zebricky: ZebricekRadek[] | null;
  je_admin: boolean;
}

export function mapuj(row: DbRow): PlayerRow {
  return {
    hracId: row.hrac_id,
    platforma: row.platforma,
    steamId: row.steam_id,
    xboxXuid: row.xbox_xuid,
    xboxGamertag: row.xbox_gamertag,
    weProfil: row.we_profil,
    weProfilId: row.we_profil_id,
    alias: row.alias,
    platformaJmeno: row.platforma_jmeno,
    avatarUrl: row.avatar_url,
    country: row.country,
    elo1v1: row.elo_1v1,
    eloNejvyssi: row.elo_nejvyssi,
    odehranoHer: row.odehrano_her,
    posledniZapas: row.posledni_zapas,
    steamHodiny: row.steam_hodiny,
    hraVlastnictvi: row.hra_vlastnictvi,
    statyStazenyV: row.staty_stazeny_v,
    statyChyba: row.staty_chyba,
    zebricky: Array.isArray(row.zebricky) ? row.zebricky : null,
    jeAdmin: row.je_admin,
  };
}

/**
 * `jeAdmin === null` znamená "práva nech, jak jsou". Bez toho by nouzový režim
 * ADMIN_BOOTSTRAP nefungoval: dočasnému adminovi by se při druhém přihlášení
 * `je_admin` přepsalo zpátky na false, protože se nerovná prázdnému
 * ADMIN_STEAM_ID. Nový řádek při `null` vzniká vždy jako neadmin.
 */
export async function upsertPlayer(hracId: string, jeAdmin: boolean | null): Promise<PlayerRow> {
  const { rows } = await getPool().query<DbRow>(
    // Zkušební hráč (`test:pepa`) projde toutéž cestou, ale Steam ID nedostane:
    // atrapa pro večer nasucho žádný účet nemá a unikátní hodnotu by jen zabrala.
    `INSERT INTO player (hrac_id, platforma, steam_id, je_admin)
     VALUES ($1, 'steam', CASE WHEN $1 ~ '^\\d{17}$' THEN $1 END,
             COALESCE($2::boolean, false))
     ON CONFLICT (hrac_id) DO UPDATE SET
       steam_id = COALESCE(EXCLUDED.steam_id, player.steam_id),
       je_admin = COALESCE($2::boolean, player.je_admin)
     RETURNING ${SLOUPCE}`,
    [hracId, jeAdmin],
  );
  return mapuj(rows[0]!);
}

/**
 * Klíč je `xbox:<xuid>`, protože XUID je to jediné, co máme jistě hned při
 * přihlášení — gamertag si hráč může změnit. Prefix drží klíče obou platforem
 * rozlišitelné na první pohled, stejně jako `test:` u zkušebních hráčů.
 */
export function xboxHracId(xuid: string): string {
  return `xbox:${xuid}`;
}

/**
 * Gamertag jde schválně i do platforma_jmeno: hráč má mít jméno hned po
 * přihlášení, ne až ho doplní obnova žebříčku (ta běží mimo přihlašovací
 * cestu, stejně jako u Steamu).
 */
export async function upsertHracXbox(
  xuid: string,
  gamertag: string,
  jeAdmin: boolean | null,
): Promise<PlayerRow> {
  const { rows } = await getPool().query<DbRow>(
    `INSERT INTO player (hrac_id, platforma, xbox_xuid, xbox_gamertag, platforma_jmeno, je_admin)
     VALUES ($1, 'xbox', $2, $3, $3, COALESCE($4::boolean, false))
     ON CONFLICT (hrac_id) DO UPDATE SET
       xbox_gamertag   = EXCLUDED.xbox_gamertag,
       platforma_jmeno = EXCLUDED.platforma_jmeno,
       je_admin        = COALESCE($4::boolean, player.je_admin)
     RETURNING ${SLOUPCE}`,
    [xboxHracId(xuid), xuid, gamertag, jeAdmin],
  );
  return mapuj(rows[0]!);
}

/** Podklad pro nouzový režim: povýšit prvního přihlášeného smíme jen dokud admin neexistuje. */
export async function existujeAdmin(): Promise<boolean> {
  const { rows } = await getPool().query<{ existuje: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM player WHERE je_admin) AS existuje`,
  );
  return rows[0]!.existuje;
}

export async function savePlayerStats(hracId: string, staty: PlayerStatsUpdate): Promise<void> {
  await getPool().query(
    `UPDATE player SET
       alias           = COALESCE($2, alias),
       platforma_jmeno = COALESCE($3, platforma_jmeno),
       avatar_url      = COALESCE($4, avatar_url),
       country         = COALESCE($5, country),
       elo_1v1         = COALESCE($6, elo_1v1),
       elo_nejvyssi    = COALESCE($7, elo_nejvyssi),
       odehrano_her    = COALESCE($8, odehrano_her),
       posledni_zapas  = COALESCE($9, posledni_zapas),
       steam_hodiny    = CASE WHEN $10::boolean THEN $11::integer ELSE steam_hodiny END,
       hra_vlastnictvi = CASE WHEN $14::boolean THEN $15::text ELSE hra_vlastnictvi END,
       staty_stazeny_v = now(),
       staty_chyba     = $12,
       zebricky        = COALESCE($13::jsonb, zebricky),
       we_profil       = COALESCE($16, we_profil),
       we_profil_id    = COALESCE($17::integer, we_profil_id)
     WHERE hrac_id = $1`,
    [
      hracId,
      staty.alias ?? null,
      staty.platformaJmeno ?? null,
      staty.avatarUrl ?? null,
      staty.country ?? null,
      staty.elo1v1 ?? null,
      staty.eloNejvyssi ?? null,
      staty.odehranoHer ?? null,
      staty.posledniZapas ?? null,
      "steamHodiny" in staty,
      staty.steamHodiny ?? null,
      staty.chyba,
      staty.zebricky ? JSON.stringify(staty.zebricky) : null,
      "hraVlastnictvi" in staty,
      staty.hraVlastnictvi ?? null,
      staty.weProfil ?? null,
      staty.weProfilId ?? null,
    ],
  );
}

export async function getPlayer(hracId: string): Promise<PlayerRow | null> {
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SLOUPCE} FROM player WHERE hrac_id = $1`,
    [hracId],
  );
  return rows[0] ? mapuj(rows[0]) : null;
}

export async function getPlayers(hracIds: string[]): Promise<PlayerRow[]> {
  if (hracIds.length === 0) return [];
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${SLOUPCE} FROM player WHERE hrac_id = ANY($1::text[])`,
    [hracIds],
  );
  return rows.map(mapuj);
}

/**
 * Profil z lobby na hráče webu; jeden dotaz na celý seznam, ne dotaz na
 * lobby — s tisícovkou otevřených lobby v jedné odpovědi by se to jinak
 * neúnosně prodloužilo.
 */
export async function hraciPodleProfilu(profily: number[]): Promise<Map<number, string>> {
  if (profily.length === 0) return new Map();
  const { rows } = await getPool().query<{ we_profil_id: number; hrac_id: string }>(
    `SELECT we_profil_id, hrac_id FROM player WHERE we_profil_id = ANY($1::integer[])`,
    [profily],
  );
  return new Map(rows.map((r) => [r.we_profil_id, r.hrac_id]));
}

/**
 * Záloha k `hraciPodleProfilu`: Steam ID z lobby na hráče webu. Stojí vedle,
 * protože se ptá na jiný sloupec, ale ke stejné věci — rozpoznání v lobby.
 *
 * Proč existuje: `we_profil_id` se stávajícím hráčům doplní až při obnově
 * statistik, a komu se dotaz na Worlds Edge nikdy nepovede, tomu zůstane
 * prázdné. Steam ID je u Steam hráče od prvního přihlášení a `avatars`
 * z lobby ho nese vždy, takže tahle cesta drží i tam, kde hlavní selže.
 * Je záloha, ne náhrada — Microsoft hráč Steam ID nemá.
 */
export async function hraciPodleSteamId(steamIds: string[]): Promise<Map<string, string>> {
  if (steamIds.length === 0) return new Map();
  const { rows } = await getPool().query<{ steam_id: string; hrac_id: string }>(
    `SELECT steam_id, hrac_id FROM player WHERE steam_id = ANY($1::text[])`,
    [steamIds],
  );
  return new Map(rows.map((r) => [r.steam_id, r.hrac_id]));
}
