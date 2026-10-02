import type { PoolClient } from "pg";
import { getPool, withTransaction } from "../db/pool.js";
import { prectiSondu, souhrnSondy, type BeziciZapasDiplo, type SondaScenare } from "../shared/diplomacie/hra.js";
import { procNelzePrevzitMinimapu } from "../shared/diplomacie/minimapa.js";
import { jmenoScenareProHru, prectiRozbor, type RozborScenare } from "../shared/diplomacie/scenar.js";
import { revizeSondy } from "./sonda.js";
import { GM_BARVA } from "../shared/diplomacie/sestava.js";
import type { DiploZapas, Role, RoleHrace, ScenarVerze, StavDiplo } from "../shared/diplomacie/typy.js";

interface VerzeDb {
  id: number;
  jmeno_souboru: string;
  poradi: number;
  nahrano_v: Date;
  nahral_jmeno: string;
  poznamka: string | null;
  aktivni: boolean;
  rozbor: unknown;
  chyba_rozboru: string | null;
  minimapa_otisk: string | null;
  minimapa_vlastni: boolean;
  sonda: unknown;
}

const SLOUPCE_VERZE = `s.id, s.jmeno_souboru, s.poradi, s.nahrano_v, COALESCE(p.alias, p.platforma_jmeno, p.hrac_id) AS nahral_jmeno,
  s.poznamka, s.aktivni, s.rozbor, s.chyba_rozboru, s.minimapa_otisk, s.minimapa_vlastni, s.sonda`;

function mapujVerzi(r: VerzeDb): ScenarVerze {
  return {
    id: r.id,
    jmenoSouboru: r.jmeno_souboru,
    jmenoHry: jmenoScenareProHru(r.poradi),
    nahrano: r.nahrano_v.toISOString(),
    nahralJmeno: r.nahral_jmeno,
    poznamka: r.poznamka,
    aktivni: r.aktivni,
    // Rozbor prošel kontrolou při nahrání; tady se čte znovu, ať starý tvar
    // v databázi po změně typu spadne hned a srozumitelně.
    rozbor: r.rozbor === null ? null : prectiRozbor(r.rozbor),
    chybaRozboru: r.chyba_rozboru,
    minimapaOtisk: r.minimapa_otisk,
    minimapaVlastni: r.minimapa_vlastni,
    sonda: r.sonda === null ? null : souhrnSondy(prectiSondu(r.sonda), revizeSondy()),
  };
}

export async function ulozVerziScenare(v: {
  jmenoSouboru: string;
  sha256: string;
  data: Buffer;
  rozbor: RozborScenare | null;
  chybaRozboru: string | null;
  minimapa: Buffer | null;
  nahralHracId: string;
  poznamka: string | null;
  /** Výsledek přibalení sondy (migrace 033); bez něj verze zůstane jako nahraná dřív. */
  sonda?: SondaScenare | null;
  /** Kopie se sondou — tu host stahuje. */
  dataSonda?: Buffer | null;
}): Promise<{ id: number; aktivovana: boolean; vlastniMinimapa: PrevzetiMinimapy | null }> {
  return withTransaction(async (c) => {
    const { rows: aktivni } = await c.query("SELECT 1 FROM diplo_scenar WHERE aktivni FOR UPDATE");
    // První čitelná verze se aktivuje sama — jinak by nebylo co hrát (spec §5.2 bod 5).
    const aktivovat = aktivni.length === 0 && v.rozbor !== null;
    // Otisk minimapy počítá databáze z téhož obsahu, který ukládá — jde do
    // adresy obrázku (viz migrace 032), bez minimapy zůstane null.
    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO diplo_scenar (jmeno_souboru, sha256, data, rozbor, chyba_rozboru, minimapa, minimapa_otisk, nahral_hrac_id, poznamka, aktivni, sonda, data_sonda)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, left(encode(sha256($6::bytea), 'hex'), 16), $7, $8, $9, $10::jsonb, $11) RETURNING id`,
      [
        v.jmenoSouboru,
        v.sha256,
        v.data,
        v.rozbor === null ? null : JSON.stringify(v.rozbor),
        v.chybaRozboru,
        v.minimapa,
        v.nahralHracId,
        v.poznamka,
        aktivovat,
        v.sonda ? JSON.stringify(v.sonda) : null,
        v.dataSonda ?? null,
      ],
    );
    const id = rows[0]!.id;
    // Vlastní minimapa (obrázek ze hry) platí, „dokud uživatel neřekne
    // jinak“ — nová verze téže mapy ji převezme od poslední verze, která ji
    // má. Ve stejné transakci, ať verze nikdy není vidět s renderem.
    let vlastniMinimapa: PrevzetiMinimapy | null = null;
    if (v.rozbor !== null) {
      const { rows: zdroj } = await c.query<{ id: number; rozbor: unknown }>(
        "SELECT id, rozbor FROM diplo_scenar WHERE minimapa_vlastni AND rozbor IS NOT NULL AND id < $1 ORDER BY id DESC LIMIT 1",
        [id],
      );
      if (zdroj[0]) vlastniMinimapa = await prevezmiMinimapu(c, id, v.rozbor, zdroj[0].id, prectiRozbor(zdroj[0].rozbor));
    }
    return { id, aktivovana: aktivovat, vlastniMinimapa };
  });
}

/** Výsledek pokusu převzít vlastní minimapu: odkud a proč ne (null = převzata). */
export interface PrevzetiMinimapy {
  zdrojId: number;
  duvod: string | null;
}

/**
 * Jediné místo, kde verze přebírá vlastní minimapu jiné verze: obrázek,
 * jeho otisk, příznak a `rozbor.starty` (středy kosočtverců z obrázku —
 * jména mají sedět pod nimi, ne na mediánu jednotek). Jen když jde o tutéž
 * mapu (`procNelzePrevzitMinimapu`), jinak verze zůstane beze změny.
 */
async function prevezmiMinimapu(c: PoolClient, cilId: number, cil: RozborScenare, zdrojId: number, zdroj: RozborScenare): Promise<PrevzetiMinimapy> {
  const duvod = procNelzePrevzitMinimapu(zdroj, cil);
  if (duvod === null) {
    await c.query(
      `UPDATE diplo_scenar n SET minimapa = z.minimapa, minimapa_otisk = z.minimapa_otisk, minimapa_vlastni = true,
         rozbor = jsonb_set(n.rozbor, '{starty}', z.rozbor->'starty')
       FROM diplo_scenar z WHERE n.id = $1 AND z.id = $2`,
      [cilId, zdrojId],
    );
  }
  return { zdrojId, duvod };
}

/**
 * Ruční převzetí vlastní minimapy z verze `zdrojId` (správa scénáře) — pro
 * verzi, která ji při nahrání nedostala. Stejná kontrola mapy jako při
 * nahrání; null = převzato, jinak kód a česká věta pro odpověď.
 */
export async function prevezmiMinimapuZ(cilId: number, zdrojId: number): Promise<{ kod: 404 | 409; chyba: string } | null> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ id: number; rozbor: unknown; minimapa_vlastni: boolean }>(
      "SELECT id, rozbor, minimapa_vlastni FROM diplo_scenar WHERE id = ANY($1::int[]) FOR UPDATE",
      [[cilId, zdrojId]],
    );
    const cil = rows.find((r) => r.id === cilId);
    const zdroj = rows.find((r) => r.id === zdrojId);
    if (!cil || !zdroj) return { kod: 404, chyba: "Taková verze není." };
    if (cilId === zdrojId) return { kod: 409, chyba: "Verze nemůže převzít minimapu sama od sebe." };
    if (!zdroj.minimapa_vlastni || zdroj.rozbor === null) return { kod: 409, chyba: `Verze ${zdrojId} vlastní minimapu nemá.` };
    if (cil.rozbor === null) return { kod: 409, chyba: "Verze bez rozboru minimapu nepřevezme." };
    const { duvod } = await prevezmiMinimapu(c, cilId, prectiRozbor(cil.rozbor), zdrojId, prectiRozbor(zdroj.rozbor));
    return duvod === null ? null : { kod: 409, chyba: `Vlastní minimapu z verze ${zdrojId} nejde převzít — mapa se změnila. ${duvod}` };
  });
}

export async function najdiVerziPodleSha(sha256: string): Promise<number | null> {
  const { rows } = await getPool().query<{ id: number }>("SELECT id FROM diplo_scenar WHERE sha256 = $1", [sha256]);
  return rows[0]?.id ?? null;
}

export async function listVerzi(): Promise<ScenarVerze[]> {
  const { rows } = await getPool().query<VerzeDb>(
    `SELECT ${SLOUPCE_VERZE} FROM diplo_scenar s JOIN player p ON p.hrac_id = s.nahral_hrac_id ORDER BY s.id DESC`,
  );
  return rows.map(mapujVerzi);
}

export async function getVerze(id: number): Promise<ScenarVerze | null> {
  const { rows } = await getPool().query<VerzeDb>(`SELECT ${SLOUPCE_VERZE} FROM diplo_scenar s JOIN player p ON p.hrac_id = s.nahral_hrac_id WHERE s.id = $1`, [id]);
  return rows[0] ? mapujVerzi(rows[0]) : null;
}

export async function getAktivniVerze(): Promise<ScenarVerze | null> {
  const { rows } = await getPool().query<VerzeDb>(`SELECT ${SLOUPCE_VERZE} FROM diplo_scenar s JOIN player p ON p.hrac_id = s.nahral_hrac_id WHERE s.aktivni`);
  return rows[0] ? mapujVerzi(rows[0]) : null;
}

export async function aktivujVerzi(id: number): Promise<void> {
  await withTransaction(async (c) => {
    const { rows } = await c.query<{ rozbor: unknown }>("SELECT rozbor FROM diplo_scenar WHERE id = $1 FOR UPDATE", [id]);
    if (!rows[0]) throw new Error(`Verze ${id} neexistuje.`);
    if (rows[0].rozbor === null) throw new Error("Verze bez rozboru se nedá aktivovat.");
    await c.query("UPDATE diplo_scenar SET aktivni = false WHERE aktivni");
    await c.query("UPDATE diplo_scenar SET aktivni = true WHERE id = $1", [id]);
  });
}

/**
 * Soubor verze ke stažení: kopie se sondou, když ji verze má, jinak originál.
 * Pro hru jde vždy pod jménem `jmenoScenareProHru` (i bez sondy) — kontrola
 * lobby porovnává jméno a soubor sondy se podle něj jmenuje. `original`
 * vrátí soubor od autora pod jménem, pod kterým ho nahrál.
 */
export async function getSouborVerze(id: number, original = false): Promise<{ jmenoSouboru: string; data: Buffer } | null> {
  const { rows } = await getPool().query<{ jmeno_souboru: string; poradi: number; data: Buffer }>(
    "SELECT jmeno_souboru, poradi, CASE WHEN $2::boolean THEN data ELSE COALESCE(data_sonda, data) END AS data FROM diplo_scenar WHERE id = $1",
    [id, original],
  );
  const r = rows[0];
  return r ? { jmenoSouboru: original ? r.jmeno_souboru : jmenoScenareProHru(r.poradi), data: r.data } : null;
}

/**
 * Celá sonda verze i s výpisem cílů — pro vyhodnocení snímku hry. Stav pro
 * prohlížeče nese jen souhrn (`ScenarVerze.sonda`).
 */
export async function getSonduVerze(id: number): Promise<{ jmenoHry: string; sonda: SondaScenare | null } | null> {
  const { rows } = await getPool().query<{ poradi: number; sonda: unknown }>("SELECT poradi, sonda FROM diplo_scenar WHERE id = $1", [id]);
  return rows[0] ? { jmenoHry: jmenoScenareProHru(rows[0].poradi), sonda: rows[0].sonda === null ? null : prectiSondu(rows[0].sonda) } : null;
}

/** Výsledek (i neúspěšný) přibalení sondy k verzi; `dataSonda` null = kopie se sondou není. */
export async function ulozSondu(id: number, sonda: SondaScenare, dataSonda: Buffer | null): Promise<void> {
  await getPool().query("UPDATE diplo_scenar SET sonda = $2::jsonb, data_sonda = $3 WHERE id = $1", [id, JSON.stringify(sonda), dataSonda]);
}

/**
 * Smaže verzi scénáře (správa scénáře): null = smazáno, jinak kód a česká
 * věta pro odpověď. Nejde smazat aktivní verzi ani verzi, kterou hraje
 * běžící zápas otevřené akce — host ji má v lobby a pravidla se počítají
 * z ní. Dohrané a zrušené zápasy (a zápasy uzavřených akcí) ji neblokují:
 * uživatel 2. 10. 2026 chtěl uklidit verze ze zkoušek. Jejich otisk se
 * vynuluje a karta i pult pak mapu ani pravidla neukážou (`verzeZapasu`).
 */
export async function smazVerzi(id: number): Promise<{ kod: 404 | 409; chyba: string } | null> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<{ aktivni: boolean; poradi: number }>("SELECT aktivni, poradi FROM diplo_scenar WHERE id = $1 FOR UPDATE", [id]);
    const verze = rows[0];
    if (!verze) return { kod: 404, chyba: "Taková verze není." };
    if (verze.aktivni) return { kod: 409, chyba: "Aktivní verzi nejde smazat — nejdřív nastav jinou jako aktivní." };
    // Stejná definice „běží“ jako beziciZapasyDiplo.
    const { rows: bezici } = await c.query<{ poradi: number }>(
      `SELECT z.poradi
         FROM diplo_zapas d
         JOIN zapas z ON z.id = d.zapas_id
         JOIN akce a ON a.id = z.akce_id
        WHERE d.scenar_id = $1 AND a.stav <> 'konec' AND z.stav = 'bezi'
        ORDER BY z.poradi`,
      [id],
    );
    if (bezici.length > 0) {
      const cisla = bezici.map((z) => `#${z.poradi}`).join(", ");
      const jmeno = jmenoScenareProHru(verze.poradi);
      const [zapas, az] = bezici.length === 1 ? ["zápas", "bude dohraný nebo zrušený"] : ["zápasy", "budou dohrané nebo zrušené"];
      return { kod: 409, chyba: `${jmeno} hraje běžící ${zapas} ${cisla} — smazat ji půjde, až ${az}.` };
    }
    await c.query("UPDATE diplo_zapas SET scenar_id = NULL WHERE scenar_id = $1", [id]);
    await c.query("DELETE FROM diplo_scenar WHERE id = $1", [id]);
    return null;
  });
}

export async function getMinimapuVerze(id: number): Promise<Buffer | null> {
  const { rows } = await getPool().query<{ minimapa: Buffer | null }>("SELECT minimapa FROM diplo_scenar WHERE id = $1", [id]);
  return rows[0]?.minimapa ?? null;
}

// --- zápasy ---

export async function zalozDiploZapas(client: PoolClient, zapasId: number): Promise<void> {
  // Zápas si otiskne aktivní verzi, jako si otiskuje nastavení lobby (spec §4.4).
  await client.query(`INSERT INTO diplo_zapas (zapas_id, scenar_id) VALUES ($1, (SELECT id FROM diplo_scenar WHERE aktivni))`, [zapasId]);
}

interface ZapasDb {
  zapas_id: number;
  gm_hrac_id: string | null;
  stav: StavDiplo;
  nastupce_hrac_id: string | null;
  scenar_id: number | null;
}
interface RoleDb {
  zapas_id: number;
  hrac_id: string;
  role: Role;
  cil_hrac_id: string | null;
}

async function sestav(zapasy: ZapasDb[]): Promise<DiploZapas[]> {
  if (zapasy.length === 0) return [];
  const { rows: role } = await getPool().query<RoleDb>(
    `SELECT r.zapas_id, r.hrac_id, r.role, r.cil_hrac_id
       FROM diplo_role r JOIN ucastnik u ON u.zapas_id = r.zapas_id AND u.hrac_id = r.hrac_id
      WHERE r.zapas_id = ANY($1::int[]) ORDER BY r.zapas_id, u.poradi`,
    [zapasy.map((z) => z.zapas_id)],
  );
  return zapasy.map((z) => ({
    zapasId: z.zapas_id,
    // Bez hráče na šedé (nemělo by nastat — sestava Diplomacie ho vynucuje)
    // nesmí pult dostat nikdo, proto prázdný řetězec, ne null.
    gmHracId: z.gm_hrac_id ?? "",
    stav: z.stav,
    nastupceHracId: z.nastupce_hrac_id,
    scenarId: z.scenar_id,
    role: role
      .filter((r) => r.zapas_id === z.zapas_id)
      .map((r) => ({ hracId: r.hrac_id, role: r.role, cilHracId: r.cil_hrac_id })),
  }));
}

// GM = účastník na šedé (GM_BARVA); neukládá se, viz migrace 031.
const SLOUPCE_ZAPASU = `d.zapas_id, d.stav, d.nastupce_hrac_id, d.scenar_id,
  (SELECT u.hrac_id FROM ucastnik u WHERE u.zapas_id = d.zapas_id AND u.barva = ${GM_BARVA} LIMIT 1) AS gm_hrac_id`;

export async function listDiploZapasy(akceId: number): Promise<DiploZapas[]> {
  const { rows } = await getPool().query<ZapasDb>(
    `SELECT ${SLOUPCE_ZAPASU} FROM diplo_zapas d JOIN zapas z ON z.id = d.zapas_id WHERE z.akce_id = $1 ORDER BY z.poradi`,
    [akceId],
  );
  return sestav(rows);
}

export async function getDiploZapas(zapasId: number): Promise<DiploZapas | null> {
  const { rows } = await getPool().query<ZapasDb>(`SELECT ${SLOUPCE_ZAPASU} FROM diplo_zapas d WHERE d.zapas_id = $1`, [zapasId]);
  return (await sestav(rows))[0] ?? null;
}

/**
 * Běžící zápasy Diplomacie otevřené akce od nejnověji založeného, s GM (kdo
 * sedí na šedé) a jménem otištěné verze scénáře. Pro most ke hře, který zná
 * jen odesílatele a scénář — ne číslo zápasu (výběr: `vyberZapasSnimku`).
 */
export async function beziciZapasyDiplo(): Promise<BeziciZapasDiplo[]> {
  const { rows } = await getPool().query<{ zapas_id: number; gm: string | null; poradi: number | null }>(
    `SELECT d.zapas_id, u.hrac_id AS gm, s.poradi
       FROM diplo_zapas d
       JOIN zapas z ON z.id = d.zapas_id
       JOIN akce a ON a.id = z.akce_id
       LEFT JOIN ucastnik u ON u.zapas_id = z.id AND u.barva = ${GM_BARVA}
       LEFT JOIN diplo_scenar s ON s.id = d.scenar_id
      WHERE a.stav <> 'konec' AND z.stav = 'bezi'
      ORDER BY z.vytvoren DESC, z.id DESC`,
  );
  return rows.map((r) => ({ zapasId: r.zapas_id, gmHracId: r.gm, jmenoScenare: r.poradi === null ? null : jmenoScenareProHru(r.poradi) }));
}

/**
 * Které z těchhle zápasů Diplomacie právě běží v otevřené akci — pro paměť
 * snímků hry a pro právo GM mluvit do zápasu.
 */
export async function ktereZapasyBezi(zapasIds: number[]): Promise<number[]> {
  if (zapasIds.length === 0) return [];
  const { rows } = await getPool().query<{ zapas_id: number }>(
    `SELECT d.zapas_id
       FROM diplo_zapas d
       JOIN zapas z ON z.id = d.zapas_id
       JOIN akce a ON a.id = z.akce_id
      WHERE a.stav <> 'konec' AND z.stav = 'bezi' AND d.zapas_id = ANY($1::int[])`,
    [zapasIds],
  );
  return rows.map((r) => r.zapas_id);
}

/**
 * Nástupce určený hrou (most ke hře). Jeden podmíněný příkaz, ne „přečti
 * a zapiš“: GM může ve stejnou chvíli rozdat role a zápis po losu by mu
 * Nástupce vyměnil pod rukama. Nastaví se jen v přípravě a jen když hra
 * určila někoho jiného než posledně (`nastupce_ze_hry`, migrace 034) —
 * ruční volbu GM tak nepřepíše ani po restartu serveru — nebo když zápas
 * žádného Nástupce nemá. Vrací, jestli se něco změnilo.
 */
export async function nastavNastupceZeHry(zapasId: number, hracId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE diplo_zapas SET nastupce_hrac_id = $2::text, nastupce_ze_hry = $2::text, upraveno_v = now()
      WHERE zapas_id = $1 AND stav = 'priprava' AND (nastupce_ze_hry IS DISTINCT FROM $2::text OR nastupce_hrac_id IS NULL)`,
    [zapasId, hracId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Hra svou odpověď vzala zpět (cíl dostali všichni, nebo je to znovu
 * nejednoznačné): Nástupce, kterého určila ona a GM ho nepřepsal, se
 * v přípravě vynuluje. Ruční volba GM zůstává.
 */
export async function odvolejNastupceZeHry(zapasId: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE diplo_zapas SET nastupce_hrac_id = NULL, nastupce_ze_hry = NULL, upraveno_v = now()
      WHERE zapas_id = $1 AND stav = 'priprava' AND nastupce_ze_hry IS NOT NULL AND nastupce_hrac_id = nastupce_ze_hry`,
    [zapasId],
  );
  return (rowCount ?? 0) > 0;
}

export async function setNastupce(zapasId: number, hracId: string): Promise<void> {
  await getPool().query("UPDATE diplo_zapas SET nastupce_hrac_id = $2, upraveno_v = now() WHERE zapas_id = $1", [zapasId, hracId]);
}

/** Po změně sestavy: Nástupce, který mezi hráči zápasu už není, se vynuluje (jinak zůstane, jak je). */
export async function zrusNastupceMimoSestavu(zapasId: number, hraci: string[]): Promise<void> {
  await getPool().query(
    "UPDATE diplo_zapas SET nastupce_hrac_id = NULL, upraveno_v = now() WHERE zapas_id = $1 AND nastupce_hrac_id IS NOT NULL AND nastupce_hrac_id <> ALL($2::text[])",
    [zapasId, hraci],
  );
}

// Sloupec `diplo_role.upraveno_po_rozeslani` (migrace 031) se od 2. 10. 2026
// nečte ani nezapisuje: po rozeslání se role nemění, takže příznak nemá kdy
// vzniknout. V tabulce zůstává s výchozí hodnotou — bez migrace.
export async function ulozRole(zapasId: number, role: RoleHrace[], stav: StavDiplo): Promise<void> {
  await withTransaction(async (c) => {
    await c.query("DELETE FROM diplo_role WHERE zapas_id = $1", [zapasId]);
    for (const r of role) {
      await c.query(
        `INSERT INTO diplo_role (zapas_id, hrac_id, role, cil_hrac_id) VALUES ($1, $2, $3, $4)`,
        [zapasId, r.hracId, r.role, r.cilHracId],
      );
    }
    await c.query("UPDATE diplo_zapas SET stav = $2, upraveno_v = now() WHERE zapas_id = $1", [zapasId, stav]);
  });
}

export async function upravRoli(zapasId: number, r: RoleHrace): Promise<void> {
  await withTransaction(async (c) => {
    await c.query(
      `UPDATE diplo_role SET role = $3, cil_hrac_id = $4 WHERE zapas_id = $1 AND hrac_id = $2`,
      [zapasId, r.hracId, r.role, r.cilHracId],
    );
    await c.query("UPDATE diplo_zapas SET upraveno_v = now() WHERE zapas_id = $1", [zapasId]);
  });
}

export async function setStavDiplo(zapasId: number, stav: StavDiplo): Promise<void> {
  await getPool().query(
    `UPDATE diplo_zapas SET stav = $2, upraveno_v = now(), rozeslano_v = CASE WHEN $2 = 'rozeslano' THEN now() ELSE rozeslano_v END WHERE zapas_id = $1`,
    [zapasId, stav],
  );
}

export async function vratNaPripravu(zapasId: number): Promise<void> {
  await withTransaction(async (c) => {
    await c.query("DELETE FROM diplo_role WHERE zapas_id = $1", [zapasId]);
    await c.query("UPDATE diplo_zapas SET stav = 'priprava', nastupce_hrac_id = NULL, rozeslano_v = NULL, upraveno_v = now() WHERE zapas_id = $1", [zapasId]);
  });
}
