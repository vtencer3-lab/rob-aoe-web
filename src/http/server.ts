import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { registerAuthRoutes, type AuthDeps } from "../auth/routes.js";
import { verifyWithSteam } from "../auth/steamOpenId.js";
import { config } from "../config.js";
import { getPlayer, savePlayerStats } from "../db/players.js";
import { steamZdroje } from "../external/steam.js";
import { fetchPersonalStat } from "../external/worldsEdge.js";
import { jeCerstve, refreshPlayerStats } from "../players/refresh.js";
import { HttpError } from "./guards.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerMatchRoutes } from "./routes/matches.js";
import { registerStreamRoutes } from "./routes/stream.js";

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
        ...steamZdroje(config.steamApiKey),
        uloz: savePlayerStats,
      });
    },
  };
}

/**
 * V testech zticha — každý testovací soubor staví server znovu a výpis by
 * utopil skutečné výsledky. Jinde zapnuto: bez loggeru je `app.log.error(err)`
 * v error handleru níže úplný no-op, takže neošetřený pád v přímém přenosu
 * nezanechá ani řádek nikde. Úroveň jde přebít proměnnou LOG_LEVEL.
 */
function nastaveniLogu(): { level: string } | false {
  if (process.env["NODE_ENV"] === "test") return false;
  return { level: process.env["LOG_LEVEL"] ?? "info" };
}

export function buildServer(deps: AuthDeps = vychoziDeps()): FastifyInstance {
  const app = Fastify({ logger: nastaveniLogu() });
  app.register(cookie);
  app.get("/api/health", async () => ({ ok: true }));
  registerAuthRoutes(app, deps);
  registerEventRoutes(app);
  registerMatchRoutes(app);
  registerStreamRoutes(app);

  // tsconfig.json kompiluje se společným rootDir "." (kvůli scripts/**), takže
  // sestavený server.js skončí v dist/src/http, ne v dist/http — proto je tu
  // navíc jedna úroveň ".." oproti tomu, co by čekal zrcadlený src → dist.
  const webDist = join(import.meta.dirname, "..", "..", "..", "web", "dist");
  if (existsSync(webDist)) {
    app.register(fastifyStatic, { root: webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send({ chyba: "Neznámá cesta." });
      return reply.sendFile("index.html");
    });
  }

  app.setErrorHandler((err, _request, reply) => {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ chyba: err.message });
    }
    app.log.error(err);
    return reply.code(500).send({ chyba: "Něco se pokazilo na serveru." });
  });

  return app;
}
