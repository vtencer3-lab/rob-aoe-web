import { randomBytes } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { upsertHracXbox, xboxHracId } from "../db/players.js";
import { createSession } from "../db/sessions.js";
import type { XboxIdentita } from "../external/xboxLive.js";
import { buildAuthUrlMicrosoft, vytvorPkce } from "./microsoftOAuth.js";
import { komuDatAdmina, nastaveniCookie } from "./routes.js";

/** Cookie se `state|verifier` žije jen mezi odchodem a návratem. */
const STAV_COOKIE = "ms_stav";
const STAV_PLATNOST_S = 10 * 60;

export interface MicrosoftDeps {
  vymenKod: (kod: string, verifier: string) => Promise<string>;
  ziskejIdentitu: (accessToken: string) => Promise<XboxIdentita>;
  /** Gamerpic, vlastnictví hry a herní profil. Nesmí zdržet ani shodit přihlášení. */
  poPrihlaseni: (hracId: string, identita: XboxIdentita) => Promise<void>;
}

/** Cesta cookie se `state` je stejná jako u sezení, aby se obě chovaly shodně. */
function smazStavCookie(reply: {
  clearCookie: (name: string, opts: { path: string }) => unknown;
}): void {
  reply.clearCookie(STAV_COOKIE, { path: config.domovskaCesta });
}

export function registerMicrosoftRoutes(app: FastifyInstance, deps: MicrosoftDeps): void {
  app.get("/api/auth/microsoft", async (_request, reply) => {
    const { verifier, challenge } = vytvorPkce();
    const stav = randomBytes(16).toString("hex");
    return reply
      .setCookie(STAV_COOKIE, `${stav}|${verifier}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: config.jeProdukce,
        path: config.domovskaCesta,
        maxAge: STAV_PLATNOST_S,
      })
      .redirect(buildAuthUrlMicrosoft(config.baseUrl, config.msClientId, stav, challenge), 302);
  });

  app.get("/api/auth/microsoft/return", async (request, reply) => {
    const ulozeny = request.cookies[STAV_COOKIE];
    const [stav, verifier] = (ulozeny ?? "").split("|");
    const dotaz = request.query as { code?: string; state?: string; error?: string };

    // Cizí `state` se odmítá dřív, než se pošle jediný dotaz ven. Bez téhle
    // kontroly stačí útočníkovi podstrčit oběti vlastní kód a přihlásí ji do
    // svého účtu — stejná past jako u chybějícího ověření return_to u Steamu.
    if (!stav || !verifier || !dotaz.state || dotaz.state !== stav) {
      smazStavCookie(reply);
      return reply.code(401).send({ chyba: "Neplatný návrat z Microsoftu." });
    }
    if (!dotaz.code) {
      smazStavCookie(reply);
      return reply.code(401).send({ chyba: "Microsoft nevrátil přihlašovací kód." });
    }

    let identita: XboxIdentita;
    try {
      identita = await deps.ziskejIdentitu(await deps.vymenKod(dotaz.code, verifier));
    } catch (err: unknown) {
      // Hlášky z xboxLive.ts jsou už česky a určené hráči — nic jiného (natožpak
      // token) se do odpovědi ani do logu nepouští.
      smazStavCookie(reply);
      return reply
        .code(401)
        .send({ chyba: err instanceof Error ? err.message : "Přihlášení se nepodařilo." });
    }

    const hracId = xboxHracId(identita.xuid);
    await upsertHracXbox(identita.xuid, identita.gamertag, await komuDatAdmina(hracId));

    // Stejně jako u Steamu: doplňky běží mimo přihlašovací cestu, aby jejich
    // selhání nemohlo přihlášení zablokovat ani shodit.
    void Promise.resolve()
      .then(() => deps.poPrihlaseni(hracId, identita))
      .catch(() => {});

    const sid = await createSession(hracId);
    smazStavCookie(reply);
    return reply.setCookie(config.cookieNazev, sid, nastaveniCookie()).redirect(config.domovskaCesta, 302);
  });
}
