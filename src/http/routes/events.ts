import type { FastifyInstance } from "fastify";
import {
  createAkce,
  getAktivniAkce,
  setAkceStav,
  setNastaveniLobby,
  signUp,
  withdraw,
  type AkceStav,
} from "../../db/events.js";
import { jeUnikatniKonflikt } from "../../db/chyby.js";
import { broadcastAkce, buildAkceStav } from "../../realtime/akceStav.js";
import { redigujProDivaka, zjistiDivaka } from "../../realtime/redakce.js";
import { HttpError, requireAdmin, requireId, requireUser } from "../guards.js";
import { prectiNastaveniLobby } from "./kontrolaLobby.js";

const STAVY: readonly AkceStav[] = ["bezi", "konec"];

export function registerEventRoutes(app: FastifyInstance): void {
  app.get("/api/akce", async (request) => {
    const divak = await zjistiDivaka(request);
    return redigujProDivaka(await buildAkceStav(), divak);
  });

  app.post("/api/akce", async (request) => {
    await requireAdmin(request);
    const { nazev } = request.body as { nazev?: unknown };
    if (typeof nazev !== "string" || nazev.trim() === "") {
      throw new HttpError(400, "Akce musí mít název.");
    }
    try {
      const akce = await createAkce(nazev.trim());
      await broadcastAkce();
      return { akce };
    } catch (err) {
      // Migrace 003 drží v databázi invariant „nejvýš jedna nedokončená akce“.
      // Bez něj by se odběratelé SSE přihlášení na starou akci tiše zasekli na
      // posledním stavu, takže je lepší Roba zastavit hned a srozumitelně.
      if (jeUnikatniKonflikt(err)) {
        throw new HttpError(
          409,
          "Ještě běží jiná akce. Nastav jí nejdřív stav „konec“, teprve pak zakládej další.",
        );
      }
      throw err;
    }
  });

  app.post("/api/akce/:id/stav", async (request) => {
    await requireAdmin(request);
    const akceId = requireId(request);
    const { stav } = request.body as { stav?: unknown };
    if (typeof stav !== "string" || !STAVY.includes(stav as AkceStav)) {
      throw new HttpError(400, "Neznámý stav akce.");
    }
    const akce = await setAkceStav(akceId, stav as AkceStav);
    await broadcastAkce();
    return { akce };
  });

  // Očekávané nastavení lobby pro „Zkontrolovat lobby“ — Rob si ho nastaví
  // jednou za večer; kontrola zápasů s ním pak porovnává, co host naklikal.
  app.post("/api/akce/:id/nastaveni-lobby", async (request) => {
    await requireAdmin(request);
    const akceId = requireId(request);
    const akce = await setNastaveniLobby(akceId, prectiNastaveniLobby(request.body));
    await broadcastAkce();
    return { akce };
  });

  app.post("/api/akce/:id/prihlaska", async (request) => {
    const steamId = await requireUser(request);
    const akceId = requireId(request);
    const akce = await getAktivniAkce();
    // Skončenou akci getAktivniAkce nevrací, takže „akce běží“ a „hlásit se lze“
    // splývají v jedno. Zvláštní stav pro otevřené přihlašování neexistuje —
    // kdo dorazí uprostřed večera, přihlásí se stejně jako ten, kdo přišel včas.
    if (!akce || akce.id !== akceId) {
      throw new HttpError(409, "Tahle akce neběží.");
    }
    await signUp(akceId, steamId);
    await broadcastAkce();
    return { ok: true };
  });

  app.delete("/api/akce/:id/prihlaska", async (request) => {
    const steamId = await requireUser(request);
    const akceId = requireId(request);
    await withdraw(akceId, steamId);
    await broadcastAkce();
    return { ok: true };
  });
}
