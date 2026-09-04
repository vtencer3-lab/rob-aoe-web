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
