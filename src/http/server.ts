import cookie from "@fastify/cookie";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAuthRoutes, type AuthDeps } from "../auth/routes.js";
import { verifyWithSteam } from "../auth/steamOpenId.js";
import { config } from "../config.js";
import { getPlayer, savePlayerStats } from "../db/players.js";
import { fetchSteamHours, fetchSteamProfile } from "../external/steam.js";
import { fetchPersonalStat } from "../external/worldsEdge.js";
import { jeCerstve, refreshPlayerStats } from "../players/refresh.js";

function vychoziDeps(): AuthDeps {
  return {
    overSteam: (params) => verifyWithSteam(params),
    obnovStaty: async (steamId) => {
      // Worlds Edge je nezdokumentovaný endpoint bez známých limitů, takže se
      // stahuje nejvýš jednou za patnáct minut na hráče.
      const hrac = await getPlayer(steamId);
      if (jeCerstve(hrac?.statyStazenyV ?? null)) return;
      await refreshPlayerStats(steamId, {
        nactiZebricek: (id) => fetchPersonalStat(id),
        nactiProfil: (id) => fetchSteamProfile(id, config.steamApiKey),
        nactiHodiny: (id) => fetchSteamHours(id, config.steamApiKey),
        uloz: savePlayerStats,
      });
    },
  };
}

export function buildServer(deps: AuthDeps = vychoziDeps()): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(cookie);
  app.get("/api/health", async () => ({ ok: true }));
  registerAuthRoutes(app, deps);
  return app;
}
