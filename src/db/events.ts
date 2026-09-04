import { getPool } from "./pool.js";
import type { PlayerRow } from "./players.js";

export type AkceStav = "priprava" | "prihlasovani" | "zavreno" | "bezi" | "konec";

export interface AkceRow {
  id: number;
  nazev: string;
  stav: AkceStav;
}

interface AkceDbRow {
  id: number;
  nazev: string;
  stav: AkceStav;
}

export async function createAkce(nazev: string): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    "INSERT INTO akce (nazev) VALUES ($1) RETURNING id, nazev, stav",
    [nazev],
  );
  return rows[0]!;
}

export async function getAktivniAkce(): Promise<AkceRow | null> {
  const { rows } = await getPool().query<AkceDbRow>(
    "SELECT id, nazev, stav FROM akce WHERE stav <> 'konec' ORDER BY id DESC LIMIT 1",
  );
  return rows[0] ?? null;
}

export async function setAkceStav(akceId: number, stav: AkceStav): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    "UPDATE akce SET stav = $2 WHERE id = $1 RETURNING id, nazev, stav",
    [akceId, stav],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return rows[0];
}

export async function signUp(akceId: number, steamId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO prihlaska (akce_id, steam_id, stav, kdy) VALUES ($1, $2, 'prihlasen', now())
     ON CONFLICT (akce_id, steam_id) DO UPDATE SET stav = 'prihlasen', kdy = now()`,
    [akceId, steamId],
  );
}

export async function withdraw(akceId: number, steamId: string): Promise<void> {
  await getPool().query(
    "UPDATE prihlaska SET stav = 'odhlasen' WHERE akce_id = $1 AND steam_id = $2",
    [akceId, steamId],
  );
}

export async function listSignups(akceId: number): Promise<PlayerRow[]> {
  const { rows } = await getPool().query<Record<string, never>>(
    `SELECT p.steam_id, p.alias, p.steam_name, p.avatar_url, p.country, p.elo_1v1,
            p.elo_nejvyssi, p.odehrano_her, p.posledni_zapas, p.steam_hodiny,
            p.staty_stazeny_v, p.staty_chyba, p.je_admin
       FROM prihlaska pr
       JOIN player p ON p.steam_id = pr.steam_id
      WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen'
      ORDER BY pr.kdy ASC`,
    [akceId],
  );
  return rows.map((r) => {
    const row = r as unknown as Record<string, unknown>;
    return {
      steamId: row["steam_id"] as string,
      alias: row["alias"] as string | null,
      steamName: row["steam_name"] as string | null,
      avatarUrl: row["avatar_url"] as string | null,
      country: row["country"] as string | null,
      elo1v1: row["elo_1v1"] as number | null,
      eloNejvyssi: row["elo_nejvyssi"] as number | null,
      odehranoHer: row["odehrano_her"] as number | null,
      posledniZapas: row["posledni_zapas"] as Date | null,
      steamHodiny: row["steam_hodiny"] as number | null,
      statyStazenyV: row["staty_stazeny_v"] as Date | null,
      statyChyba: row["staty_chyba"] as string | null,
      jeAdmin: row["je_admin"] as boolean,
    };
  });
}
