import { createHash, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { jeUnikatniKonflikt } from "../db/chyby.js";
import { getAktivniAkce, setNastaveniLobby } from "../db/events.js";
import { getZapas } from "../db/matches.js";
import { HttpError, requireId, requireUser } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { losujRole, zmenCil, zmenRoli } from "../shared/diplomacie/los.js";
import { ROLE_VOLITELNE, type DiploZapas, type Role } from "../shared/diplomacie/typy.js";
import { jePlatneJmenoScenare, type NastaveniLobby } from "../shared/lobbyKontrola.js";
import {
  aktivujVerzi,
  getAktivniVerze,
  getDiploZapas,
  getMinimapuVerze,
  getSouborVerze,
  getVerze,
  listVerzi,
  najdiVerziPodleSha,
  ulozSondu,
  setNastupce,
  setStavDiplo,
  ulozRole,
  ulozVerziScenare,
  upravRoli,
  vratNaPripravu,
} from "./db.js";
import { registerHraRoutes } from "./hra.js";
import { smiNahratScenar } from "./opravneni.js";
import { nastaveniZAktivniVerze } from "./rezim.js";
import { jeHlavickaScenare, type rozeberScenar } from "./rozbor.js";
import { sondaSChybou, type pribalSondu } from "./sonda.js";

export interface DiploDeps {
  rozeberScenar: typeof rozeberScenar;
  pribalSondu: typeof pribalSondu;
}

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
    const nastupce = diplo.nastupceHracId;
    if (nastupce === null) throw new HttpError(409, "Nejdřív vyber Nástupce.");
    // Změna sestavy Nástupce mimo zápas nuluje (poZmeneSestavy); tohle chytá
    // jen souběh, kdy GM klikl dřív, než mu dorazil nový stav.
    if (!hraci.includes(nastupce)) throw new HttpError(409, "Nástupce už v zápase není — vyber ho znovu.");
    const role = chybaPravidla(() => losujRole(hraci, nastupce, randomInt));
    await ulozRole(diplo.zapasId, role, "losovano");
    await broadcastAkce();
    return { ok: true };
  });

  app.put("/api/diplo/zapas/:id/role/:hracId", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav === "priprava") throw new HttpError(409, "Role ještě nejsou vylosované.");
    // Rozeslanou roli hráč vidí a hraje podle ní: měnit ji jde jen celým
    // návratem k výběru Nástupce (uživatel 2. 10. 2026, proti spec §6.2).
    if (diplo.stav === "rozeslano") throw new HttpError(409, "Role jsou rozeslané — změnit je jde jen přes Zpět na výběr Nástupce.");
    const { hracId } = request.params as { hracId: string };
    const telo = (request.body ?? {}) as { role?: unknown; cilHracId?: unknown };
    let role = diplo.role;
    if (telo.role !== undefined) {
      if (!ROLE_VOLITELNE.includes(telo.role as Role)) throw new HttpError(400, "Neznámá role.");
      role = chybaPravidla(() => zmenRoli(role, hracId, telo.role as Role, diplo.nastupceHracId!, randomInt));
    }
    if (telo.cilHracId !== undefined) {
      if (typeof telo.cilHracId !== "string") throw new HttpError(400, "Cíl musí být hráč.");
      role = chybaPravidla(() => zmenCil(role, hracId, telo.cilHracId as string, diplo.nastupceHracId!));
    }
    const nova = role.find((r) => r.hracId === hracId);
    if (!nova) throw new HttpError(404, "Takový hráč v zápase není.");
    await upravRoli(diplo.zapasId, nova);
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
  registerHraRoutes(app);
}

/** Scénář má přes 100 kB; 5 MB nechává rezervu, ale nepustí libovolný balast (spec §5.2). */
const MAX_VELIKOST = 5 * 1024 * 1024;
/** Poznámka k verzi je jedna věta do seznamu; hlavička bez stropu by šla do paměti i databáze celá. */
const MAX_DELKA_POZNAMKY = 500;

async function requireAutorScenare(request: FastifyRequest): Promise<string> {
  const hracId = await requireUser(request);
  if (!(await smiNahratScenar(hracId))) throw new HttpError(403, "Scénář smí nahrávat jen admin nebo autor scénáře.");
  return hracId;
}

/** Hlavička s textem (jméno, poznámka) chodí URL-kódovaná kvůli diakritice. */
function hlavicka(request: FastifyRequest, jmeno: string): string | null {
  const h = request.headers[jmeno];
  if (typeof h !== "string" || h === "") return null;
  try {
    return decodeURIComponent(h);
  } catch {
    throw new HttpError(400, `Hlavička ${jmeno} není platně zakódovaná.`);
  }
}

/** Běžící akce Diplomacie hlídá v lobby vždy aktivní verzi (spec §5.5). */
async function promitniDoAkce(): Promise<void> {
  const akce = await getAktivniAkce();
  if (!akce || akce.rezim !== "diplomacie") return;
  await setNastaveniLobby(akce.id, { ...(akce.nastaveniLobby as Partial<NastaveniLobby>), ...(await nastaveniZAktivniVerze()) });
}

const duplicita = (id: number) => new HttpError(409, `Tahle verze už je nahraná (č. ${id}).`);

function posliSoubor(reply: FastifyReply, soubor: { jmenoSouboru: string; data: Buffer }): FastifyReply {
  return reply
    .header("content-type", "application/octet-stream")
    // Pod touž adresou může být zítra jiný obsah (sonda přibalená dodatečně).
    .header("cache-control", "no-store")
    .header("content-disposition", `attachment; filename*=UTF-8''${encodeURIComponent(soubor.jmenoSouboru)}`)
    .send(soubor.data);
}

/** Routy verzí scénáře (spec §5.3). Čtení a stažení jsou veřejné — scénář je se souhlasem autora. */
function registerScenarRoutes(app: FastifyInstance, deps: DiploDeps): void {
  app.get("/api/diplo/scenar", async () => ({ verze: await listVerzi() }));

  // Soubor chodí jako syrové tělo, ne multipart — žádná nová závislost (spec
  // §5.2 bod 1). Parser je zapouzdřený v tomhle kontextu: jinak by 5 MB
  // binárního těla přijala od kohokoliv každá routa serveru. A `onRequest`
  // běží před čtením těla, takže cizí člověk dostane 401/403 dřív, než se
  // cokoliv načte do paměti.
  app.register(async (sub) => {
    sub.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: MAX_VELIKOST }, (_req, telo, hotovo) => hotovo(null, telo));

    sub.post(
      "/api/diplo/scenar",
      {
        bodyLimit: MAX_VELIKOST,
        onRequest: async (request) => {
          await requireAutorScenare(request);
        },
      },
      async (request) => {
        // Právo ověřil háček výš; tady stačí vědět, kdo nahrává.
        const hracId = await requireUser(request);
        const jmeno = hlavicka(request, "x-jmeno-souboru");
        if (jmeno === null || !jePlatneJmenoScenare(jmeno)) throw new HttpError(400, "Soubor musí být .aoe2scenario a jméno bez cesty (nejvýš 100 znaků).");
        // Poznámka se čte před rozborem: ať se nečeká sekundy na odmítnutí.
        const poznamka = hlavicka(request, "x-poznamka");
        if (poznamka !== null && poznamka.length > MAX_DELKA_POZNAMKY) throw new HttpError(400, `Poznámka má nejvýš ${MAX_DELKA_POZNAMKY} znaků.`);
        const data = request.body;
        if (!Buffer.isBuffer(data) || !jeHlavickaScenare(data)) throw new HttpError(400, "Tohle není scénář AoE2 DE.");
        const sha256 = createHash("sha256").update(data).digest("hex");
        const existujici = await najdiVerziPodleSha(sha256);
        if (existujici !== null) throw duplicita(existujici);
        // Rozbor a přibalení sondy jsou dva nezávislé kroky Pythonu nad
        // týmž souborem; souběžně, ať nahrání netrvá dvakrát déle.
        const [vysledek, sonda] = await Promise.all([deps.rozeberScenar(data), deps.pribalSondu(data)]);
        let ulozeno: { id: number; aktivovana: boolean };
        try {
          ulozeno = await ulozVerziScenare({
            jmenoSouboru: jmeno,
            sha256,
            data,
            rozbor: vysledek.ok ? vysledek.rozbor : null,
            chybaRozboru: vysledek.ok ? null : vysledek.chyba,
            minimapa: vysledek.ok ? vysledek.minimapa : null,
            nahralHracId: hracId,
            poznamka,
            // Bez sondy se verze hraje jako dřív, jen bez dat ze hry — důvod
            // se uloží a správa nabídne „Přibalit sondu“ znovu.
            sonda: sonda.ok ? sonda.sonda : sondaSChybou(sonda.chyba),
            dataSonda: sonda.ok ? sonda.soubor : null,
          });
        } catch (e) {
          if (!jeUnikatniKonflikt(e)) throw e;
          // Rozbor trvá sekundy, takže se mezitím mohl stihnout jiný upload:
          // buď týž soubor (unikátní sha256), nebo úplně první verze — obě
          // transakce viděly prázdnou tabulku a obě se chtěly aktivovat
          // (index diplo_scenar_jeden_aktivni). Ani jedno není chyba serveru.
          const mezitim = await najdiVerziPodleSha(sha256);
          if (mezitim !== null) throw duplicita(mezitim);
          throw new HttpError(409, "Někdo právě nahrál první verzi — zkus to znovu.");
        }
        if (ulozeno.aktivovana) await promitniDoAkce();
        await broadcastAkce();
        return { id: ulozeno.id, aktivni: ulozeno.aktivovana, chybaRozboru: vysledek.ok ? null : vysledek.chyba, chybaSondy: sonda.ok ? null : sonda.chyba };
      },
    );
  });

  app.post("/api/diplo/scenar/:id/aktivni", async (request) => {
    await requireAutorScenare(request);
    const verze = await getVerze(requireId(request));
    if (!verze) throw new HttpError(404, "Taková verze není.");
    if (verze.rozbor === null) throw new HttpError(409, "Verze bez rozboru se nedá aktivovat.");
    try {
      await aktivujVerzi(verze.id);
    } catch (e) {
      // Dva autoři klikli v téže vteřině na dvě různé verze: druhá transakce
      // narazí na index jediné aktivní verze. Je to souběh, ne chyba serveru.
      if (!jeUnikatniKonflikt(e)) throw e;
      throw new HttpError(409, "Někdo právě aktivoval jinou verzi — načti seznam znovu.");
    }
    await promitniDoAkce();
    await broadcastAkce();
    return { ok: true };
  });

  // Sonda pro verzi nahranou dřív (nebo po neúspěchu znovu). Selhání není
  // chyba serveru: uloží se s důvodem a správa ho ukáže.
  app.post("/api/diplo/scenar/:id/sonda", async (request) => {
    await requireAutorScenare(request);
    const id = requireId(request);
    const original = await getSouborVerze(id, true);
    if (!original) throw new HttpError(404, "Taková verze není.");
    const vysledek = await deps.pribalSondu(original.data);
    const sonda = vysledek.ok ? vysledek.sonda : sondaSChybou(vysledek.chyba);
    await ulozSondu(id, sonda, vysledek.ok ? vysledek.soubor : null);
    await broadcastAkce();
    return { ok: true, sonda };
  });

  // Ke stažení jde kopie se sondou (když ji verze má); originál od autora
  // jen jemu a adminovi přes ?original=1 — je to záloha, ne soubor do hry.
  const chceOriginal = async (request: FastifyRequest): Promise<boolean> => {
    if ((request.query as { original?: unknown }).original !== "1") return false;
    await requireAutorScenare(request);
    return true;
  };

  // Statický segment má u Fastify přednost před `:id`, takže „aktivni“ se nikdy nečte jako číslo.
  app.get("/api/diplo/scenar/aktivni/soubor", async (request, reply) => {
    const original = await chceOriginal(request);
    const aktivni = await getAktivniVerze();
    const soubor = aktivni ? await getSouborVerze(aktivni.id, original) : null;
    if (!soubor) throw new HttpError(404, "Scénář zatím nikdo nenahrál.");
    return posliSoubor(reply, soubor);
  });

  app.get("/api/diplo/scenar/:id/soubor", async (request, reply) => {
    const soubor = await getSouborVerze(requireId(request), await chceOriginal(request));
    if (!soubor) throw new HttpError(404, "Taková verze není.");
    return posliSoubor(reply, soubor);
  });

  app.get("/api/diplo/scenar/:id/minimapa.webp", async (request, reply) => {
    const mapa = await getMinimapuVerze(requireId(request));
    if (!mapa) throw new HttpError(404, "Tahle verze minimapu nemá.");
    // Obsah verze se nikdy nemění — prohlížeč si ji smí pamatovat napořád.
    return reply.header("content-type", "image/webp").header("cache-control", "public, max-age=31536000, immutable").send(mapa);
  });
}
