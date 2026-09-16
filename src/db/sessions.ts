import { randomBytes } from "node:crypto";
import { getPool } from "./pool.js";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(hracId: string): Promise<string> {
  const sid = randomBytes(32).toString("hex");
  const platiDo = new Date(Date.now() + SESSION_TTL_MS);
  await getPool().query("INSERT INTO session (sid, hrac_id, plati_do) VALUES ($1, $2, $3)", [
    sid,
    hracId,
    platiDo,
  ]);
  return sid;
}

export async function getSessionUser(sid: string): Promise<string | null> {
  const { rows } = await getPool().query<{ hrac_id: string }>(
    "SELECT hrac_id FROM session WHERE sid = $1 AND plati_do > now()",
    [sid],
  );
  return rows[0]?.hrac_id ?? null;
}

export async function deleteSession(sid: string): Promise<void> {
  await getPool().query("DELETE FROM session WHERE sid = $1", [sid]);
}

export async function deleteExpiredSessions(): Promise<number> {
  const { rowCount } = await getPool().query("DELETE FROM session WHERE plati_do <= now()");
  return rowCount ?? 0;
}
