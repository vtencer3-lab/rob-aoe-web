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
 *
 * Žádný zápas se tu už neskrývá. Do 5. 9. 2026 tady stál filtr na stav
 * „nachystany“ (specifikace §7: „Rob složil sestavu, nikdo to ještě nevidí“),
 * jenže ten stav zmizel — složením zápasu je hotovo a všichni ho vidí hned.
 * Zůstává jediné, co je opravdu tajemství: heslo a číslo lobby, a ta se
 * zaslepují v redigujZapas níž, pro každého diváka a každý zápas zvlášť.
 */
export function redigujProDivaka(payload: AkceStavPayload, divak: Divak): AkceStavPayload {
  return {
    ...payload,
    // Heslo chystané pro příští lobby je stejné tajemství jako heslo hotového
    // zápasu; jméno lobby tajné není, z něj se nikam nedostane.
    akce: payload.akce && !divak.jeAdmin ? { ...payload.akce, pristiHeslo: "" } : payload.akce,
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
