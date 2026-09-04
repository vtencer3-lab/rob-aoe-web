import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { getAktivniAkce, signUp } from "../db/events.js";
import { savePlayerStats, upsertPlayer } from "../db/players.js";
import { getPool } from "../db/pool.js";
import { createSession, SESSION_TTL_MS } from "../db/sessions.js";
import { HttpError } from "../http/guards.js";
import { currentUser } from "./routes.js";
import { broadcastAkce } from "../realtime/akceStav.js";

/**
 * Zkušební hráči. Jména jsou napevno, aby opakované volání vracelo pořád
 * tytéž lidi — jinak by každé naplnění nasypalo do seznamu další cizince
 * a Rob by se v testovací akci přestal vyznat.
 */
const ZKUSEBNI = [
  { jmeno: "Pepa", elo: 1180, her: 342 },
  { jmeno: "Jana", elo: 1520, her: 1204 },
  { jmeno: "Karel", elo: 890, her: 87 },
  { jmeno: "Lida", elo: 1340, her: 655 },
  { jmeno: "Mirek", elo: 1010, her: 210 },
  { jmeno: "Tonda", elo: 1690, her: 2431 },
] as const;

/**
 * Zkušební režisér. Není mezi hráči výše schválně: do akce se nepřihlašuje,
 * jen řídí. Díky němu si jde vlastním, skutečným Steam účtem projít celý
 * večer z pohledu obyčejného hráče — režii mezitím drží někdo jiný.
 */
export const REZISER = "Rezie";

/**
 * Steam ID zkušebního hráče. Prefix „test:“ je schválně něco, co skutečné
 * 64bitové Steam ID nikdy mít nebude — zkušební účet se tak nemůže srazit
 * s opravdovým člověkem ani omylem, a v databázi je na první pohled poznat.
 */
export function zkusebniId(jmeno: string): string {
  return `test:${jmeno.trim().toLowerCase()}`;
}

/** Účty skutečných lidí, tedy všechno, co nezaložily zkušební dveře. */
async function skutecneUcty(): Promise<{ steamId: string; alias: string | null }[]> {
  const { rows } = await getPool().query<{ steam_id: string; alias: string | null }>(
    "SELECT steam_id, alias FROM player WHERE steam_id NOT LIKE 'test:%' ORDER BY steam_id",
  );
  return rows.map((r) => ({ steamId: r.steam_id, alias: r.alias }));
}

async function steamIdAdmina(): Promise<string | null> {
  const { rows } = await getPool().query<{ steam_id: string }>(
    "SELECT steam_id FROM player WHERE je_admin ORDER BY steam_id LIMIT 1",
  );
  return rows[0]?.steam_id ?? null;
}

/**
 * Dvojitý zámek. Proměnná DEV_PRISTUP otevírá dveře, ale i kdyby ji někdo
 * nechal zapnutou (a nechá — v .env zůstane ležet), zavře je adresa: jakmile
 * BASE_URL míří na https, tedy na tunel, kudy web vidí celý internet, tahle
 * routa odmítá obsluhovat. Bez toho by šlo přes veřejnou adresu přihlásit se
 * za kohokoliv včetně Roba, a to bez jediného hesla.
 */
function otevreno(): boolean {
  return config.devPristup && !config.jeProdukce;
}

function zkontrolujDvere(): void {
  if (otevreno()) return;
  throw new HttpError(404, "Neznámá cesta.");
}

export function registerDevRoutes(app: FastifyInstance): void {
  // Podklad pro zkušební lištu na stránce. Když dveře nejsou otevřené, vrací
  // 404 stejně jako všechno ostatní pod /api/dev — frontend podle toho pozná,
  // že lištu vůbec nemá vykreslovat, a nepotřebuje o režimu vědět předem.
  app.get("/api/dev/hraci", async () => {
    zkontrolujDvere();
    return {
      hraci: ZKUSEBNI.map((z) => z.jmeno),
      reziser: { jmeno: REZISER, steamId: zkusebniId(REZISER) },
      // Aby se šlo vrátit k sobě: po přihlášení za Pepu je vlastní session
      // pryč a Steam na localhostu zpátky nepomůže — návrat ze Steamu míří
      // na BASE_URL, tedy sem, ale přihlašuje se přes veřejný Steam.
      skutecni: await skutecneUcty(),
      admin: await steamIdAdmina(),
    };
  });

  // Přihlášení bez Steamu. Kdo si chce vyzkoušet celý večer sám, potřebuje
  // být postupně čtyřmi lidmi — a čtyři skutečné Steam účty nikdo nemá.
  app.get("/api/dev/login", async (request, reply) => {
    zkontrolujDvere();
    const dotaz = request.query as { jmeno?: string; steamId?: string };
    const steamId = dotaz.steamId?.trim() || zkusebniId(dotaz.jmeno ?? "Pepa");

    // jeAdmin = null znamená „nesahej na to“: přihlášení pod vlastním Steam ID
    // tak zkušebními dveřmi nemůže Robovi sebrat režii.
    await upsertPlayer(steamId, null);
    if (steamId.startsWith("test:")) {
      const jmeno = dotaz.jmeno?.trim() || "Pepa";
      const vzor = ZKUSEBNI.find((z) => z.jmeno.toLowerCase() === jmeno.toLowerCase());
      await savePlayerStats(steamId, {
        alias: jmeno,
        steamName: jmeno,
        elo1v1: vzor?.elo ?? 1000,
        odehranoHer: vzor?.her ?? 0,
        chyba: null,
      });
    }

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

  // Přenos režie. Bez tohohle je admin navždy ten, kdo se přihlásil první,
  // takže si vlastním účtem nešlo vyzkoušet, jak web vypadá očima hráče —
  // panel režie svítil pořád.
  app.get("/api/dev/rezie", async (request, reply) => {
    zkontrolujDvere();
    const dotaz = request.query as { steamId?: string };
    const komu = dotaz.steamId?.trim() || (await currentUser(request));
    if (!komu) {
      throw new HttpError(400, "Není komu režii dát: buď se přihlas, nebo pošli steamId.");
    }

    await upsertPlayer(komu, null);
    // Jedním příkazem, ne dvěma: mezistav se dvěma adminy (nebo bez jediného)
    // by přes SSE stihl proletět ven a panel by na okamžik viděl někdo, kdo
    // ho vidět nemá.
    await getPool().query("UPDATE player SET je_admin = (steam_id = $1)", [komu]);

    const akce = await getAktivniAkce();
    if (akce) await broadcastAkce(akce.id);
    return reply.redirect("/", 302);
  });

  // Nasype do běžící akce zkušební hráče, aby bylo z čeho skládat zápas.
  app.get("/api/dev/naplnit", async (request, reply) => {
    zkontrolujDvere();
    const dotaz = request.query as { pocet?: string };
    const pocet = Math.min(Math.max(Number(dotaz.pocet ?? 3) || 3, 1), ZKUSEBNI.length);

    const akce = await getAktivniAkce();
    if (!akce) throw new HttpError(409, "Napřed založ akci, teprve pak do ní zvi hráče.");

    for (const { jmeno, elo, her } of ZKUSEBNI.slice(0, pocet)) {
      const steamId = zkusebniId(jmeno);
      await upsertPlayer(steamId, null);
      await savePlayerStats(steamId, {
        alias: jmeno,
        steamName: jmeno,
        elo1v1: elo,
        eloNejvyssi: elo + 60,
        odehranoHer: her,
        chyba: null,
      });
      await signUp(akce.id, steamId);
    }

    await broadcastAkce(akce.id);
    return reply.redirect("/", 302);
  });
}
