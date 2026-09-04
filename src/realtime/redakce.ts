import type { AkceStavPayload, ZapasView } from "../shared/types.js";

export interface Divak {
  steamId: string | null;
  jeAdmin: boolean;
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
