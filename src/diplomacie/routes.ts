import { randomInt } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { getZapas } from "../db/matches.js";
import { HttpError, requireId, requireUser } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { losujRole, zmenCil, zmenRoli } from "../shared/diplomacie/los.js";
import type { DiploZapas, Role } from "../shared/diplomacie/typy.js";
import type { rozeberScenar } from "./rozbor.js";
import { getDiploZapas, setNastupce, setStavDiplo, ulozRole, upravRoli, vratNaPripravu } from "./db.js";

export interface DiploDeps {
  rozeberScenar: typeof rozeberScenar;
}

const ROLE: readonly Role[] = ["garda", "najezdnik", "sasek", "zoldak", "kat"];

/** Přihlášený musí být GM tohoto zápasu Diplomacie; admin výjimku nemá (spec §6.3). */
async function requireGm(request: FastifyRequest): Promise<{ diplo: DiploZapas; hraci: string[] }> {
  const hracId = await requireUser(request);
  const zapasId = requireId(request);
  const diplo = await getDiploZapas(zapasId);
  if (!diplo) throw new HttpError(404, "Tohle není zápas Diplomacie.");
  if (diplo.gmHracId !== hracId) throw new HttpError(403, "Tohle smí jen GM tohoto zápasu.");
  const zaznam = await getZapas(zapasId);
  // Hráči v pořadí slotů, bez GM — mezi ně se rozdávají role.
  const hraci = (zaznam?.ucastnici ?? []).filter((u) => u.hracId !== diplo.gmHracId).map((u) => u.hracId);
  return { diplo, hraci };
}

const potvrzeno = (request: FastifyRequest) => (request.body as { potvrzeno?: unknown } | null)?.potvrzeno === true;

/** Pravidla losu hlásí porušení výjimkou s českou větou — pro klienta je to 400, ne pád serveru. */
function chybaPravidla<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    throw new HttpError(400, e instanceof Error ? e.message : "Neplatná úprava.");
  }
}

export function registerDiplomacieRoutes(app: FastifyInstance, deps: DiploDeps): void {
  app.post("/api/diplo/zapas/:id/nastupce", async (request) => {
    const { diplo, hraci } = await requireGm(request);
    if (diplo.stav !== "priprava") throw new HttpError(409, "Nástupce se vybírá jen v přípravě — nejdřív Zpět na výběr Nástupce.");
    const { hracId } = (request.body ?? {}) as { hracId?: unknown };
    if (typeof hracId !== "string" || !hraci.includes(hracId)) throw new HttpError(400, "Nástupcem může být jen hráč zápasu (ne GM).");
    await setNastupce(diplo.zapasId, hracId);
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/los", async (request) => {
    const { diplo, hraci } = await requireGm(request);
    if (diplo.stav === "rozeslano") throw new HttpError(409, "Role už jsou rozeslané — přelosovat jde jen před rozesláním.");
    if (diplo.nastupceHracId === null) throw new HttpError(409, "Nejdřív vyber Nástupce.");
    const role = chybaPravidla(() => losujRole(hraci, diplo.nastupceHracId!, randomInt));
    await ulozRole(diplo.zapasId, role, "losovano");
    await broadcastAkce();
    return { ok: true };
  });

  app.put("/api/diplo/zapas/:id/role/:hracId", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav === "priprava") throw new HttpError(409, "Role ještě nejsou vylosované.");
    if (diplo.stav === "rozeslano" && !potvrzeno(request)) throw new HttpError(409, "Role už hráči vidí — změnu je potřeba potvrdit.");
    const { hracId } = request.params as { hracId: string };
    const telo = (request.body ?? {}) as { role?: unknown; cilHracId?: unknown };
    let role = diplo.role;
    if (telo.role !== undefined) {
      if (!ROLE.includes(telo.role as Role)) throw new HttpError(400, "Neznámá role.");
      role = chybaPravidla(() => zmenRoli(role, hracId, telo.role as Role, diplo.nastupceHracId!, randomInt));
    }
    if (telo.cilHracId !== undefined) {
      if (typeof telo.cilHracId !== "string") throw new HttpError(400, "Cíl musí být hráč.");
      role = chybaPravidla(() => zmenCil(role, hracId, telo.cilHracId as string, diplo.nastupceHracId!));
    }
    const nova = role.find((r) => r.hracId === hracId);
    if (!nova) throw new HttpError(404, "Takový hráč v zápase není.");
    // Po rozeslání hráč na kartě uvidí „GM upravil tvou roli“ (spec §6.2); příznak se už nevrací.
    await upravRoli(diplo.zapasId, { ...nova, upravenoPoRozeslani: diplo.stav === "rozeslano" || nova.upravenoPoRozeslani });
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/rozeslat", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav !== "losovano") throw new HttpError(409, "Rozeslat jde jen vylosované role.");
    await setStavDiplo(diplo.zapasId, "rozeslano");
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/zpet", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav === "priprava") return { ok: true };
    if (diplo.stav === "rozeslano" && !potvrzeno(request)) throw new HttpError(409, "Role už hráči vidí — návrat je potřeba potvrdit.");
    await vratNaPripravu(diplo.zapasId);
    await broadcastAkce();
    return { ok: true };
  });

  registerScenarRoutes(app, deps);
}

/** Routy verzí scénáře (spec §5.3) přidá úkol 10; zatím žádné nejsou. */
function registerScenarRoutes(_app: FastifyInstance, _deps: DiploDeps): void {}
