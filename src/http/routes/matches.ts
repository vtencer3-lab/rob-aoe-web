import type { FastifyInstance } from "fastify";
import { parseJoinUri } from "../../aoe/lobbyUri.js";
import {
  createZapas,
  getZapas,
  oznacKliknutiPripojit,
  setHost,
  setHostPotvrdil,
  setLobbyId,
  setVysledek,
  setZapasStav,
  UcastnikOdhlasenChyba,
} from "../../db/matches.js";
import { getPlayer } from "../../db/players.js";
import { MATCH_STATES, type MatchState } from "../../matches/stateMachine.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import type { Format, Tym } from "../../shared/types.js";
import { HttpError, requireAdmin, requireId, requireUser } from "../guards.js";

const FORMATY: readonly Format[] = ["1v1", "coop_kings_2v2"];

const CHYBA_ODKAZU: Record<string, string> = {
  prazdne: "Vlož odkaz z tlačítka Copy ve hře.",
  divacky_odkaz:
    "Tohle je divácký odkaz (aoe2de://1/…). Potřebuju ten z tlačítka Copy v lobby, který začíná aoe2de://0/.",
  spatny_tvar: "Tohle nevypadá jako odkaz na lobby. Má vypadat takhle: aoe2de://0/234230181",
};

/** Souběžné vytvoření dvou zápasů se stejným pořadím narazí na unikátní omezení v DB — skutečný konflikt, ne interní chyba. */
function jeSoubezneVytvoreniKonflikt(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
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

export function registerMatchRoutes(app: FastifyInstance): void {
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
      await broadcastAkce(akceId);
      // Klientovi stačí ID — heslo, číslo lobby i potvrzení hosta jsou tajemství,
      // co proudí jen redigovaným SSE kanálem, nikdy syrová v odpovědi na admin akci.
      return { zapas: { id: zapas.id } };
    } catch (err) {
      if (err instanceof UcastnikOdhlasenChyba) throw new HttpError(409, err.message);
      if (jeSoubezneVytvoreniKonflikt(err)) {
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
    await setZapasStav(zapasId, stav as MatchState, "admin");
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/lobby", async (request) => {
    const zapasId = requireId(request);
    const { zapas, actor } = await roleVZapase(request, zapasId);
    const { odkaz } = request.body as { odkaz?: unknown };
    const vysledek = parseJoinUri(typeof odkaz === "string" ? odkaz : "");
    if (!vysledek.ok) throw new HttpError(400, CHYBA_ODKAZU[vysledek.error]!);

    await setLobbyId(zapasId, vysledek.lobbyId);
    if (zapas.stav === "vyhlaseny") await setZapasStav(zapasId, "lobby_otevrena", actor);
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/potvrzeni", async (request) => {
    const zapasId = requireId(request);
    const { zapas } = await roleVZapase(request, zapasId);
    await setHostPotvrdil(zapasId);
    await broadcastAkce(zapas.akceId);
    return { ok: true };
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
    await broadcastAkce(zapas.akceId);
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
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });

  app.post("/api/zapas/:id/vysledek", async (request) => {
    await requireAdmin(request);
    const zapasId = requireId(request);
    const { viteznyTym } = request.body as { viteznyTym?: unknown };
    if (viteznyTym !== 1 && viteznyTym !== 2) throw new HttpError(400, "Vítězný tým je 1 nebo 2.");
    const { zapas } = await nactiNeboSelzi(zapasId);
    await setVysledek(zapasId, viteznyTym as Tym);
    if (zapas.stav !== "dohrano") await setZapasStav(zapasId, "dohrano", "admin");
    await broadcastAkce(zapas.akceId);
    return { ok: true };
  });
}
