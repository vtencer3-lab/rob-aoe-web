import { listZpravy, type ZpravaRow } from "../db/chat.js";
import { lobbyName } from "../matches/composition.js";
import { joinUri, spectatorUri } from "../aoe/lobbyUri.js";
import { getAktivniAkce, listSignups } from "../db/events.js";
import { listZapasy } from "../db/matches.js";
import type { PlayerRow } from "../db/players.js";
import type { AkceStavPayload, PlayerView, ZapasView } from "../shared/types.js";
import { fazeLobbyPro } from "./fazeLobby.js";
import { hub, KANAL_AKCE } from "./hub.js";

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
    steamHra: hrac.steamHra,
    posledniZapas: hrac.posledniZapas?.toISOString() ?? null,
    statyStazenyV: hrac.statyStazenyV?.toISOString() ?? null,
    statyChyba: hrac.statyChyba,
    zebricky: hrac.zebricky,
  };
}

export { joinUri, spectatorUri };

function zapasView(zaznam: Awaited<ReturnType<typeof listZapasy>>[number], zpravy: ZpravaRow[]): ZapasView {
  const { zapas, ucastnici } = zaznam;
  return {
    id: zapas.id,
    poradi: zapas.poradi,
    stav: zapas.stav,
    nazevLobby: zapas.nazevLobby,
    heslo: zapas.heslo,
    lobbyId: zapas.lobbyId,
    // Odkazy se vždy odvozují z čísla lobby, nikdy se neukládají.
    joinUri: zapas.lobbyId ? joinUri(zapas.lobbyId) : null,
    spectatorUri: zapas.lobbyId ? spectatorUri(zapas.lobbyId) : null,
    fazeLobby: fazeLobbyPro(zapas.lobbyId),
    vitez: zapas.vitez,
    zavreny: zapas.zavrenyV !== null,
    nastaveni: zapas.nastaveni,
    ucastnici: ucastnici.map((u) => ({
      steamId: u.steamId,
      alias: u.alias,
      steamName: u.steamName,
      tym: u.tym,
      barva: u.barva,
      civ: u.civ,
      elo1v1: u.elo1v1,
      jeHost: u.jeHost,
      poradi: u.poradi,
      kliknulPripojit: u.kliknulPripojit?.toISOString() ?? null,
    })),
    zpravy: zpravy.map((z) => ({
      id: z.id,
      steamId: z.steamId,
      jmeno: z.alias ?? z.steamName ?? z.steamId,
      jeAdmin: z.jeAdmin,
      barva: z.barva,
      tym: z.tym,
      text: z.text,
      poslano: z.poslano.toISOString(),
    })),
  };
}

export async function buildAkceStav(): Promise<AkceStavPayload> {
  const akce = await getAktivniAkce();
  if (!akce) return { akce: null, prihlaseni: [], zapasy: [] };
  const prihlaseni = await listSignups(akce.id);
  const zapasy = await listZapasy(akce.id);
  const zpravy = await listZpravy(akce.id);
  return {
    akce: {
      id: akce.id,
      nazev: akce.nazev,
      stav: akce.stav,
      nastaveniLobby: akce.nastaveniLobby,
      ulozeneNastaveniLobby: akce.ulozeneNastaveniLobby,
      skladani: akce.skladani,
      // Co bude mít příští lobby: jméno se odvodí z pořadí, heslo je
      // připravené dopředu (viz db/events.pripravPristiHeslo). Heslo mimo
      // adminy zaslepuje redakce.
      pristiNazevLobby: lobbyName(zapasy.length + 1),
      pristiHeslo: akce.pristiHeslo ?? "",
    },
    // Lhůta aktivity patří k přihlášce, ne k hráči: mimo akci nemá smysl.
    prihlaseni: prihlaseni.map((hrac) => ({ ...playerView(hrac), aktivniDo: hrac.aktivniDo.toISOString() })),
    zapasy: zapasy.map((z) => zapasView(z, zpravy.get(z.zapas.id) ?? [])),
  };
}

/** Rozešle celý stav akce. Nikdy neposíláme přírůstky — obnova po výpadku spojení je pak zdarma. */
export async function broadcastAkce(): Promise<void> {
  hub.publish(KANAL_AKCE, await buildAkceStav());
}
