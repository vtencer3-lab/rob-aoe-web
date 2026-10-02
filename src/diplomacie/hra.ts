import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getZapas } from "../db/matches.js";
import { HttpError } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { prectiSnimek, vyhodnotHru, type SnimekHry } from "../shared/diplomacie/hra.js";
import { getDiploZapas, getVerze, najdiBeziciZapasGm, setNastupce } from "./db.js";
import { pametHer } from "./hraPamet.js";

/**
 * Příjem dat z běžící hry (most ke hře, první kus podprojektu 2). Skript na
 * PC GM čte soubor XS sondy a posílá snímky na `POST /api/diplo/hra`; web
 * z nich pozná Nástupce císaře (hráč, kterému hra nedala sekundární cíl)
 * a v přípravě ho nastaví sám.
 *
 * Poslední snímek každého zápasu žije jen v paměti (hraPamet.ts). Do stavu
 * pro prohlížeče ho přidává `doplnStav` módu, ostatním než GM ho maže
 * `redigujDiplo`.
 */

/**
 * Stav všem prohlížečům se staví z databáze; při boji se počitadla mění
 * každé 2 s, tak se průběžné změny rozesílají nejvýš takhle často (změna
 * Nástupce hned). Tep mostu (15 s) doručí poslední hodnoty i po klidu.
 */
const ROZESTUP_ROZESLANI_MS = 5_000;

export interface PrijetiSnimku {
  zapasId: number;
  nastupce: string | null;
  /** Česká věta pro obsluhu mostu, když něco nesedí, ale data se vzala. */
  varovani?: string;
}

/** Jméno scénáře bez přípony, malými: sonda ho hlásí podle jména svého souboru. */
const zakladJmena = (jmeno: string) => jmeno.replace(/\.aoe2scenario$/i, "").toLowerCase();

/**
 * Zpracuje jeden snímek: najde zápas podle GM, odvodí stav hráčů a v přípravě
 * nastaví Nástupce. Null = pro tohohle GM žádný zápas neběží.
 */
export async function prijmiSnimek(snimek: SnimekHry, ted: Date = new Date()): Promise<PrijetiSnimku | null> {
  // Složka profilu hry se jmenuje Steam ID nebo XUID; web vede hráče
  // z Microsoft účtu s předponou `xbox:`.
  const zapasId = await najdiBeziciZapasGm([snimek.gm, `xbox:${snimek.gm}`]);
  const diplo = zapasId === null ? null : await getDiploZapas(zapasId);
  const zaznam = zapasId === null ? null : await getZapas(zapasId);
  if (zapasId === null || !diplo || !zaznam) return null;

  const hraci = zaznam.ucastnici.filter((u) => u.hracId !== diplo.gmHracId).map((u) => ({ hracId: u.hracId, barva: u.barva }));
  const verze = diplo.scenarId === null ? null : await getVerze(diplo.scenarId);
  const hra = vyhodnotHru(snimek, hraci, verze?.sonda?.cile ?? [], ted.toISOString());

  const predchozi = pametHer.get(zapasId);
  let nastupceZeHry = predchozi?.nastupceZeHry ?? null;
  let zmenaNastupce = false;
  // Hra Nástupce nastaví, když ho určila nově (jiného než posledně), nebo
  // když zápas žádného nemá (po „Zpět na výběr Nástupce“). Ruční volbu GM
  // nechá být, dokud sama neurčí někoho jiného. Po rozdání rolí už nic.
  if (diplo.stav === "priprava" && hra.nastupceHracId !== null && (hra.nastupceHracId !== nastupceZeHry || diplo.nastupceHracId === null)) {
    if (diplo.nastupceHracId !== hra.nastupceHracId) {
      // Stejná cesta jako ruční výběr GM (POST …/nastupce).
      await setNastupce(zapasId, hra.nastupceHracId);
      zmenaNastupce = true;
    }
    nastupceZeHry = hra.nastupceHracId;
  }

  const rozeslat = zmenaNastupce || !predchozi || ted.getTime() - predchozi.rozeslanoMs >= ROZESTUP_ROZESLANI_MS;
  pametHer.set(zapasId, { hra, nastupceZeHry, rozeslanoMs: rozeslat || !predchozi ? ted.getTime() : predchozi.rozeslanoMs });
  if (rozeslat) await broadcastAkce();

  const vysledek: PrijetiSnimku = { zapasId, nastupce: hra.nastupceHracId };
  if (verze && zakladJmena(verze.jmenoSouboru) !== zakladJmena(snimek.scenar)) {
    vysledek.varovani = `Hra hlásí scénář „${snimek.scenar}“, zápas ale hraje „${verze.jmenoSouboru}“.`;
  } else if (verze && (verze.sonda === null || verze.sonda.chyba !== null)) {
    vysledek.varovani = "Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže.";
  }
  return vysledek;
}

/** Těla od mostu mají kolem 3 kB; 64 kB je strop proti balastu. */
const MAX_TELO = 64 * 1024;

/** Porovnání otisků: `timingSafeEqual` chce stejně dlouhé vstupy a délka tokenu se nemá prozradit. */
function sediToken(request: FastifyRequest): boolean {
  const hlavicka = request.headers.authorization;
  const predlozeny = typeof hlavicka === "string" && hlavicka.startsWith("Bearer ") ? hlavicka.slice("Bearer ".length) : "";
  const otisk = (t: string) => createHash("sha256").update(t).digest();
  return timingSafeEqual(otisk(predlozeny), otisk(config.mostToken));
}

/** Bez `MOST_TOKEN` se routa vůbec neregistruje — web pak data ze hry nepřijímá od nikoho. */
export function registerHraRoutes(app: FastifyInstance): void {
  if (config.mostToken === "") return;
  app.post(
    "/api/diplo/hra",
    {
      bodyLimit: MAX_TELO,
      // Před čtením těla: cizí člověk dostane 401 dřív, než se cokoliv načte.
      onRequest: async (request) => {
        if (!sediToken(request)) throw new HttpError(401, "Chybí nebo nesedí token mostu.");
      },
    },
    async (request) => {
      let snimek: SnimekHry;
      try {
        snimek = prectiSnimek(request.body);
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : "Data ze hry nejdou přečíst.");
      }
      const prijeti = await prijmiSnimek(snimek);
      if (!prijeti) throw new HttpError(404, `Pro GM ${snimek.gm} teď na webu neběží žádný zápas Diplomacie.`);
      return { ok: true, ...prijeti };
    },
  );
}
