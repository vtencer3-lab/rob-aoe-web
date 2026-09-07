import type { FastifyInstance } from "fastify";
import {
  createAkce,
  getAktivniAkce,
  setAkceStav,
  setNastaveniLobby,
  setSkladani,
  signUp,
  ulozNastaveniLobby,
  withdraw,
  type AkceStav,
} from "../../db/events.js";
import { jeUnikatniKonflikt } from "../../db/chyby.js";
import { broadcastAkce, buildAkceStav } from "../../realtime/akceStav.js";
import { redigujProDivaka, zjistiDivaka } from "../../realtime/redakce.js";
import { BARVY, TYMY, type Barva, type SestavaVstup, type Tym } from "../../shared/types.js";
import { HttpError, requireAdmin, requireId, requireUser } from "../guards.js";
import { prectiNastaveniLobby } from "./kontrolaLobby.js";

const STAVY: readonly AkceStav[] = ["bezi", "konec"];

/** Tělo `{sestava: [...]}` rozpracované sestavy: jen tvar řádků, nejvýš 16 lidí, bez duplicit. */
export function prectiSkladani(telo: unknown): SestavaVstup[] {
  const sestava = (telo as { sestava?: unknown } | null)?.sestava;
  if (!Array.isArray(sestava)) throw new HttpError(400, "Chybí sestava.");
  if (sestava.length > 16) throw new HttpError(400, "Sestava má nejvýš 16 řádků.");
  const vysledek: SestavaVstup[] = [];
  const videne = new Set<string>();
  for (const radek of sestava) {
    if (typeof radek !== "object" || radek === null) throw new HttpError(400, "Řádek sestavy není objekt.");
    const { steamId, tym, barva, civ } = radek as { steamId?: unknown; tym?: unknown; barva?: unknown; civ?: unknown };
    if (typeof steamId !== "string" || steamId === "" || videne.has(steamId)) throw new HttpError(400, "Řádek sestavy nemá hráče, nebo je tam dvakrát.");
    if (typeof tym !== "number" || !TYMY.includes(tym as Tym)) throw new HttpError(400, "Tým musí být – nebo 1 až 4.");
    if (typeof barva !== "number" || !BARVY.includes(barva as Barva)) throw new HttpError(400, "Barva musí být 1 až 8.");
    if (civ !== undefined && civ !== null && typeof civ !== "number") throw new HttpError(400, "Civilizace musí být číslo, nebo prázdná.");
    videne.add(steamId);
    vysledek.push({ steamId, tym: tym as Tym, barva: barva as Barva, civ: typeof civ === "number" ? civ : null });
  }
  return vysledek;
}

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

  // Očekávané nastavení lobby pro „Zkontrolovat lobby“. Mění se živě: každé
  // kliknutí v panelu ho pošle sem a přes SSE ho uvidí všichni.
  app.post("/api/akce/:id/nastaveni-lobby", async (request) => {
    await requireAdmin(request);
    const akceId = requireId(request);
    const akce = await setNastaveniLobby(akceId, prectiNastaveniLobby(request.body));
    await broadcastAkce();
    return { akce };
  });

  // „Uložit nastavení lobby“: snímek živého nastavení, ke kterému se admin
  // vrátí přes „Načíst uložené“ (to jen pošle snímek jako živé nastavení).
  app.post("/api/akce/:id/nastaveni-lobby/ulozit", async (request) => {
    await requireAdmin(request);
    const akceId = requireId(request);
    const akce = await ulozNastaveniLobby(akceId);
    await broadcastAkce();
    return { akce };
  });

  // Rozpracovaná sestava: co Rob zrovna naklikal, vidí i druhý admin. Tvar
  // se kontroluje, pravidla sestavy ne — rozpracovaná sestava smí být špatně,
  // to hlídá až vytvoření zápasu.
  app.put("/api/akce/:id/skladani", async (request) => {
    await requireAdmin(request);
    const akceId = requireId(request);
    const akce = await setSkladani(akceId, prectiSkladani(request.body));
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
