import { cenzuruj } from "../shared/cenzura.js";
import type { Barva, Tym } from "../shared/types.js";
import { getPool } from "./pool.js";

/** Delší zprávu odmítne i databáze (CHECK v migraci 020); tady je to kvůli hlášce. */
export const MAX_DELKA_ZPRAVY = 500;
/** Kolik posledních zpráv na zápas jde do stavu. Starší zůstávají v databázi. */
export const ZPRAV_NA_ZAPAS = 100;

export interface ZpravaRow {
  id: number;
  zapasId: number;
  hracId: string;
  alias: string | null;
  platformaJmeno: string | null;
  jeAdmin: boolean;
  /** Tým a barva z účasti v zápase; admin, který v něm nehraje, je nemá. */
  tym: Tym | null;
  barva: Barva | null;
  text: string;
  poslano: Date;
  upravenoV: Date | null;
  /** Odpověď na jinou zprávu téhož zápasu (migrace 026); null = žádná, nebo původní už smazaná. */
  odpovedNa: { id: number; jmeno: string; text: string } | null;
}

/** Přepíše vlastní zprávu; vrací false, když zpráva není autorova nebo není v zápase. */
export async function upravZpravu(zapasId: number, zpravaId: number, hracId: string, text: string): Promise<boolean> {
  const cisty = cenzuruj(text);
  const { rowCount } = await getPool().query(
    "UPDATE zprava SET text = $4, text_puvodni = $5, upraveno_v = now() WHERE id = $1 AND zapas_id = $2 AND hrac_id = $3",
    [zpravaId, zapasId, hracId, cisty, cisty === text ? null : text],
  );
  return (rowCount ?? 0) > 0;
}

/** Smaže zprávu; vrací false, když v tomhle zápase žádná taková není. */
export async function smazZpravu(zapasId: number, zpravaId: number): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM zprava WHERE id = $1 AND zapas_id = $2", [zpravaId, zapasId]);
  return (rowCount ?? 0) > 0;
}

/**
 * Uloží zprávu už cenzurovanou; když cenzura něco změnila, původní znění jde
 * do `text_puvodni` (jen v databázi, do stavu nikdy) — ať se dá dohledat.
 */
export async function pridejZpravu(zapasId: number, hracId: string, text: string, odpovedNa: number | null = null): Promise<void> {
  const cisty = cenzuruj(text);
  // Odpovídat jde jen na zprávu téhož zápasu; cizí nebo neexistující id se
  // tiše zahodí — zpráva se pošle bez odkazu, ne s chybou.
  await getPool().query(
    `INSERT INTO zprava (zapas_id, hrac_id, text, text_puvodni, odpoved_na)
     VALUES ($1, $2, $3, $4, (SELECT id FROM zprava WHERE id = $5 AND zapas_id = $1))`,
    [zapasId, hracId, cisty, cisty === text ? null : text, odpovedNa],
  );
}

/**
 * Zpětná cenzura při startu serveru: seznam slov roste, staré zprávy se
 * prohlédnou znovu. Původní znění se schová jen tam, kde ještě není.
 */
export async function cenzurujZpetne(): Promise<number> {
  const { rows } = await getPool().query<{ id: number; text: string }>("SELECT id, text FROM zprava");
  let zmeneno = 0;
  for (const r of rows) {
    const cisty = cenzuruj(r.text);
    if (cisty === r.text) continue;
    await getPool().query("UPDATE zprava SET text = $2, text_puvodni = COALESCE(text_puvodni, $3) WHERE id = $1", [r.id, cisty, r.text]);
    zmeneno += 1;
  }
  return zmeneno;
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
    hrac_id: string;
    alias: string | null;
    platforma_jmeno: string | null;
    je_admin: boolean;
    tym: number | null;
    barva: number | null;
    text: string;
    poslano: Date;
    upraveno_v: Date | null;
    o_id: number | null;
    o_text: string | null;
    o_alias: string | null;
    o_platforma_jmeno: string | null;
    o_hrac_id: string | null;
  }>(
    `SELECT id, zapas_id, hrac_id, alias, platforma_jmeno, je_admin, tym, barva, text, poslano, upraveno_v,
            o_id, o_text, o_alias, o_platforma_jmeno, o_hrac_id FROM (
       SELECT z.id, z.zapas_id, z.hrac_id, z.text, z.poslano, z.upraveno_v,
              p.alias, p.platforma_jmeno, p.je_admin, u.tym, u.barva,
              o.id AS o_id, o.text AS o_text, op.alias AS o_alias, op.platforma_jmeno AS o_platforma_jmeno, o.hrac_id AS o_hrac_id,
              row_number() OVER (PARTITION BY z.zapas_id ORDER BY z.id DESC) AS n
         FROM zprava z
         JOIN zapas za ON za.id = z.zapas_id
         JOIN player p ON p.hrac_id = z.hrac_id
         LEFT JOIN ucastnik u ON u.zapas_id = z.zapas_id AND u.hrac_id = z.hrac_id
         LEFT JOIN zprava o ON o.id = z.odpoved_na
         LEFT JOIN player op ON op.hrac_id = o.hrac_id
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
      hracId: r.hrac_id,
      alias: r.alias,
      platformaJmeno: r.platforma_jmeno,
      odpovedNa: r.o_id === null || r.o_text === null ? null : { id: r.o_id, jmeno: r.o_alias ?? r.o_platforma_jmeno ?? r.o_hrac_id ?? "?", text: r.o_text },
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
