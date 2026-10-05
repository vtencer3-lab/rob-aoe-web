import { createHmac } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { HttpError, requireUser } from "../http/guards.js";
import { buildAkceStav } from "../realtime/akceStav.js";
import { redigujDiplo } from "../shared/diplomacie/viditelnost.js";
import type { DiploData } from "../shared/diplomacie/typy.js";
import type { ZapasView } from "../shared/types.js";
import { sediTajemstvi } from "./hra.js";

/** Co dostane overlay: běžící zápas Diplomacie očima GM, nebo nic. */
export interface ObsStav {
  zapas: ZapasView | null;
  data: DiploData | null;
}

/**
 * Overlaye do OBS (uživatel 3. 10. 2026): mapa s králi a tabulka rolí pro
 * stream. Browser source v OBS není přihlášený, proto klíč v adrese
 * (`?klic=`, env `OBS_KLIC`) — kdo ho má, vidí totéž co GM: všechny role
 * a data ze hry. Bez `OBS_KLIC` se routa neregistruje.
 *
 * Bere nejnověji založený běžící zápas Diplomacie otevřené akce, data bez
 * redakce (pohled GM). Overlay se ptá každou sekundu; stav staví táž funkce
 * jako SSE, ať overlay ukazuje přesně totéž co pult.
 */
export function registerObsRoutes(app: FastifyInstance): void {
  if (config.obsKlic === "") return;
  app.get("/api/diplo/obs", async (request: FastifyRequest): Promise<ObsStav> => {
    const { klic } = request.query as { klic?: string };
    if (!sediTajemstvi(klic ?? "", config.obsKlic)) throw new HttpError(401, "Chybí nebo nesedí klíč overlaye.");
    const stav = await buildAkceStav();
    if (stav.rezim?.id !== "diplomacie") return { zapas: null, data: null };
    const data = stav.rezim.data;
    const bezici = stav.zapasy.filter((z) => z.stav === "bezi" && data.zapasy.some((d) => d.zapasId === z.id)).sort((a, b) => b.poradi - a.poradi);
    const zapas = bezici[0] ?? null;
    if (!zapas) return { zapas: null, data: null };
    return { zapas, data: { ...data, zapasy: data.zapasy.filter((d) => d.zapasId === zapas.id) } };
  });

  // Osobní overlay karty hráče pro streamery (uživatel 4. 10. 2026):
  // `…/obs/karta?hrac=<id>&klic=<podpis>`. Klíč je HMAC id hráče tajemstvím
  // OBS_KLIC — odkaz na cizí kartu si nikdo nevyrobí a nepotřebuje to
  // databázi. Data jdou stejnou redakcí jako hráči na webu (jen jeho role).
  app.get("/api/diplo/obs/muj-odkaz", async (request) => {
    const hracId = await requireUser(request);
    return { hrac: hracId, klic: klicKarty(hracId) };
  });

  app.get("/api/diplo/obs/hrac", async (request: FastifyRequest): Promise<ObsStav> => {
    const { hrac, klic } = request.query as { hrac?: string; klic?: string };
    if (!hrac || !sediTajemstvi(klic ?? "", klicKarty(hrac))) throw new HttpError(401, "Chybí nebo nesedí klíč overlaye.");
    const stav = await buildAkceStav();
    if (stav.rezim?.id !== "diplomacie") return { zapas: null, data: null };
    const data = stav.rezim.data;
    // Jeho nejnovější běžící zápas Diplomacie.
    const zapas = stav.zapasy.filter((z) => z.stav === "bezi" && z.ucastnici.some((u) => u.hracId === hrac) && data.zapasy.some((d) => d.zapasId === z.id)).sort((a, b) => b.poradi - a.poradi)[0];
    if (!zapas) return { zapas: null, data: null };
    return { zapas, data: redigujDiplo({ ...data, zapasy: data.zapasy.filter((d) => d.zapasId === zapas.id) }, hrac) };
  });
}

/** Podpis id hráče pro jeho osobní overlay (24 hex znaků). */
export function klicKarty(hracId: string): string {
  return createHmac("sha256", `karta:${config.obsKlic}`).update(hracId).digest("hex").slice(0, 24);
}
