import type { FastifyInstance } from "fastify";
import { getPlayer } from "../../db/players.js";
import { getZapas } from "../../db/matches.js";
import { hlasHub } from "../../realtime/hlas.js";
import { KANAL_AKCE } from "../../realtime/hub.js";
import { orizniZesileni, ZESILENI_MIN } from "../../shared/hlas.js";
import type { HlasUdalost } from "../../shared/types.js";
import { HttpError, requireAdmin, requireId } from "../guards.js";

/** Jeden kousek nahrávky (čtvrt vteřiny Opusu je pár kB); větší je podezřelý. */
export const MAX_KOUSEK_B64 = 200_000;

/** Co z těla požadavku zbyde po kontrole; chybný kousek hlásí HttpError. */
export function rozeberKousek(telo: unknown): Pick<HlasUdalost, "sezeni" | "poradi" | "konec" | "data" | "mime" | "zesileni"> {
  const t = (typeof telo === "object" && telo !== null ? telo : {}) as Record<string, unknown>;
  const sezeni = typeof t["sezeni"] === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(t["sezeni"]) ? t["sezeni"] : null;
  const poradi = typeof t["poradi"] === "number" && Number.isInteger(t["poradi"]) && t["poradi"] >= 0 ? t["poradi"] : null;
  const konec = t["konec"] === true;
  const data = typeof t["data"] === "string" ? t["data"] : "";
  const mime = typeof t["mime"] === "string" && t["mime"].length <= 80 ? t["mime"] : undefined;
  // Zesílení jen přeposíláme (zesiluje přehrávač posluchače), ale strop
  // hlídáme tady: bez něj by upravený klient mohl posluchačům pustit
  // libovolný násobek.
  const zesileni = orizniZesileni(t["zesileni"]);
  if (!sezeni || poradi === null) throw new HttpError(400, "Kousek hlasu nemá sezení nebo pořadí.");
  if (data.length > MAX_KOUSEK_B64) throw new HttpError(413, "Kousek hlasu je moc velký.");
  if (!konec && data.length === 0) throw new HttpError(400, "Prázdný kousek hlasu.");
  return { sezeni, poradi, konec, data, ...(mime ? { mime } : {}), ...(zesileni > ZESILENI_MIN ? { zesileni } : {}) };
}

/**
 * Push-to-talk admina: každý kousek nahrávky přijde sem a jde hned dál
 * posluchačům přes SSE (realtime/hlas.ts). Nic se neukládá.
 */
export function registerHlasRoutes(app: FastifyInstance): void {
  app.post("/api/zapas/:id/hlas", async (request) => {
    const kdo = await requireAdmin(request);
    const zapasId = requireId(request);
    const kousek = rozeberKousek(request.body);

    const nacteny = await getZapas(zapasId);
    if (!nacteny) throw new HttpError(404, "Takový zápas neexistuje.");
    const mluvci = await getPlayer(kdo);
    const udalost: HlasUdalost = {
      zapasId,
      kdo,
      jmeno: mluvci?.alias ?? mluvci?.platformaJmeno ?? "Admin",
      ...kousek,
      prijemci: nacteny.ucastnici.map((u) => u.hracId),
    };
    hlasHub.publish(KANAL_AKCE, udalost);
    return { ok: true };
  });
}
