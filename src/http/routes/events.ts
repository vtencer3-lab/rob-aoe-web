import type { FastifyInstance } from "fastify";
import {
  createAkce,
  getAktivniAkce,
  listSignups,
  setAkceStav,
  signUp,
  withdraw,
  type AkceStav,
} from "../../db/events.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import { HttpError, requireAdmin, requireUser } from "../guards.js";

const STAVY: readonly AkceStav[] = ["priprava", "prihlasovani", "zavreno", "bezi", "konec"];

export function registerEventRoutes(app: FastifyInstance): void {
  app.get("/api/akce", async () => {
    const akce = await getAktivniAkce();
    if (!akce) return { akce: null, prihlaseni: [] };
    return { akce, prihlaseni: await listSignups(akce.id) };
  });

  app.post("/api/akce", async (request) => {
    await requireAdmin(request);
    const { nazev } = request.body as { nazev?: unknown };
    if (typeof nazev !== "string" || nazev.trim() === "") {
      throw new HttpError(400, "Akce musí mít název.");
    }
    const akce = await createAkce(nazev.trim());
    await broadcastAkce(akce.id);
    return { akce };
  });

  app.post("/api/akce/:id/stav", async (request) => {
    await requireAdmin(request);
    const akceId = Number((request.params as { id: string }).id);
    const { stav } = request.body as { stav?: unknown };
    if (typeof stav !== "string" || !STAVY.includes(stav as AkceStav)) {
      throw new HttpError(400, "Neznámý stav akce.");
    }
    const akce = await setAkceStav(akceId, stav as AkceStav);
    await broadcastAkce(akceId);
    return { akce };
  });

  app.post("/api/akce/:id/prihlaska", async (request) => {
    const steamId = await requireUser(request);
    const akceId = Number((request.params as { id: string }).id);
    const akce = await getAktivniAkce();
    if (!akce || akce.id !== akceId || akce.stav !== "prihlasovani") {
      throw new HttpError(409, "Přihlašování do téhle akce není otevřené.");
    }
    await signUp(akceId, steamId);
    await broadcastAkce(akceId);
    return { ok: true };
  });

  app.delete("/api/akce/:id/prihlaska", async (request) => {
    const steamId = await requireUser(request);
    const akceId = Number((request.params as { id: string }).id);
    await withdraw(akceId, steamId);
    await broadcastAkce(akceId);
    return { ok: true };
  });
}
