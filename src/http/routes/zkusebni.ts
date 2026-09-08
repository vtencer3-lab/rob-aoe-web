import type { FastifyInstance } from "fastify";
import { config } from "../../config.js";
import { getAktivniAkce, listSignups, pretocCas, signUp, withdraw } from "../../db/events.js";
import { savePlayerStats, upsertPlayer } from "../../db/players.js";
import { jeZkusebni, ZKUSEBNI_HRACI, zkusebniId } from "../../matches/zkusebniHraci.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import { AKTIVITA_MINUT } from "../../shared/aktivita.js";
import { VERZE } from "../../shared/verze.js";
import { HttpError, requireAdmin, requireId } from "../guards.js";

/**
 * Zkušební hráči pro režii na vývojové verzi (jouki.cz/aoe/dev): Rob nemá po
 * ruce čtyři lidi, ale skládání, karty a výsledky potřebuje vidět s plnou
 * sestavou. Na rozdíl od zkušebních dveří (/api/dev/*) se za ně nejde
 * přihlásit — jen se přihlašují do akce. Zapíná se proměnnou ZKUSEBNI_HRACI,
 * kterou má jen vývojová aplikace; na ostré vrací 404 jako neexistující cesta.
 */
export function registerZkusebniRoutes(app: FastifyInstance): void {
  // Frontend se ptá, jestli tlačítka vůbec kreslit. Veřejné a neškodné.
  app.get("/api/nastaveni", async () => ({ verze: VERZE, zkusebniHraci: config.zkusebniHraci }));

  const zkontroluj = () => {
    if (!config.zkusebniHraci) throw new HttpError(404, "Neznámá cesta.");
  };

  // Přidá dalšího zkušebního hráče, který v akci ještě není (pořadí ze seznamu).
  app.post("/api/akce/:id/zkusebni-hraci", async (request) => {
    zkontroluj();
    await requireAdmin(request);
    const akceId = requireId(request);
    const akce = await getAktivniAkce();
    if (!akce || akce.id !== akceId) throw new HttpError(409, "Tahle akce neběží.");

    const prihlaseni = new Set((await listSignups(akceId)).map((h) => h.steamId));
    const dalsi = ZKUSEBNI_HRACI.find((z) => !prihlaseni.has(zkusebniId(z.jmeno)));
    if (!dalsi) throw new HttpError(409, `Všech ${ZKUSEBNI_HRACI.length} zkušebních hráčů už v akci je.`);

    const steamId = zkusebniId(dalsi.jmeno);
    await upsertPlayer(steamId, null);
    await savePlayerStats(steamId, {
      alias: dalsi.jmeno,
      steamName: dalsi.jmeno,
      elo1v1: dalsi.elo,
      eloNejvyssi: dalsi.elo + 60,
      odehranoHer: dalsi.her,
      chyba: null,
    });
    await signUp(akceId, steamId);
    await broadcastAkce();
    return { pridan: dalsi.jmeno };
  });

  // Přetočí lhůty aktivity o čtvrt hodiny dopředu, tedy tak, že všichni
  // přihlášení usnou. Jinak by se chování dalo zkoušet jen čekáním.
  app.post("/api/akce/:id/pretocit-cas", async (request) => {
    zkontroluj();
    await requireAdmin(request);
    const akceId = requireId(request);
    const akce = await getAktivniAkce();
    if (!akce || akce.id !== akceId) throw new HttpError(409, "Tahle akce neběží.");
    const dotcenych = await pretocCas(akceId, AKTIVITA_MINUT);
    if (dotcenych > 0) await broadcastAkce();
    return { minut: AKTIVITA_MINUT, dotcenych };
  });

  // Odhlásí z akce všechny zkušební hráče. Řádky v player zůstávají — jsou
  // neškodné a příště se jen znovu přihlásí.
  app.delete("/api/akce/:id/zkusebni-hraci", async (request) => {
    zkontroluj();
    await requireAdmin(request);
    const akceId = requireId(request);
    const zkusebni = (await listSignups(akceId)).filter((h) => jeZkusebni(h.steamId));
    for (const h of zkusebni) await withdraw(akceId, h.steamId);
    if (zkusebni.length > 0) await broadcastAkce();
    return { odebrano: zkusebni.length };
  });
}
