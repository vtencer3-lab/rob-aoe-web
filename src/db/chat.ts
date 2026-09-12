import type { Barva, Tym } from "../shared/types.js";
import { getPool } from "./pool.js";

/** Delší zprávu odmítne i databáze (CHECK v migraci 020); tady je to kvůli hlášce. */
export const MAX_DELKA_ZPRAVY = 500;
/** Kolik posledních zpráv na zápas jde do stavu. Starší zůstávají v databázi. */
export const ZPRAV_NA_ZAPAS = 100;

export interface ZpravaRow {
  id: number;
  zapasId: number;
  steamId: string;
  alias: string | null;
  steamName: string | null;
  jeAdmin: boolean;
  /** Tým a barva z účasti v zápase; admin, který v něm nehraje, je nemá. */
  tym: Tym | null;
  barva: Barva | null;
  text: string;
  poslano: Date;
  upravenoV: Date | null;
}

/** Přepíše vlastní zprávu; vrací false, když zpráva není autorova nebo není v zápase. */
export async function upravZpravu(zapasId: number, zpravaId: number, steamId: string, text: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    "UPDATE zprava SET text = $4, upraveno_v = now() WHERE id = $1 AND zapas_id = $2 AND steam_id = $3",
    [zpravaId, zapasId, steamId, text],
  );
  return (rowCount ?? 0) > 0;
}

/** Smaže zprávu; vrací false, když v tomhle zápase žádná taková není. */
export async function smazZpravu(zapasId: number, zpravaId: number): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM zprava WHERE id = $1 AND zapas_id = $2", [zpravaId, zapasId]);
  return (rowCount ?? 0) > 0;
}

export async function pridejZpravu(zapasId: number, steamId: string, text: string): Promise<void> {
  await getPool().query("INSERT INTO zprava (zapas_id, steam_id, text) VALUES ($1, $2, $3)", [zapasId, steamId, text]);
}

/**
 * Posledních `limit` zpráv každého zápasu akce, od nejstarší k nejnovější.
 * Jeden dotaz na celou akci: stav se staví při každém broadcastu a zápasů
 * je za večer i deset.
 */
export async function listZpravy(akceId: number, limit = ZPRAV_NA_ZAPAS): Promise<Map<number, ZpravaRow[]>> {
  const { rows } = await getPool().query<{
    id: number;
    zapas_id: number;
    steam_id: string;
    alias: string | null;
    steam_name: string | null;
    je_admin: boolean;
    tym: number | null;
    barva: number | null;
    text: string;
    poslano: Date;
    upraveno_v: Date | null;
  }>(
    `SELECT id, zapas_id, steam_id, alias, steam_name, je_admin, tym, barva, text, poslano, upraveno_v FROM (
       SELECT z.id, z.zapas_id, z.steam_id, z.text, z.poslano, z.upraveno_v,
              p.alias, p.steam_name, p.je_admin, u.tym, u.barva,
              row_number() OVER (PARTITION BY z.zapas_id ORDER BY z.id DESC) AS n
         FROM zprava z
         JOIN zapas za ON za.id = z.zapas_id
         JOIN player p ON p.steam_id = z.steam_id
         LEFT JOIN ucastnik u ON u.zapas_id = z.zapas_id AND u.steam_id = z.steam_id
        WHERE za.akce_id = $1
     ) t WHERE n <= $2 ORDER BY zapas_id, id`,
    [akceId, limit],
  );
  const podleZapasu = new Map<number, ZpravaRow[]>();
  for (const r of rows) {
    const seznam = podleZapasu.get(r.zapas_id) ?? [];
    seznam.push({
      id: r.id,
      zapasId: r.zapas_id,
      steamId: r.steam_id,
      alias: r.alias,
      steamName: r.steam_name,
      jeAdmin: r.je_admin,
      tym: r.tym as Tym | null,
      barva: r.barva as Barva | null,
      text: r.text,
      poslano: r.poslano,
      upravenoV: r.upraveno_v,
    });
    podleZapasu.set(r.zapas_id, seznam);
  }
  return podleZapasu;
}
