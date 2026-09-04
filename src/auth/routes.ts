import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getPlayer, upsertPlayer } from "../db/players.js";
import { createSession, deleteSession, getSessionUser } from "../db/sessions.js";
import { SESSION_TTL_MS } from "../db/sessions.js";
import { buildAuthUrl, extractSteamId } from "./steamOpenId.js";

export interface AuthDeps {
  overSteam: (params: URLSearchParams) => Promise<boolean>;
  obnovStaty: (steamId: string) => Promise<void>;
}

export async function currentUser(request: FastifyRequest): Promise<string | null> {
  const sid = request.cookies["sid"];
  return sid ? getSessionUser(sid) : null;
}

export function registerAuthRoutes(app: FastifyInstance, deps: AuthDeps): void {
  app.get("/api/auth/steam", async (_request, reply) => {
    return reply.redirect(buildAuthUrl(config.baseUrl), 302);
  });

  app.get("/api/auth/steam/return", async (request, reply) => {
    const params = new URLSearchParams(request.query as Record<string, string>);
    const steamId = extractSteamId(params);
    if (!steamId) return reply.code(401).send({ chyba: "Steam nevrátil platný identifikátor." });
    if (!(await deps.overSteam(params))) {
      return reply.code(401).send({ chyba: "Steam přihlášení se nepodařilo ověřit." });
    }

    await upsertPlayer(steamId, steamId === config.adminSteamId);

    // Statistiky se stahují mimo přihlašovací cestu. Když selžou, přihlášení platí dál.
    void deps.obnovStaty(steamId).catch(() => {});

    const sid = await createSession(steamId);
    return reply
      .setCookie("sid", sid, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.jeProdukce,
        path: "/",
        maxAge: Math.floor(SESSION_TTL_MS / 1000),
      })
      .redirect("/", 302);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sid = request.cookies["sid"];
    if (sid) await deleteSession(sid);
    return reply.clearCookie("sid", { path: "/" }).send({ ok: true });
  });

  app.get("/api/me", async (request) => {
    const steamId = await currentUser(request);
    if (!steamId) return { hrac: null };
    return { hrac: await getPlayer(steamId) };
  });
}
