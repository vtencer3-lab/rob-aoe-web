import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getZapas } from "../db/matches.js";
import { HttpError } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { NOVA_HRA_POKLES_S, posunKandidata, prectiSnimek, vyhodnotHru, type HraZapasu, type SnimekHry } from "../shared/diplomacie/hra.js";
import { getDiploZapas, getSonduVerze, najdiBeziciZapasGm, nastavNastupceZeHry, odvolejNastupceZeHry } from "./db.js";
import { pametHer } from "./hraPamet.js";

/**
 * Příjem dat z běžící hry (most ke hře, první kus podprojektu 2). Skript na
 * PC GM čte soubor XS sondy a posílá snímky na `POST /api/diplo/hra`; web
 * z nich pozná Nástupce císaře (hráč, kterému hra nedala sekundární cíl)
 * a v přípravě ho nastaví sám.
 *
 * Poslední snímek každého zápasu žije jen v paměti (hraPamet.ts). Do stavu
 * pro prohlížeče ho přidává `doplnStav` módu, ostatním než GM ho maže
 * `redigujDiplo`. Koho hra určila naposledy, drží databáze
 * (`diplo_zapas.nastupce_ze_hry`) — přežije to restart serveru.
 */

/**
 * Stav všem prohlížečům se staví z databáze; při boji se počitadla mění
 * každé 2 s, tak se průběžné změny rozesílají nejvýš takhle často (změna
 * Nástupce hned). Tep mostu (15 s) doručí poslední hodnoty i po klidu.
 */
const ROZESTUP_ROZESLANI_MS = 5_000;

export interface PrijetiSnimku {
  zapasId: number;
  /** Nástupce podle hry, potvrzený dvěma snímky; null = zatím neurčen. */
  nastupce: string | null;
  /** Česká věta pro obsluhu mostu, když něco nesedí, ale data se vzala. */
  varovani?: string;
}

/** Jméno scénáře bez přípony, malými: sonda ho hlásí podle jména svého souboru. */
const zakladJmena = (jmeno: string) => jmeno.replace(/\.aoe2scenario$/i, "").toLowerCase();

const odpovedMostu = (zapasId: number, hra: HraZapasu): PrijetiSnimku => ({ zapasId, nastupce: hra.nastupceHracId, ...(hra.varovani ? { varovani: hra.varovani } : {}) });

/**
 * Zpracuje jeden snímek: najde zápas podle GM, odvodí stav hráčů a v přípravě
 * nastaví (nebo odvolá) Nástupce. Null = pro tohohle GM žádný zápas neběží.
 */
export async function prijmiSnimek(snimek: SnimekHry, ted: Date = new Date()): Promise<PrijetiSnimku | null> {
  // Složka profilu hry se jmenuje Steam ID nebo XUID; web vede hráče
  // z Microsoft účtu s předponou `xbox:`.
  const zapasId = await najdiBeziciZapasGm([snimek.gm, `xbox:${snimek.gm}`]);
  const diplo = zapasId === null ? null : await getDiploZapas(zapasId);
  const zaznam = zapasId === null ? null : await getZapas(zapasId);
  if (zapasId === null || !diplo || !zaznam) return null;

  const predchozi = pametHer.get(zapasId);
  let kandidatDosud = predchozi?.kandidat ?? null;
  if (predchozi && snimek.cas < predchozi.hra.cas) {
    // Herní čas couvl. O málo = snímek dorazil přeházeně a novější už tu
    // je, tak se zahodí; o hodně = nová hra a kandidát se sbírá znovu.
    if (predchozi.hra.cas - snimek.cas <= NOVA_HRA_POKLES_S) return odpovedMostu(zapasId, predchozi.hra);
    kandidatDosud = null;
  }

  const hraci = zaznam.ucastnici.filter((u) => u.hracId !== diplo.gmHracId).map((u) => ({ hracId: u.hracId, barva: u.barva }));
  const verze = diplo.scenarId === null ? null : await getSonduVerze(diplo.scenarId);
  const odpoved = vyhodnotHru(snimek, hraci, verze?.sonda?.cile ?? [], ted.toISOString());
  // Cíle se rozdávají postupně: odpovědi hry se věří až napodruhé.
  const { kandidat, potvrzeny } = posunKandidata(kandidatDosud, odpoved.nastupceHracId, snimek.cas);

  // Data z jiného scénáře, než zápas hraje (starý soubor sondy, jiná hra
  // téhož GM), se v pultu ukážou s varováním, ale Nástupce podle nich ne.
  const jinyScenar = verze !== null && zakladJmena(verze.jmenoSouboru) !== zakladJmena(snimek.scenar);
  const varovani = jinyScenar
    ? `Hra hlásí scénář „${snimek.scenar}“, zápas ale hraje „${verze.jmenoSouboru}“ — Nástupce se podle ní nenastavuje.`
    : verze && (verze.sonda === null || verze.sonda.chyba !== null)
      ? "Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže."
      : undefined;
  const hra: HraZapasu = { ...odpoved, nastupceHracId: potvrzeny, ...(varovani ? { varovani } : {}) };

  // Oba zápisy jsou podmíněné v jednom příkazu (stav `priprava`, poslední
  // odpověď hry) — souběžný los GM ani jeho ruční volbu nepřepíšou; tady
  // se jen šetří dotazy, které by určitě nic nezměnily.
  let zmenaNastupce = false;
  if (diplo.stav === "priprava" && !jinyScenar) {
    if (potvrzeny !== null) zmenaNastupce = await nastavNastupceZeHry(zapasId, potvrzeny);
    else if (odpoved.nastupceHracId === null && diplo.nastupceHracId !== null) zmenaNastupce = await odvolejNastupceZeHry(zapasId);
  }

  const rozeslat = zmenaNastupce || !predchozi || ted.getTime() - predchozi.rozeslanoMs >= ROZESTUP_ROZESLANI_MS;
  pametHer.set(zapasId, { hra, kandidat, rozeslanoMs: rozeslat || !predchozi ? ted.getTime() : predchozi.rozeslanoMs });
  if (rozeslat) await broadcastAkce();
  return odpovedMostu(zapasId, hra);
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
