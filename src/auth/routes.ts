import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getPlayer, upsertPlayer } from "../db/players.js";
import { createSession, deleteSession, getSessionUser } from "../db/sessions.js";
import { SESSION_TTL_MS } from "../db/sessions.js";
import {
  buildAuthUrl,
  extractSteamId,
  hasDuplicateOpenIdKeys,
  maNasNavrat,
  maPodepsanaPovinnaPole,
} from "./steamOpenId.js";

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
    // request.query nejde použít: Fastify 5 parsuje dotaz přes fast-querystring,
    // které zdvojený klíč vrátí jako pole, a URLSearchParams by ho spojilo čárkou
    // do jedné hodnoty. Tím by zdvojení navždy zmizelo dřív, než ho kdokoliv
    // stihne zkontrolovat. Dotaz proto stavíme přímo ze surového query stringu,
    // který zdvojení, pořadí i kódování zachová beze změny.
    const dotaz = request.raw.url?.split("?", 2)[1] ?? "";
    const params = new URLSearchParams(dotaz);

    // Zdvojený openid.* parametr odmítáme tady, na úrovni routy — nespoléháme na
    // to, že konkrétní implementace deps.overSteam (obvykle verifyWithSteam) tuto
    // kontrolu provede sama. Žádné volání overSteam ani síťový dotaz na Steam se
    // pak pro podvržený návrat vůbec neuskuteční.
    if (hasDuplicateOpenIdKeys(params)) {
      return reply.code(401).send({ chyba: "Neplatný návrat ze Steamu: zdvojený parametr." });
    }

    // Obojí se odmítá tady, před jakýmkoliv síťovým dotazem na Steam — stejně
    // jako zdvojený parametr výše. Steam ve stateless režimu ověří podpis, ale
    // netuší, komu assertion patřila; kdo ji nezkontroluje sám, přihlásí kohokoliv,
    // kdo se přihlásil kdekoliv jinde.
    if (!maPodepsanaPovinnaPole(params)) {
      return reply
        .code(401)
        .send({ chyba: "Neplatný návrat ze Steamu: chybí podpis identity." });
    }
    if (!maNasNavrat(params, config.baseUrl)) {
      return reply
        .code(401)
        .send({ chyba: "Neplatný návrat ze Steamu: přihlášení nepatří tomuhle webu." });
    }

    const steamId = extractSteamId(params);
    if (!steamId) return reply.code(401).send({ chyba: "Steam nevrátil platný identifikátor." });
    if (!(await deps.overSteam(params))) {
      return reply.code(401).send({ chyba: "Steam přihlášení se nepodařilo ověřit." });
    }

    await upsertPlayer(steamId, steamId === config.adminSteamId);

    // Statistiky se stahují mimo přihlašovací cestu. Když selžou — i synchronně,
    // dřív než vznikne příslib — přihlášení platí dál.
    void Promise.resolve()
      .then(() => deps.obnovStaty(steamId))
      .catch(() => {});

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
