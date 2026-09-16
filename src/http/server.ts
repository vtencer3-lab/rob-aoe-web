import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import { registerDevRoutes } from "../auth/devRoutes.js";
import { registerMicrosoftRoutes, type MicrosoftDeps } from "../auth/microsoftRoutes.js";
import { buildTokenBody, TOKEN_URL } from "../auth/microsoftOAuth.js";
import { registerAuthRoutes, type AuthDeps } from "../auth/routes.js";
import { verifyWithSteam } from "../auth/steamOpenId.js";
import { config } from "../config.js";
import { getPlayer, savePlayerStats, type PlayerStatsUpdate } from "../db/players.js";
import { nactiGamerpic, nactiVlastnictvi, ziskejXboxIdentitu, type XboxIdentita } from "../external/xboxLive.js";
import { fetchPersonalStatPodleAliasu, type LeaderboardStats } from "../external/worldsEdge.js";
import { seznamLobby } from "../matches/seznamLobby.js";
import { maCerstveStaty, refreshPlayerStats } from "../players/refresh.js";
import { zdrojeProHrace } from "../players/zdroje.js";
import type { Vlastnictvi } from "../shared/types.js";
import { HttpError } from "./guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerMatchRoutes, type MatchDeps } from "./routes/matches.js";
import { registerStreamRoutes } from "./routes/stream.js";
import { registerZkusebniRoutes } from "./routes/zkusebni.js";
import { registerKontrolaLobbyRoutes } from "./routes/kontrolaLobby.js";
import { registerHlasRoutes } from "./routes/hlas.js";
import { registerEmotyRoutes } from "./routes/emoty.js";
import { VERZE } from "../shared/verze.js";

export type ServerDeps = AuthDeps & MatchDeps & MicrosoftDeps;

export interface DoplnkyPoPrihlaseni {
  gamerpic: (identita: XboxIdentita) => Promise<string | null>;
  vlastnictvi: (identita: XboxIdentita) => Promise<Vlastnictvi | undefined>;
  zebricek: (gamertag: string) => Promise<LeaderboardStats | null>;
}

/**
 * Co se k Microsoft hráči dotáhne hned po přihlášení. Tři nezávislé dotazy:
 * `allSettled`, aby jeden výpadek nesebral zbylé dva, a celé to visí mimo
 * přihlašovací cestu, takže přihlášení nezdrží ani nemůže shodit.
 */
export function vychoziPoPrihlaseni(
  doplnky: DoplnkyPoPrihlaseni,
): (hracId: string, identita: XboxIdentita) => Promise<void> {
  return async (hracId, identita) => {
    const [pic, hra, zebricek] = await Promise.allSettled([
      doplnky.gamerpic(identita),
      doplnky.vlastnictvi(identita),
      doplnky.zebricek(identita.gamertag),
    ]);

    const chyby: string[] = [];
    if (zebricek.status === "rejected") chyby.push(`Žebříček: ${popisChyby(zebricek.reason)}`);
    if (pic.status === "rejected") chyby.push(`Xbox profil: ${popisChyby(pic.reason)}`);
    if (hra.status === "rejected") chyby.push(`Herní historie: ${popisChyby(hra.reason)}`);

    const staty: PlayerStatsUpdate = {
      alias: zebricek.status === "fulfilled" ? (zebricek.value?.alias ?? null) : null,
      country: zebricek.status === "fulfilled" ? (zebricek.value?.country ?? null) : null,
      elo1v1: zebricek.status === "fulfilled" ? (zebricek.value?.elo1v1 ?? null) : null,
      eloNejvyssi: zebricek.status === "fulfilled" ? (zebricek.value?.eloNejvyssi ?? null) : null,
      odehranoHer: zebricek.status === "fulfilled" ? (zebricek.value?.odehranoHer ?? null) : null,
      posledniZapas: zebricek.status === "fulfilled" ? (zebricek.value?.posledniZapas ?? null) : null,
      zebricky: zebricek.status === "fulfilled" ? (zebricek.value?.zebricky ?? null) : null,
      weProfil: zebricek.status === "fulfilled" ? (zebricek.value?.profil ?? null) : null,
      weProfilId: zebricek.status === "fulfilled" ? (zebricek.value?.profilId ?? null) : null,
      avatarUrl: pic.status === "fulfilled" ? pic.value : null,
      chyba: chyby.length > 0 ? chyby.join("; ") : null,
    };
    // undefined = nepovedlo se zjistit; hodnotu v databázi nesaháme.
    if (hra.status === "fulfilled" && hra.value !== undefined) {
      staty.hraVlastnictvi = hra.value;
    }
    await savePlayerStats(hracId, staty);
    await broadcastAkce();
  };
}

function popisChyby(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function vychoziDeps(): ServerDeps {
  return {
    nactiInzeraty: () => seznamLobby.aktualni(),
    overSteam: (params) => verifyWithSteam(params),
    obnovStaty: async (hracId) => {
      // Worlds Edge je nezdokumentovaný endpoint bez známých limitů, takže se
      // stahuje nejvýš jednou za patnáct minut na hráče.
      const hrac = await getPlayer(hracId);
      if (maCerstveStaty(hrac)) return;
      if (!hrac) return;
      await refreshPlayerStats(hracId, zdrojeProHrace(hrac, config.steamApiKey));
      // Nová data v tabulce přihlášených musí doputovat i těm, kdo stránku
      // právě mají otevřenou — jinak by čekali na jiný broadcast.
      await broadcastAkce();
    },
    vymenKod: async (kod, verifier) => {
      const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: buildTokenBody(
          config.baseUrl,
          config.msClientId,
          config.msClientSecret,
          kod,
          verifier,
        ).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      const json: unknown = await res.json().catch(() => null);
      const token =
        typeof json === "object" && json !== null
          ? (json as Record<string, unknown>)["access_token"]
          : null;
      if (!res.ok || typeof token !== "string") {
        throw new Error("Microsoft nevydal přihlašovací token.");
      }
      return token;
    },
    ziskejIdentitu: (accessToken) => ziskejXboxIdentitu(accessToken),
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: (identita) => nactiGamerpic(identita),
      vlastnictvi: (identita) => nactiVlastnictvi(identita),
      zebricek: (gamertag) => fetchPersonalStatPodleAliasu(gamertag),
    }),
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
  // Bez registrace v Entra by routy jen vracely chyby; ať radši nejsou.
  if (config.maMicrosoft) registerMicrosoftRoutes(app, deps);
  registerEventRoutes(app);
  registerMatchRoutes(app, deps);
  registerStreamRoutes(app);
  registerZkusebniRoutes(app);
  registerKontrolaLobbyRoutes(app, deps);
  registerHlasRoutes(app);
  registerEmotyRoutes(app);
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
