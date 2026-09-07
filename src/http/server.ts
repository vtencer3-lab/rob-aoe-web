import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDevRoutes } from "../auth/devRoutes.js";
import { registerAuthRoutes, type AuthDeps } from "../auth/routes.js";
import { verifyWithSteam } from "../auth/steamOpenId.js";
import { config } from "../config.js";
import { getPlayer, savePlayerStats } from "../db/players.js";
import { steamZdroje } from "../external/steam.js";
import { fetchPersonalStat } from "../external/worldsEdge.js";
import { seznamLobby } from "../matches/seznamLobby.js";
import { jeCerstve, refreshPlayerStats } from "../players/refresh.js";
import { HttpError } from "./guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerMatchRoutes, type MatchDeps } from "./routes/matches.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { VERZE } from "../shared/verze.js";

export type ServerDeps = AuthDeps & MatchDeps;

function vychoziDeps(): ServerDeps {
  return {
    nactiInzeraty: () => seznamLobby.aktualni(),
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
      // Nová data v tabulce přihlášených musí doputovat i těm, kdo stránku
      // právě mají otevřenou — jinak by čekali na jiný broadcast.
      await broadcastAkce();
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

export function buildServer(castDeps: Partial<ServerDeps> = {}): FastifyInstance {
  // Testy podstrkují jen to, co potřebují (Steam, statistiky, seznam lobby);
  // zbytek zůstává skutečný.
  const deps: ServerDeps = { ...vychoziDeps(), ...castDeps };
  const app = Fastify({ logger: nastaveniLogu() });
  app.register(cookie);
  // Verze je v odpovědi schválně: po nasazení jde jedním curl ověřit, že běží
  // opravdu ten build, který měl.
  app.get("/api/health", async () => ({ ok: true, verze: VERZE }));
  registerAuthRoutes(app, deps);
  registerEventRoutes(app);
  registerMatchRoutes(app, deps);
  registerStreamRoutes(app);
  // Zkušební dveře se za produkčního nastavení vůbec nezaregistrují. Druhý
  // zámek (adresa na https) sedí uvnitř nich — jeden zámek na tohle nestačí.
  if (config.devPristup) registerDevRoutes(app);

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
    // Vlastní chyby Fastify (vadný JSON v těle, nesedící Content-Length, moc
    // velké tělo) nesou svůj vlastní 4xx kód. Bez tohohle by se všechny
    // schovaly za „Něco se pokazilo na serveru.“ a Rob by uprostřed vysílání
    // hledal poruchu na serveru, se kterým nic není — chyba je v požadavku.
    const kod = (err as { statusCode?: number }).statusCode ?? 500;
    if (kod >= 400 && kod < 500) {
      return reply.code(kod).send({
        chyba: err instanceof Error ? err.message : "Neplatný požadavek.",
      });
    }

    app.log.error(err);
    return reply.code(500).send({ chyba: "Něco se pokazilo na serveru." });
  });

  return app;
}
