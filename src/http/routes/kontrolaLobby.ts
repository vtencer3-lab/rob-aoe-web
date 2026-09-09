import type { FastifyInstance } from "fastify";
import { getAktivniAkce } from "../../db/events.js";
import { getPlayer } from "../../db/players.js";
import { getZapas, setLobbyId } from "../../db/matches.js";
import type { LobbyInzerat } from "../../external/worldsEdgeLobby.js";
import { najdiLobby } from "../../matches/hledaniLobby.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import { nastavFaziLobby } from "../../realtime/fazeLobby.js";
import {
  AI_OBTIZNOSTI,
  doplnNastaveni,
  KONECNE_VEKY,
  ODKRYTI_MAPY,
  POCATECNI_VEKY,
  POPULACE,
  PRIMERI,
  REZIMY,
  SADY_CIVILIZACI,
  SUROVINY,
  ZASKRTAVATKA,
  zkontrolujLobby,
  type KontrolaLobbyVysledek,
  type NastaveniLobby,
} from "../../shared/lobbyKontrola.js";
import { HttpError, requireId, requireUser } from "../guards.js";
import type { MatchDeps } from "./matches.js";

/**
 * Tělo s očekávaným nastavením: jen známé klíče, jen platné hodnoty. Ukládá se
 * jako JSON, takže se sem nesmí dostat nic, co by kontrola neuměla přečíst.
 */
export function prectiNastaveniLobby(telo: unknown): Partial<NastaveniLobby> {
  const t = (typeof telo === "object" && telo !== null ? telo : {}) as Record<string, unknown>;
  const v: Partial<NastaveniLobby> = {};
  const cislo = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
  if (t["mapaId"] === null) v.mapaId = null;
  else if (cislo(t["mapaId"]) !== undefined) v.mapaId = cislo(t["mapaId"])!;
  if (t["velikost"] === null) v.velikost = null;
  else if (cislo(t["velikost"]) !== undefined) v.velikost = cislo(t["velikost"])!;
  const r = cislo(t["rychlost"]);
  if (r === 1 || r === 2 || r === 3) v.rychlost = r;
  // Populace jen z herní nabídky (POPULACE) — od 9. 9. 2026 je to výběr,
  // ne volné číslo, a co panel nenabízí, nemá projít ani přes API.
  const p = cislo(t["populace"]);
  if (p !== undefined && p in POPULACE) v.populace = p;
  const vit = cislo(t["vitezstvi"]);
  if (vit === 1 || vit === 9) v.vitezstvi = vit;
  if (typeof t["cheaty"] === "boolean") v.cheaty = t["cheaty"];

  // Další nastavení: číselníky jen z hodnot, které hra opravdu vydává;
  // null znamená „je to jedno“.
  const vyber = (klic: keyof NastaveniLobby, tabulka: Record<number, string>) => {
    const h = cislo(t[klic]);
    if (t[klic] === null) (v as Record<string, unknown>)[klic] = null;
    else if (h !== undefined && h in tabulka) (v as Record<string, unknown>)[klic] = h;
  };
  vyber("sadaCivilizaci", SADY_CIVILIZACI);
  vyber("rezim", REZIMY);
  vyber("aiObtiznost", AI_OBTIZNOSTI);
  vyber("suroviny", SUROVINY);
  vyber("odkrytiMapy", ODKRYTI_MAPY);
  vyber("pocatecniVek", POCATECNI_VEKY);
  vyber("konecnyVek", KONECNE_VEKY);
  // Příměří jen v hodnotách, které hra nabízí (PRIMERI) — od 9. 9. 2026 je
  // to nabídka, ne volné číslo, a co panel neumí nabídnout, nemá ani projít.
  vyber("primeri", PRIMERI);
  for (const { klic } of ZASKRTAVATKA) {
    if (typeof t[klic] === "boolean" || t[klic] === null) v[klic] = t[klic] as boolean | null;
  }
  if (Object.keys(v).length === 0) throw new HttpError(400, "Nastavení lobby neobsahuje nic, co by šlo uložit.");
  return v;
}

/**
 * „Zkontrolovat lobby“: najde lobby zápasu v seznamu ze hry (podle uloženého
 * čísla, nebo podle hráčů, když číslo ještě není) a porovná ji se sestavou a
 * očekávaným nastavením akce. Smí kdokoliv ze zápasu i Rob.
 */
export function registerKontrolaLobbyRoutes(app: FastifyInstance, deps: MatchDeps): void {
  app.post("/api/zapas/:id/kontrola-lobby", async (request) => {
    const steamId = await requireUser(request);
    const zapasId = requireId(request);
    const nacteny = await getZapas(zapasId);
    if (!nacteny) throw new HttpError(404, "Takový zápas neexistuje.");
    const { zapas, ucastnici } = nacteny;
    const hrac = await getPlayer(steamId);
    if (!hrac?.jeAdmin && !ucastnici.some((u) => u.steamId === steamId)) {
      throw new HttpError(403, "V tomhle zápase nehraješ.");
    }
    if (zapas.stav !== "bezi") throw new HttpError(409, `Zápas je ve stavu „${zapas.stav}“.`);

    let inzeraty: LobbyInzerat[];
    try {
      inzeraty = await deps.nactiInzeraty();
    } catch {
      throw new HttpError(502, "Seznam lobby ze hry se nepodařilo stáhnout. Zkus to za chvíli.");
    }

    let lobby = zapas.lobbyId ? inzeraty.find((l) => l.lobbyId === zapas.lobbyId) : undefined;
    if (!lobby) {
      // Číslo ještě nemáme, nebo host lobby založil znovu — najdi ji podle lidí.
      const nalez = najdiLobby(ucastnici, inzeraty);
      if (nalez) {
        lobby = nalez.lobby;
        if (lobby.lobbyId !== zapas.lobbyId) await setLobbyId(zapasId, lobby.lobbyId);
        nastavFaziLobby(lobby.lobbyId, "lobby");
        await broadcastAkce();
      }
    }
    const odpoved: KontrolaLobbyVysledek = { nalezeno: lobby !== undefined, kontroly: [] };
    if (!lobby) return odpoved;

    const akce = await getAktivniAkce();
    const ocekavane = doplnNastaveni((akce?.nastaveniLobby ?? {}) as Partial<NastaveniLobby>);
    odpoved.kontroly = zkontrolujLobby(ucastnici, ocekavane, lobby);
    return odpoved;
  });
}
