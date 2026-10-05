import { createHash, randomInt } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { jeUnikatniKonflikt } from "../db/chyby.js";
import { getAktivniAkce, setNastaveniLobby } from "../db/events.js";
import { getZapas, setNastaveniZapasu } from "../db/matches.js";
import { HttpError, requireAdmin, requireId, requireUser } from "../http/guards.js";
import { broadcastAkce } from "../realtime/akceStav.js";
import { config } from "../config.js";
import { souhrnSondy, type SondaScenare } from "../shared/diplomacie/hra.js";
import { losujRole, zmenCil, zmenRoli } from "../shared/diplomacie/los.js";
import { DRUHY_ZADOSTI, procNelze, udalostiHry, type DruhZadosti } from "../shared/diplomacie/schopnosti.js";
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
  setMapaZapasu,
  verzeSeZastaralouSondou,
  setNastupce,
  setScenarZapasu,
  setStavDiplo,
  smazVerzi,
  ulozRole,
  ulozVerziScenare,
  prevezmiMinimapuZ,
  pridejSchopnost,
  povysSaska,
  promenaVidena,
  upravRoli,
  vyridSchopnost,
  vratNaPripravu,
} from "./db.js";
import { registerHraRoutes } from "./hra.js";
import { PING_TRVA_MS, pridejPing } from "./pingy.js";
import { registerObsRoutes } from "./obs.js";
import { registerMostKlicRoutes } from "./mostKlic.js";
import { jeGm, smiNahratScenar } from "./opravneni.js";
import { nastaveniScenare, nastaveniZAktivniVerze } from "./rezim.js";
import { jeHlavickaScenare, type rozeberScenar } from "./rozbor.js";
import { revizeSondy, sondaSChybou, type pribalSondu } from "./sonda.js";

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
  if (!jeGm(diplo, hracId)) throw new HttpError(403, "Tohle smí jen GM tohoto zápasu.");
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

  // Přepínače pod mapou pultu: krále a relikvie z běžící hry ukázat, nebo ne
  // (platí i pro overlaye do OBS). Smí jen GM zápasu, v každém stavu.
  // Na které verzi scénáře zápas pojede (uživatel 5. 10. 2026): admin ji
  // vybere v úpravě zápasu z rozebraných verzí. Jen v přípravě — po rozdání
  // rolí už web počítá pravidla k otisknuté verzi. S verzí se přepíše
  // i nastavení lobby zápasu, ať kontrola lobby hlídá tu správnou.
  app.post("/api/diplo/zapas/:id/scenar", async (request) => {
    await requireAdmin(request);
    const zapasId = requireId(request);
    const diplo = await getDiploZapas(zapasId);
    if (!diplo) throw new HttpError(404, "Tohle není zápas Diplomacie.");
    if (diplo.stav !== "priprava") throw new HttpError(409, "Role už jsou rozdané — verzi scénáře jde změnit jen v přípravě.");
    const scenarId = (request.body as { scenarId?: unknown } | null)?.scenarId;
    const verze = typeof scenarId === "number" ? await getVerze(scenarId) : null;
    if (!verze) throw new HttpError(404, "Taková verze není.");
    if (verze.rozbor === null) throw new HttpError(409, "Verze bez rozboru se hrát nedá.");
    const zaznam = await getZapas(zapasId);
    if (!zaznam || zaznam.zapas.stav === "zruseny") throw new HttpError(409, "Zrušený zápas se neupravuje.");
    const scenar = nastaveniScenare(verze, await listVerzi());
    await setScenarZapasu(zapasId, verze.id);
    // Zápas bez vlastního nastavení se řídí nastavením akce (kontrolaLobby.ts) — z něj se vyjde.
    const zaklad = Object.keys(zaznam.zapas.nastaveni).length > 0 ? zaznam.zapas.nastaveni : ((await getAktivniAkce())?.nastaveniLobby ?? {});
    await setNastaveniZapasu(zapasId, { ...(zaklad as Record<string, unknown>), ...scenar });
    await broadcastAkce();
    return { ok: true, nastaveni: scenar };
  });

  app.post("/api/diplo/zapas/:id/mapa", async (request) => {
    const { diplo } = await requireGm(request);
    const telo = (request.body ?? {}) as { kralove?: unknown; relikvie?: unknown };
    const ano = (v: unknown, kde: string): boolean | undefined => {
      if (v === undefined) return undefined;
      if (typeof v !== "boolean") throw new HttpError(400, `${kde} musí být ano/ne.`);
      return v;
    };
    const kralove = ano(telo.kralove, "kralove");
    const relikvie = ano(telo.relikvie, "relikvie");
    await setMapaZapasu(diplo.zapasId, { ...(kralove === undefined ? {} : { kralove }), ...(relikvie === undefined ? {} : { relikvie }) });
    await broadcastAkce();
    return { ok: true };
  });

  // Ping na mapě (uživatel 3. 10. 2026): GM klikne do mapy pultu, hráčům
  // (všem, nebo jednomu) se na mapě karty na chvíli ukáže značka. Po
  // PING_TRVA_MS se rozešle stav znovu, ať značka zmizí i bez dalšího dění.
  app.post("/api/diplo/zapas/:id/ping", async (request) => {
    const { diplo, hraci } = await requireGm(request);
    const { x, y, komu } = (request.body ?? {}) as { x?: unknown; y?: unknown; komu?: unknown };
    const mistoNaMape = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
    if (!mistoNaMape(x) || !mistoNaMape(y)) throw new HttpError(400, "Ping musí být na mapě (x a y od 0 do 1).");
    // komu: seznam hráčů zápasu (víc najednou, uživatel 3. 10. 2026); null nebo prázdný = všem.
    if (komu !== null && komu !== undefined && (!Array.isArray(komu) || komu.length > 8 || komu.some((h) => typeof h !== "string" || !hraci.includes(h))))
      throw new HttpError(400, "Ping jde všem, nebo hráčům zápasu.");
    const adresati = Array.isArray(komu) && komu.length > 0 ? [...new Set(komu as string[])] : null;
    pridejPing(diplo.zapasId, x as number, y as number, adresati);
    await broadcastAkce();
    setTimeout(() => void broadcastAkce().catch(() => {}), PING_TRVA_MS + 200).unref?.();
    return { ok: true };
  });

  // Schopnosti rolí (uživatel 3. 10. 2026): hráč žádá z karty, GM v pultu
  // potvrdí nebo zamítne. Pravidla (kdo, kolikrát, na koho) v schopnosti.ts.
  app.post("/api/diplo/zapas/:id/schopnost", async (request) => {
    const hracId = await requireUser(request);
    const zapasId = requireId(request);
    const diplo = await getDiploZapas(zapasId);
    if (!diplo) throw new HttpError(404, "Tohle není zápas Diplomacie.");
    const { druh, cilHracId } = (request.body ?? {}) as { druh?: unknown; cilHracId?: unknown };
    if (typeof druh !== "string" || !(DRUHY_ZADOSTI as readonly string[]).includes(druh)) throw new HttpError(400, "Neznámá schopnost.");
    if (cilHracId !== undefined && cilHracId !== null && typeof cilHracId !== "string") throw new HttpError(400, "Cíl je hráč zápasu.");
    const zaznam = await getZapas(zapasId);
    const hraci = (zaznam?.ucastnici ?? []).filter((u) => u.hracId !== diplo.gmHracId).map((u) => u.hracId);
    const cil = typeof cilHracId === "string" ? cilHracId : null;
    const chyba = procNelze(diplo, diplo.schopnosti ?? [], hraci, hracId, druh as DruhZadosti, cil);
    if (chyba) throw new HttpError(409, chyba);
    await pridejSchopnost(zapasId, hracId, druh as DruhZadosti, cil);
    await broadcastAkce();
    return { ok: true };
  });

  app.post("/api/diplo/zapas/:id/schopnost/:sid", async (request) => {
    const { diplo } = await requireGm(request);
    const sid = Number((request.params as { sid: string }).sid);
    if (!Number.isInteger(sid) || sid <= 0 || sid > 2147483647) throw new HttpError(400, "Neplatné číslo žádosti.");
    const { stav } = (request.body ?? {}) as { stav?: unknown };
    if (stav !== "potvrzeno" && stav !== "zamitnuto") throw new HttpError(400, "Žádost jde potvrdit, nebo zamítnout.");
    if (!(await vyridSchopnost(diplo.zapasId, sid, stav))) throw new HttpError(409, "Tahle žádost už vyřízená je.");
    await broadcastAkce();
    return { ok: true };
  });

  // Garda padla, ale most nejede (nebo hra nic neposlala): GM proměnu Šaška
  // spustí ručně. Stejná pravidla jako z dat hry.
  app.post("/api/diplo/zapas/:id/garda-padla", async (request) => {
    const { diplo } = await requireGm(request);
    if (diplo.stav !== "rozeslano") throw new HttpError(409, "Role ještě nejsou rozeslané.");
    const garda = diplo.role.find((r) => r.role === "garda" && !r.puvodniRole);
    const { povysit } = udalostiHry(diplo.role, garda ? [{ hracId: garda.hracId, zije: false }] : []);
    if (povysit === null || !(await povysSaska(diplo.zapasId, povysit))) throw new HttpError(409, "Šašek, který by se stal Gardou, není (padl, nebo už Gardou je).");
    await broadcastAkce();
    return { ok: true };
  });

  // Hráč klikl na kartě na „Královská garda padla“ — karta Šaška shoří.
  app.post("/api/diplo/zapas/:id/promena", async (request) => {
    const hracId = await requireUser(request);
    if (await promenaVidena(requireId(request), hracId)) await broadcastAkce();
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
  registerObsRoutes(app);
  registerMostKlicRoutes(app);
}

/** Scénář má přes 100 kB; 5 MB nechává rezervu, ale nepustí libovolný balast (spec §5.2). */
const MAX_VELIKOST = 5 * 1024 * 1024;
/** Poznámka k verzi je jedna věta do seznamu; hlavička bez stropu by šla do paměti i databáze celá. */
const MAX_DELKA_POZNAMKY = 500;

async function requireAutorScenare(request: FastifyRequest): Promise<string> {
  const hracId = await requireUser(request);
  if (!(await smiNahratScenar(hracId))) throw new HttpError(403, "Scénář smí nahrávat jen admin, autor scénáře nebo GM běžícího zápasu Diplomacie.");
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
/**
 * Přibalí do verze sondu z aktuálního `sonda.xs` a uloží ji (i s chybou, když
 * přibalení selže). Jediné místo pro tlačítko ve správě, start serveru
 * i stažení. Null = taková verze není.
 */
async function prebalSondu(id: number, deps: DiploDeps): Promise<SondaScenare | null> {
  const original = await getSouborVerze(id, true);
  if (!original) return null;
  const vysledek = await deps.pribalSondu(original.data);
  const sonda = vysledek.ok ? vysledek.sonda : sondaSChybou(vysledek.chyba);
  await ulozSondu(id, sonda, vysledek.ok ? vysledek.soubor : null);
  return sonda;
}

/** Přebalí všechny verze se zastaralou sondou, jednu po druhé (Python je náročný). */
async function prebalZastaraleSondy(deps: DiploDeps): Promise<void> {
  const revize = revizeSondy();
  if (revize === null) return;
  const ids = await verzeSeZastaralouSondou(revize);
  for (const id of ids) await prebalSondu(id, deps);
  if (ids.length > 0) await broadcastAkce();
}

/** Před stažením: má-li verze zastaralou sondu, přebalí ji hned. */
async function zajistiAktualniSondu(id: number, deps: DiploDeps): Promise<void> {
  const revize = revizeSondy();
  if (revize === null || !(await verzeSeZastaralouSondou(revize)).includes(id)) return;
  await prebalSondu(id, deps);
  await broadcastAkce();
}

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
        // Formulář ji od 2. 10. 2026 neposílá (pole „Co je nového“ zmizelo);
        // hlavička zůstává kvůli zpětné kompatibilitě a sloupec poznamka taky.
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
        let ulozeno: Awaited<ReturnType<typeof ulozVerziScenare>>;
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
        return {
          id: ulozeno.id,
          aktivni: ulozeno.aktivovana,
          chybaRozboru: vysledek.ok ? null : vysledek.chyba,
          chybaSondy: sonda.ok ? null : sonda.chyba,
          // Převzetí vlastní minimapy z dřívější verze (null = žádná ji nemá).
          vlastniMinimapa: ulozeno.vlastniMinimapa && { zdrojId: ulozeno.vlastniMinimapa.zdrojId, prevzata: ulozeno.vlastniMinimapa.duvod === null },
        };
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

  // Smazání verze (správa scénáře): aktivní verzi a verzi běžícího zápasu db odmítne
  // s větou, která řekne proč. Nastavení lobby běžící akce se přepočítá —
  // smazaná verze zmizí ze starších jmen kontroly lobby.
  app.delete("/api/diplo/scenar/:id", async (request) => {
    await requireAutorScenare(request);
    const chyba = await smazVerzi(requireId(request));
    if (chyba) throw new HttpError(chyba.kod, chyba.chyba);
    await promitniDoAkce();
    await broadcastAkce();
    return { ok: true };
  });

  // Sonda pro verzi nahranou dřív (nebo po neúspěchu znovu). Selhání není
  // chyba serveru: uloží se s důvodem a správa ho ukáže.
  app.post("/api/diplo/scenar/:id/sonda", async (request) => {
    await requireAutorScenare(request);
    const sonda = await prebalSondu(requireId(request), deps);
    if (!sonda) throw new HttpError(404, "Taková verze není.");
    await broadcastAkce();
    return { ok: true, sonda: souhrnSondy(sonda, revizeSondy()) };
  });

  // Na webu jsou jen hotové verze (uživatel 3. 10. 2026: „natvrdo, aby na
  // webu byly už jen hotové verze sond“): po startu serveru — tedy po každém
  // nasazení se změněnou sondou — se zastaralé sondy přebalí samy na pozadí.
  // Jen na nasazeném webu; testy a vývoj Python s knihovnami mít nemusí.
  if (config.jeProdukce) {
    app.addHook("onReady", async () => {
      void prebalZastaraleSondy(deps).catch((e: unknown) => app.log.error(e, "přebalení zastaralých sond selhalo"));
    });
  }

  // Vlastní minimapa pro verzi, která ji při nahrání nepřevzala (mapa se
  // podle kontroly změnila, nebo vlastní minimapa přibyla až potom).
  app.post("/api/diplo/scenar/:id/minimapa-z/:zdrojId", async (request) => {
    await requireAutorScenare(request);
    const zdrojId = Number((request.params as { zdrojId: string }).zdrojId);
    if (!Number.isInteger(zdrojId) || zdrojId <= 0 || zdrojId > 2147483647) throw new HttpError(400, "Neplatné číslo verze.");
    const chyba = await prevezmiMinimapuZ(requireId(request), zdrojId);
    if (chyba) throw new HttpError(chyba.kod, chyba.chyba);
    await broadcastAkce();
    return { ok: true };
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
    // Pojistka, kdyby přebalení po startu ještě nedoběhlo: stáhne se vždy aktuální sonda.
    if (aktivni && !original) await zajistiAktualniSondu(aktivni.id, deps);
    const soubor = aktivni ? await getSouborVerze(aktivni.id, original) : null;
    if (!soubor) throw new HttpError(404, "Scénář zatím nikdo nenahrál.");
    return posliSoubor(reply, soubor);
  });

  app.get("/api/diplo/scenar/:id/soubor", async (request, reply) => {
    const original = await chceOriginal(request);
    if (!original) await zajistiAktualniSondu(requireId(request), deps);
    const soubor = await getSouborVerze(requireId(request), original);
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
