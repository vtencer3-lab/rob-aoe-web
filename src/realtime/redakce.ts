import type { FastifyRequest } from "fastify";
import { currentUser } from "../auth/routes.js";
import { getPlayer } from "../db/players.js";
import type { AkceStavPayload, ZapasView } from "../shared/types.js";

export interface Divak {
  steamId: string | null;
  jeAdmin: boolean;
}

/**
 * Jediné místo, kde se z požadavku sestavuje vstup do bezpečnostní hranice
 * (redigujProDivaka) — ať se diváka nikde jinde neurčuje o kousek jinak.
 */
export async function zjistiDivaka(request: FastifyRequest): Promise<Divak> {
  const steamId = await currentUser(request);
  const hrac = steamId ? await getPlayer(steamId) : null;
  return { steamId, jeAdmin: hrac?.jeAdmin ?? false };
}

/**
 * Heslo a číslo lobby jsou tajemství. SSE kanál je jeden pro celou akci, takže
 * se zaslepují až tady — každému divákovi zvlášť, těsně před odesláním.
 */
export function redigujProDivaka(payload: AkceStavPayload, divak: Divak): AkceStavPayload {
  return {
    ...payload,
    zapasy: payload.zapasy.map((zapas) => redigujZapas(zapas, divak)),
  };
}

function redigujZapas(zapas: ZapasView, divak: Divak): ZapasView {
  const jeUcastnik =
    divak.steamId !== null && zapas.ucastnici.some((u) => u.steamId === divak.steamId);

  if (divak.jeAdmin) return { ...zapas };
  if (jeUcastnik) return { ...zapas, spectatorUri: null };

  return { ...zapas, heslo: "", lobbyId: null, joinUri: null, spectatorUri: null };
}
