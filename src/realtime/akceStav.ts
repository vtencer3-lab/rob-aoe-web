import { joinUri, spectatorUri } from "../aoe/lobbyUri.js";
import { getAktivniAkce, listSignups } from "../db/events.js";
import type { PlayerRow } from "../db/players.js";
import type { AkceStavPayload, PlayerView } from "../shared/types.js";
import { hub } from "./hub.js";

export function playerView(hrac: PlayerRow): PlayerView {
  return {
    steamId: hrac.steamId,
    alias: hrac.alias,
    steamName: hrac.steamName,
    avatarUrl: hrac.avatarUrl,
    country: hrac.country,
    elo1v1: hrac.elo1v1,
    eloNejvyssi: hrac.eloNejvyssi,
    odehranoHer: hrac.odehranoHer,
    steamHodiny: hrac.steamHodiny,
    posledniZapas: hrac.posledniZapas?.toISOString() ?? null,
    statyStazenyV: hrac.statyStazenyV?.toISOString() ?? null,
    statyChyba: hrac.statyChyba,
  };
}

export { joinUri, spectatorUri };

export async function buildAkceStav(): Promise<AkceStavPayload> {
  const akce = await getAktivniAkce();
  if (!akce) return { akce: null, prihlaseni: [], zapasy: [] };
  const prihlaseni = await listSignups(akce.id);
  return {
    akce: { id: akce.id, nazev: akce.nazev, stav: akce.stav },
    prihlaseni: prihlaseni.map(playerView),
    zapasy: [],
  };
}

/** Rozešle celý stav akce. Nikdy neposíláme přírůstky — obnova po výpadku spojení je pak zdarma. */
export async function broadcastAkce(akceId: number): Promise<void> {
  hub.publish(akceId, await buildAkceStav());
}
