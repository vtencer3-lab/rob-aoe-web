import { createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { HttpError, requireUser } from "../http/guards.js";
import { prectiSnimek, type SnimekHry } from "../shared/diplomacie/hra.js";
import { beziciZapasyDiplo, hracPodleKliceMostu, nastavKlicMostu, stavKliceMostu, zrusKlicMostu } from "./db.js";
import { prijmiSnimek } from "./hra.js";
import { teloZXsdat } from "./xsdat.js";

/**
 * Osobní most ke hře přes Streamer.bot (uživatel 5. 10. 2026): kdokoli si
 * na webu vygeneruje vlastní klíč, jeho Streamer.bot pak posílá soubor
 * sondy (`ROB_*.xsdat`) tak, jak je, na `POST /api/diplo/hra-soubor`
 * a web ho přečte sám (xsdat.ts). Data se přijmou jen od **GM běžícího
 * zápasu Diplomacie** a patří jeho zápasu — nikdo nic neschvaluje, právo
 * dává role GM. Web drží jen otisk klíče; klíč se ukáže jednou.
 *
 * Starší cesta s jedním společným `MOST_TOKEN` (Židolišta za Roba) běží
 * dál vedle (hra.ts), dokud na osobní klíč nepřejde i Rob.
 */

/** Soubor sondy má kolem 2 kB, v base64 o třetinu víc; 32 kB je strop proti balastu. */
const MAX_TELO = 32 * 1024;

const otiskKlice = (klic: string) => createHash("sha256").update(klic).digest("hex");

function klicZHlavicky(request: FastifyRequest): string {
  const h = request.headers.authorization;
  return typeof h === "string" && h.startsWith("Bearer ") ? h.slice("Bearer ".length).trim() : "";
}

/** Před čtením těla: bez platného klíče 401 dřív, než se cokoli načte. Platný klíč zapíše čas spojení. */
async function overKlic(request: FastifyRequest): Promise<void> {
  const klic = klicZHlavicky(request);
  const hracId = klic === "" ? null : await hracPodleKliceMostu(otiskKlice(klic));
  if (!hracId) throw new HttpError(401, "Chybí nebo nesedí osobní klíč mostu — stáhni si akci znovu na webu.");
  (request as FastifyRequest & { hracMostu?: string }).hracMostu = hracId;
}

export function registerMostKlicRoutes(app: FastifyInstance): void {
  // Tep (uživatel 5. 10. 2026: „zelený indikátor, že je spojení funkční“):
  // akce se ozve i bez běžící hry (TEP_MOSTU_S), platný klíč zapíše čas
  // spojení a pult GM podle něj svítí zeleně. Nic dalšího tep nedělá.
  app.post("/api/diplo/most/tep", { bodyLimit: 1024, onRequest: overKlic }, async () => ({ ok: true }));

  app.get("/api/diplo/most/klic", async (request) => {
    const hracId = await requireUser(request);
    return { klic: await stavKliceMostu(hracId) };
  });

  // Nový klíč (starý tím přestane platit). Klíč se vrátí jen teď.
  app.post("/api/diplo/most/klic", async (request) => {
    const hracId = await requireUser(request);
    const klic = randomBytes(24).toString("base64url");
    await nastavKlicMostu(hracId, otiskKlice(klic));
    return { klic };
  });

  app.delete("/api/diplo/most/klic", async (request) => {
    const hracId = await requireUser(request);
    await zrusKlicMostu(hracId);
    return { ok: true };
  });

  app.post(
    "/api/diplo/hra-soubor",
    {
      bodyLimit: MAX_TELO,
      onRequest: overKlic,
    },
    async (request) => {
      const hracId = (request as FastifyRequest & { hracMostu?: string }).hracMostu!;
      const { jmeno, soubor } = (request.body ?? {}) as { jmeno?: unknown; soubor?: unknown };
      if (typeof jmeno !== "string" || !/^ROB_[\w.-]{1,90}\.xsdat$/i.test(jmeno) || typeof soubor !== "string") throw new HttpError(400, "Čekám { jmeno: \"ROB_….xsdat\", soubor: base64 }.");
      // Právo dává role: GM běžícího zápasu Diplomacie.
      if (!(await beziciZapasyDiplo()).some((z) => z.gmHracId === hracId)) throw new HttpError(403, "Nejsi GM běžícího zápasu Diplomacie — data ze hry web přijímá jen od GM.");
      let snimek: SnimekHry;
      try {
        snimek = prectiSnimek(teloZXsdat(Buffer.from(soubor, "base64"), jmeno, hracId));
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? `Soubor sondy: ${e.message}` : "Soubor sondy nejde přečíst.");
      }
      const prijeti = await prijmiSnimek(snimek);
      if ("nenalezeno" in prijeti) throw new HttpError(404, prijeti.nenalezeno);
      return { ok: true, ...prijeti };
    },
  );
}
