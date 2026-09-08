import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { existujeAdmin, getPlayer, upsertPlayer } from "../db/players.js";
import { createSession, deleteSession, getSessionUser } from "../db/sessions.js";
import { SESSION_TTL_MS } from "../db/sessions.js";
import {
  buildAuthUrl,
  extractSteamId,
  hasDuplicateOpenIdKeys,
  maNasNavrat,
  maPodepsanaPovinnaPole,
} from "./steamOpenId.js";

/** Jak dlouho smí `/api/me` čekat na jméno hráče při prvním přihlášení. */
export const CEKANI_NA_JMENO_MS = 4_000;

export interface AuthDeps {
  overSteam: (params: URLSearchParams) => Promise<boolean>;
  obnovStaty: (steamId: string) => Promise<void>;
}

/**
 * Kdo má být po tomhle přihlášení admin. `null` znamená "nesahej na to".
 *
 * Když je ADMIN_STEAM_ID nastavené, rozhoduje jenom ten seznam — a to i směrem
 * dolů, takže vyškrtnutím z proměnné se adminovi práva zase odeberou.
 * V nouzovém režimu povyšujeme jen dokud žádný admin neexistuje; jakmile ho
 * databáze má, nikomu dalšímu se nic nepřidá a nikomu nic neubere.
 */
export async function komuDatAdmina(steamId: string): Promise<boolean | null> {
  if (config.adminSteamIds.length > 0) return config.adminSteamIds.includes(steamId);
  if (!config.adminBootstrap) return null;
  return (await existujeAdmin()) ? null : true;
}

/**
 * Jedno místo pro obě přihlašovací cesty (Steam i zkušební dveře). Cesta
 * cookie je základní cesta webu, aby se sezení z `/aoe` neposílalo na celou
 * doménu jouki.cz.
 */
export function nastaveniCookie(): {
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.jeProdukce,
    path: config.domovskaCesta,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export async function currentUser(request: FastifyRequest): Promise<string | null> {
  const sid = request.cookies[config.cookieNazev];
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

    await upsertPlayer(steamId, await komuDatAdmina(steamId));

    // Statistiky se stahují mimo přihlašovací cestu. Když selžou — i synchronně,
    // dřív než vznikne příslib — přihlášení platí dál.
    void Promise.resolve()
      .then(() => deps.obnovStaty(steamId))
      .catch(() => {});

    const sid = await createSession(steamId);
    return reply
      .setCookie(config.cookieNazev, sid, nastaveniCookie())
      .redirect(config.domovskaCesta, 302);
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const sid = request.cookies[config.cookieNazev];
    if (sid) await deleteSession(sid);
    return reply
      .clearCookie(config.cookieNazev, { path: config.domovskaCesta })
      .send({ ok: true });
  });

  app.get("/api/me", async (request) => {
    const steamId = await currentUser(request);
    if (!steamId) return { hrac: null };
    // Úplně první přihlášení: řádek hráče v tu chvíli existuje, ale je prázdný,
    // protože stahování statistik běží mimo přihlašovací cestu. Kdybychom
    // odpověděli hned, v záhlaví by svítilo Steam ID, dokud si člověk stránku
    // nenačte znovu. Proto se u nepojmenovaného hráče na obnovu chvíli počká —
    // ale jen chvíli, ať přihlášení nedrží pohledem do nefunkčního Steamu.
    const cerstvy = await getPlayer(steamId);
    if (cerstvy && !cerstvy.alias && !cerstvy.steamName) {
      await Promise.race([
        deps.obnovStaty(steamId).catch(() => {}),
        new Promise((hotovo) => setTimeout(hotovo, CEKANI_NA_JMENO_MS)),
      ]);
      return { hrac: (await getPlayer(steamId)) ?? cerstvy };
    }
    // Statistiky se dřív obnovovaly jen při přihlášení, a sezení drží měsíc:
    // kdo se nepřihlásil znovu, měl v tabulce data z prvního dne. Načtení
    // stránky je dost častá a dost levná příležitost; obnova sama hlídá,
    // že se Steamu neptá častěji než jednou za patnáct minut.
    void Promise.resolve()
      .then(() => deps.obnovStaty(steamId))
      .catch(() => {});
    return { hrac: await getPlayer(steamId) };
  });
}
