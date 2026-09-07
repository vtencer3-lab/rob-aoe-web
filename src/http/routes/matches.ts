import type { FastifyInstance } from "fastify";
import { parseJoinUri, type LobbyUriError } from "../../aoe/lobbyUri.js";
import { jeUnikatniKonflikt } from "../../db/chyby.js";
import {
  createZapas,
  getZapas,
  oznacKliknutiPripojit,
  setHost,
  setLobbyId,
  setVysledek,
  setZapasStav,
  UcastnikOdhlasenChyba,
} from "../../db/matches.js";
import { getPlayer } from "../../db/players.js";
import type { LobbyInzerat } from "../../external/worldsEdgeLobby.js";
import { SestavaChyba } from "../../matches/composition.js";
import { najdiLobby } from "../../matches/hledaniLobby.js";
import { nastavFaziLobby } from "../../realtime/fazeLobby.js";
import { MATCH_STATES, PrechodChyba, type MatchState } from "../../matches/stateMachine.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import type { Format, HledaniLobbyVysledek, Tym } from "../../shared/types.js";
import { HttpError, requireAdmin, requireId, requireUser } from "../guards.js";

const FORMATY: readonly Format[] = ["1v1", "coop_kings_2v2"];

const CHYBA_ODKAZU: Record<LobbyUriError, string> = {
  prazdne: "Vlož odkaz z tlačítka Copy ve hře.",
  divacky_odkaz:
    "Tohle je divácký odkaz (aoe2de://1/…). Potřebuju ten z tlačítka Copy v lobby, který začíná aoe2de://0/.",
  spatny_tvar: "Tohle nevypadá jako odkaz na lobby. Má vypadat takhle: aoe2de://0/234230181",
};

/**
 * Přechod stavu zápasu. Odmítnutí (zakázaný přechod nebo prohraný souběh) je
 * konflikt se skutečností, ne interní chyba — patří na 409 se srozumitelnou
 * hláškou, ne na 500 „Něco se pokazilo na serveru.“
 */
async function prejdi(zapasId: number, stav: MatchState): Promise<void> {
  try {
    await setZapasStav(zapasId, stav);
  } catch (err) {
    if (err instanceof PrechodChyba) throw new HttpError(409, err.message);
    throw err;
  }
}

async function nactiNeboSelzi(zapasId: number) {
  const zaznam = await getZapas(zapasId);
  if (!zaznam) throw new HttpError(404, "Takový zápas neexistuje.");
  return zaznam;
}

/** Vrátí roli přihlášeného vůči zápasu, nebo vyhodí 403. */
async function roleVZapase(request: Parameters<typeof requireUser>[0], zapasId: number) {
  const steamId = await requireUser(request);
  const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
  const hrac = await getPlayer(steamId);
  if (hrac?.jeAdmin) return { steamId, zapas, ucastnici, actor: "admin" as const };
  const ucastnik = ucastnici.find((u) => u.steamId === steamId);
  if (!ucastnik?.jeHost) throw new HttpError(403, "Tohle smí jen host zápasu nebo Rob.");
  return { steamId, zapas, ucastnici, actor: "host" as const };
}

export interface MatchDeps {
  /** Aktuální seznam otevřených lobby ze hry (přes cache, viz SeznamLobby). */
  nactiInzeraty: () => Promise<LobbyInzerat[]>;
}

export function registerMatchRoutes(app: FastifyInstance, deps: MatchDeps): void {
  app.post("/api/akce/:id/zapas", async (request) => {
    await requireAdmin(request);
    const akceId = requireId(request);
    const { format, steamIds } = request.body as { format?: unknown; steamIds?: unknown };
    if (typeof format !== "string" || !FORMATY.includes(format as Format)) {
      throw new HttpError(400, "Neznámý formát zápasu.");
    }
    if (!Array.isArray(steamIds) || steamIds.some((s) => typeof s !== "string")) {
      throw new HttpError(400, "Chybí seznam hráčů.");
    }
    try {
      const zapas = await createZapas(akceId, format as Format, steamIds as string[]);
      await broadcastAkce();
      // Klientovi stačí ID — heslo, číslo lobby i potvrzení hosta jsou tajemství,
      // co proudí jen redigovaným SSE kanálem, nikdy syrová v odpovědi na admin akci.
      return { zapas: { id: zapas.id } };
    } catch (err) {
      if (err instanceof UcastnikOdhlasenChyba) throw new HttpError(409, err.message);
      if (err instanceof SestavaChyba) throw new HttpError(400, err.message);
      // Souběžné vytvoření dvou zápasů se stejným pořadím narazí na unikátní
      // omezení (akce_id, poradi).
      if (jeUnikatniKonflikt(err)) {
        throw new HttpError(409, "Zápas se právě vytváří někým jiným, zkus to znovu.");
      }
      throw err;
    }
  });

  app.post("/api/zapas/:id/stav", async (request) => {
    await requireAdmin(request);
    const zapasId = requireId(request);
    const { stav } = request.body as { stav?: unknown };
    if (typeof stav !== "string" || !MATCH_STATES.includes(stav as MatchState)) {
      throw new HttpError(400, "Neznámý stav zápasu.");
    }
    const { zapas } = await nactiNeboSelzi(zapasId);
    await prejdi(zapasId, stav as MatchState);
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/zapas/:id/lobby", async (request) => {
    const zapasId = requireId(request);
    const { zapas, actor } = await roleVZapase(request, zapasId);
    // Do dohraného ani zrušeného zápasu odkaz nepatří: nikam by nevedl a přepsal
    // by to, co po zápase zbylo. Podmíněný byl doteď jen přechod stavu, ne
    // samotné uložení.
    if (zapas.stav === "dohrano" || zapas.stav === "zruseny") {
      throw new HttpError(409, `Zápas je ve stavu „${zapas.stav}“, odkaz do lobby už nepřijímá.`);
    }
    const { odkaz } = request.body as { odkaz?: unknown };
    const vysledek = parseJoinUri(typeof odkaz === "string" ? odkaz : "");
    if (!vysledek.ok) throw new HttpError(400, CHYBA_ODKAZU[vysledek.error]);

    // Žádný posun stavu: že je lobby založená, se pozná podle toho, že odkaz
    // existuje. Zvláštní stav pro to zmizel spolu s tlačítky, která ho hýbala.
    await setLobbyId(zapasId, vysledek.lobbyId);
    await broadcastAkce();
    return { ok: true };
  });

  // „Vyhledat hru“: místo aby host kopíroval odkaz, web se podívá do seznamu
  // otevřených lobby a najde tu, ve které sedí host (nebo kdokoliv ze zápasu).
  // Smí kliknout kdokoliv ze zápasu i Rob — čekající hráč tím nic nezkazí,
  // uloží se totéž číslo, které by našel host.
  app.post("/api/zapas/:id/hledat-lobby", async (request) => {
    const steamId = await requireUser(request);
    const zapasId = requireId(request);
    const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
    const hrac = await getPlayer(steamId);
    if (!hrac?.jeAdmin && !ucastnici.some((u) => u.steamId === steamId)) {
      throw new HttpError(403, "V tomhle zápase nehraješ.");
    }
    if (zapas.stav === "dohrano" || zapas.stav === "zruseny") {
      throw new HttpError(409, `Zápas je ve stavu „${zapas.stav}“, lobby už nehledá.`);
    }

    let inzeraty: LobbyInzerat[];
    try {
      inzeraty = await deps.nactiInzeraty();
    } catch {
      throw new HttpError(502, "Seznam lobby ze hry se nepodařilo stáhnout. Zkus to za chvíli, nebo vlož odkaz ručně.");
    }

    const nalez = najdiLobby(ucastnici, inzeraty);
    const odpoved: HledaniLobbyVysledek = {
      nalezeno: nalez !== null,
      lobbyId: nalez?.lobby.lobbyId ?? null,
      nazev: nalez?.lobby.nazev ?? null,
      maHeslo: nalez?.lobby.maHeslo ?? null,
      povolujeDivaky: nalez?.lobby.povolujeDivaky ?? null,
    };
    // Přepíše i dřív uložené číslo: host mohl lobby zrušit a založit znovu.
    // Lobby jsme právě viděli v seznamu, takže se v ní sedí — ať to Spectate
    // ukáže hned a nečeká na další krok sledování.
    if (nalez) {
      const zmenaFaze = nastavFaziLobby(nalez.lobby.lobbyId, "lobby");
      if (nalez.lobby.lobbyId !== zapas.lobbyId) await setLobbyId(zapasId, nalez.lobby.lobbyId);
      if (zmenaFaze || nalez.lobby.lobbyId !== zapas.lobbyId) await broadcastAkce();
    }
    return odpoved;
  });

  app.post("/api/zapas/:id/host", async (request) => {
    await requireAdmin(request);
    const zapasId = requireId(request);
    const { steamId } = request.body as { steamId?: unknown };
    if (typeof steamId !== "string") throw new HttpError(400, "Chybí hráč, který má hostovat.");
    const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
    if (!ucastnici.some((u) => u.steamId === steamId)) {
      throw new HttpError(400, "Hostovat může jen někdo z účastníků zápasu.");
    }
    await setHost(zapasId, steamId);
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/zapas/:id/pripojeni", async (request) => {
    const steamId = await requireUser(request);
    const zapasId = requireId(request);
    const { zapas, ucastnici } = await nactiNeboSelzi(zapasId);
    if (!ucastnici.some((u) => u.steamId === steamId)) {
      throw new HttpError(403, "V tomhle zápase nehraješ.");
    }
    await oznacKliknutiPripojit(zapasId, steamId);
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/zapas/:id/vysledek", async (request) => {
    await requireAdmin(request);
    const zapasId = requireId(request);
    const { viteznyTym } = request.body as { viteznyTym?: unknown };
    if (viteznyTym !== 1 && viteznyTym !== 2) throw new HttpError(400, "Vítězný tým je 1 nebo 2.");
    const { zapas } = await nactiNeboSelzi(zapasId);
    await setVysledek(zapasId, viteznyTym as Tym);
    if (zapas.stav !== "dohrano") await prejdi(zapasId, "dohrano");
    await broadcastAkce();
    return { ok: true };
  });
}
