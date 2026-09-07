import type { SestavaVstup } from "../shared/types.js";
import { getPool } from "./pool.js";
import { mapuj, PLAYER_SLOUPEC_NAZVY, type DbRow, type PlayerRow } from "./players.js";

/** Akce buď běží, nebo skončila. Mezistavy zmizely i s tlačítky, která je nastavovala. */
export type AkceStav = "bezi" | "konec";

export interface AkceRow {
  id: number;
  nazev: string;
  stav: AkceStav;
  /** JSON s částí NastaveniLobby; zbytek doplní kód výchozími hodnotami. Mění se každým kliknutím. */
  nastaveniLobby: Record<string, unknown>;
  /** Snímek nastavení uložený tlačítkem; null = zatím nic neuloženo. */
  ulozeneNastaveniLobby: Record<string, unknown> | null;
  /** Rozpracovaná sestava zápasu, sdílená všemi adminy přes SSE. */
  skladani: SestavaVstup[];
}

interface AkceDbRow {
  id: number;
  nazev: string;
  stav: AkceStav;
  nastaveni_lobby: Record<string, unknown> | null;
  ulozene_nastaveni_lobby: Record<string, unknown> | null;
  skladani: SestavaVstup[] | null;
}

const SLOUPCE_AKCE = "id, nazev, stav, nastaveni_lobby, ulozene_nastaveni_lobby, skladani";

function mapujAkci(r: AkceDbRow): AkceRow {
  return {
    id: r.id,
    nazev: r.nazev,
    stav: r.stav,
    nastaveniLobby: r.nastaveni_lobby ?? {},
    ulozeneNastaveniLobby: r.ulozene_nastaveni_lobby,
    skladani: Array.isArray(r.skladani) ? r.skladani : [],
  };
}

export async function createAkce(nazev: string): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `INSERT INTO akce (nazev) VALUES ($1) RETURNING ${SLOUPCE_AKCE}`,
    [nazev],
  );
  return mapujAkci(rows[0]!);
}

export async function getAktivniAkce(): Promise<AkceRow | null> {
  const { rows } = await getPool().query<AkceDbRow>(
    `SELECT ${SLOUPCE_AKCE} FROM akce WHERE stav <> 'konec' ORDER BY id DESC LIMIT 1`,
  );
  return rows[0] ? mapujAkci(rows[0]) : null;
}

export async function setAkceStav(akceId: number, stav: AkceStav): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET stav = $2 WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, stav],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

export async function setNastaveniLobby(
  akceId: number,
  nastaveni: Record<string, unknown>,
): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET nastaveni_lobby = $2::jsonb WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, JSON.stringify(nastaveni)],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

/** „Uložit nastavení lobby“: živé nastavení se zkopíruje do snímku. */
export async function ulozNastaveniLobby(akceId: number): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET ulozene_nastaveni_lobby = nastaveni_lobby WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

export async function setSkladani(akceId: number, sestava: SestavaVstup[]): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET skladani = $2::jsonb WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, JSON.stringify(sestava)],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
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
  const sloupce = PLAYER_SLOUPEC_NAZVY.map((sloupec) => `p.${sloupec}`).join(", ");
  const { rows } = await getPool().query<DbRow>(
    `SELECT ${sloupce}
       FROM prihlaska pr
       JOIN player p ON p.steam_id = pr.steam_id
      WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen'
      ORDER BY pr.kdy ASC`,
    [akceId],
  );
  return rows.map(mapuj);
}
