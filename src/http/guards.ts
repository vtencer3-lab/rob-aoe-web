import type { FastifyRequest } from "fastify";
import { currentUser } from "../auth/routes.js";
import { getPlayer } from "../db/players.js";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(request: FastifyRequest): Promise<string> {
  const steamId = await currentUser(request);
  if (!steamId) throw new HttpError(401, "Nejsi přihlášený.");
  return steamId;
}

export async function requireAdmin(request: FastifyRequest): Promise<string> {
  const steamId = await requireUser(request);
  const hrac = await getPlayer(steamId);
  if (!hrac?.jeAdmin) throw new HttpError(403, "Tohle smí jen Rob.");
  return steamId;
}

/** Největší hodnota, kterou unese sloupec typu integer v Postgresu. */
const MAX_ID = 2147483647;

/**
 * Přečte ":id" z cesty a ověří, že je to kladné celé číslo v rozsahu, který
 * unese sloupec typu integer — jinak 400 místo NaN nebo 22003 v SQL.
 */
export function requireId(request: FastifyRequest): number {
  const hodnota = (request.params as { id?: string }).id;
  const cislo = Number(hodnota);
  if (!Number.isInteger(cislo) || cislo <= 0 || cislo > MAX_ID) {
    throw new HttpError(400, "Neplatné ID v adrese.");
  }
  return cislo;
}
