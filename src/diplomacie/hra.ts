import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { getZapas } from "../db/matches.js";
import { HttpError } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import {
  divakUstupuje,
  NOVA_HRA_POKLES_S,
  posunKandidata,
  prectiSnimek,
  procBezZapasu,
  stejnyScenar,
  vyberZapasSnimku,
  vyhodnotHru,
  type HraZapasu,
  type SnimekHry,
  type ZdrojHry,
} from "../shared/diplomacie/hra.js";
import { udalostiHry } from "../shared/diplomacie/schopnosti.js";
import { beziciZapasyDiplo, getDiploZapas, getSonduVerze, nastavNastupceZeHry, odvolejNastupceZeHry, povysSaska, pridejPripominky } from "./db.js";
import { pametHer } from "./hraPamet.js";

/**
 * Příjem dat z běžící hry (most ke hře, první kus podprojektu 2). Sonda
 * přibalená do scénáře píše soubor na každém počítači ve hře (hráči
 * i diváci); most na PC GM nebo diváka ho čte a posílá snímky na
 * `POST /api/diplo/hra`. Web z nich pozná Nástupce císaře (hráč, kterému
 * hra nedala sekundární cíl) a v přípravě ho nastaví sám.
 *
 * Poslední snímek každého zápasu žije jen v paměti (hraPamet.ts). Do stavu
 * pro prohlížeče ho přidává `doplnStav` módu, ostatním než GM ho maže
 * `redigujDiplo`. Koho hra určila naposledy, drží databáze
 * (`diplo_zapas.nastupce_ze_hry`) — přežije to restart serveru.
 */

/**
 * Stav všem prohlížečům se staví z databáze, tak se průběžné změny
 * rozesílají nejvýš takhle často (změna Nástupce hned). Sonda píše každou
 * herní sekundu a most posílá nejvýš jednou za 1 s; původních 5 s pult
 * zdržovalo — uživatel 3. 10. 2026 chtěl aktualizaci po 1 s. 0,8 s propustí
 * každý snímek mostu a jen odfiltruje dvojí doručení (WS + HTTP záloha,
 * GM + divák).
 */
const ROZESTUP_ROZESLANI_MS = 800;

export interface PrijetiSnimku {
  zapasId: number;
  /** Nástupce podle hry, potvrzený dvěma snímky; null = zatím neurčen. */
  nastupce: string | null;
  /** Odkud web snímek vzal: od GM zápasu, nebo od diváka. */
  zdroj: ZdrojHry;
  /** False = snímek diváka se nepoužil, data posílá GM (odpověď nese poslední stav od něj). */
  pouzito?: false;
  /** Česká věta pro obsluhu mostu, když něco nesedí, ale data se vzala. */
  varovani?: string;
}

const odpovedMostu = (zapasId: number, zdroj: ZdrojHry, hra: HraZapasu): PrijetiSnimku => ({
  zapasId,
  nastupce: hra.nastupceHracId,
  zdroj,
  ...(hra.varovani ? { varovani: hra.varovani } : {}),
});

/**
 * Zpracuje jeden snímek: najde zápas (podle GM, nebo jako snímek diváka —
 * `vyberZapasSnimku`), odvodí stav hráčů a v přípravě nastaví (nebo odvolá)
 * Nástupce. `{ nenalezeno }` = snímek nejde přiřadit, česká věta pro 404.
 */
export async function prijmiSnimek(snimek: SnimekHry, ted: Date = new Date()): Promise<PrijetiSnimku | { nenalezeno: string }> {
  // Složka profilu hry se jmenuje Steam ID nebo XUID; web vede hráče
  // z Microsoft účtu s předponou `xbox:`.
  const bezici = await beziciZapasyDiplo();
  const vyber = vyberZapasSnimku(bezici, [snimek.odesilatel, `xbox:${snimek.odesilatel}`], snimek.scenar);
  if (!vyber) return { nenalezeno: procBezZapasu(bezici, snimek.odesilatel, snimek.scenar) };
  const { zapasId, zdroj } = vyber;
  const diplo = await getDiploZapas(zapasId);
  const zaznam = await getZapas(zapasId);
  if (!diplo || !zaznam) return { nenalezeno: procBezZapasu([], snimek.odesilatel, snimek.scenar) };

  const predchozi = pametHer.get(zapasId);
  // GM vidí hru bez zpoždění pro diváky: dokud posílá on, divák jen čeká.
  if (predchozi && divakUstupuje(zdroj, predchozi.posledniOdGmMs, ted.getTime())) return { ...odpovedMostu(zapasId, zdroj, predchozi.hra), pouzito: false };

  let kandidatDosud = predchozi?.kandidat ?? null;
  if (predchozi && (predchozi.hra.zdroj ?? "gm") !== zdroj) {
    // GM a divák se liší o zpoždění pro diváky: herní časy dvou zdrojů nejdou
    // porovnat (starší čas diváka není přeházené doručení ani nová hra)
    // a odpověď hry se po přepnutí potvrzuje znovu.
    kandidatDosud = null;
  } else if (predchozi && snimek.cas < predchozi.hra.cas) {
    // Herní čas couvl. O málo = snímek dorazil přeházeně a novější už tu
    // je, tak se zahodí; o hodně = nová hra a kandidát se sbírá znovu.
    if (predchozi.hra.cas - snimek.cas <= NOVA_HRA_POKLES_S) return odpovedMostu(zapasId, zdroj, predchozi.hra);
    kandidatDosud = null;
  }

  const hraci = zaznam.ucastnici.filter((u) => u.hracId !== diplo.gmHracId).map((u) => ({ hracId: u.hracId, barva: u.barva }));
  const verze = diplo.scenarId === null ? null : await getSonduVerze(diplo.scenarId);
  const odpoved = vyhodnotHru(snimek, hraci, verze?.sonda?.cile ?? [], ted.toISOString());
  // Cíle se rozdávají postupně: odpovědi hry se věří až napodruhé.
  const { kandidat, potvrzeny } = posunKandidata(kandidatDosud, odpoved.nastupceHracId, snimek.cas);

  // Data z jiného scénáře, než zápas hraje (starý soubor sondy, jiná hra
  // téhož GM), se v pultu ukážou s varováním, ale Nástupce podle nich ne.
  const jinyScenar = verze !== null && !stejnyScenar(verze.jmenoHry, snimek.scenar);
  const varovani = jinyScenar
    ? `Hra hlásí scénář „${snimek.scenar}“, zápas ale hraje „${verze.jmenoHry}“ — Nástupce se podle ní nenastavuje.`
    : verze && (verze.sonda === null || verze.sonda.chyba !== null)
      ? "Verze scénáře v zápase nemá u webu výpis cílů — postup cílů se neukáže."
      : undefined;
  const hra: HraZapasu = { ...odpoved, zdroj, nastupceHracId: potvrzeny, ...(varovani ? { varovani } : {}) };

  // Oba zápisy jsou podmíněné v jednom příkazu (stav `priprava`, poslední
  // odpověď hry) — souběžný los GM ani jeho ruční volbu nepřepíšou; tady
  // se jen šetří dotazy, které by určitě nic nezměnily.
  let zmenaStavu = false;
  if (diplo.stav === "priprava" && !jinyScenar) {
    if (potvrzeny !== null) zmenaStavu = await nastavNastupceZeHry(zapasId, potvrzeny);
    else if (odpoved.nastupceHracId === null && diplo.nastupceHracId !== null) zmenaStavu = await odvolejNastupceZeHry(zapasId);
  }
  // Po rozeslání: pád Gardy promění Šaška v Gardu, za každého padlého
  // připomínky GM (Katovi zlato, Gardě role padlého) — uživatel 3. 10. 2026.
  if (diplo.stav === "rozeslano" && !jinyScenar && odpoved.hraci.some((h) => h.zije === false)) {
    const { povysit, pripominky } = udalostiHry(diplo.role, odpoved.hraci);
    if (povysit !== null && (await povysSaska(zapasId, povysit))) zmenaStavu = true;
    if (await pridejPripominky(zapasId, pripominky)) zmenaStavu = true;
  }

  const rozeslat = zmenaStavu || !predchozi || ted.getTime() - predchozi.rozeslanoMs >= ROZESTUP_ROZESLANI_MS;
  pametHer.set(zapasId, {
    hra,
    kandidat,
    rozeslanoMs: rozeslat || !predchozi ? ted.getTime() : predchozi.rozeslanoMs,
    posledniOdGmMs: zdroj === "gm" ? ted.getTime() : (predchozi?.posledniOdGmMs ?? null),
  });
  if (rozeslat) await broadcastAkce();
  return odpovedMostu(zapasId, zdroj, hra);
}

/** Těla od mostu mají kolem 3 kB; 64 kB je strop proti balastu. */
const MAX_TELO = 64 * 1024;

/**
 * Sedí předložené tajemství? Porovnání otisků: `timingSafeEqual` chce stejně
 * dlouhé vstupy a délka tajemství se nemá prozradit. Prázdné nesedí nikdy.
 * Sdílí most (token v hlavičce) i overlay OBS (klíč v adrese).
 */
export function sediTajemstvi(predlozene: string, spravne: string): boolean {
  if (spravne === "") return false;
  const otisk = (t: string) => createHash("sha256").update(t).digest();
  return timingSafeEqual(otisk(predlozene), otisk(spravne));
}

function sediToken(request: FastifyRequest): boolean {
  const hlavicka = request.headers.authorization;
  const predlozeny = typeof hlavicka === "string" && hlavicka.startsWith("Bearer ") ? hlavicka.slice("Bearer ".length) : "";
  return sediTajemstvi(predlozeny, config.mostToken);
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
      if ("nenalezeno" in prijeti) throw new HttpError(404, prijeti.nenalezeno);
      return { ok: true, ...prijeti };
    },
  );
}
