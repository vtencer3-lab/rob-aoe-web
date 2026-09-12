import { generatePassword, lobbyName, sestavSedadla } from "../matches/composition.js";
import { jeAi, JMENO_AI } from "../shared/aiHraci.js";
import {
  assertTransition,
  PrechodChyba,
  type MatchState,
} from "../matches/stateMachine.js";
import type { Barva, SestavaVstup, Tym, Vitez } from "../shared/types.js";
import { getPool, withTransaction } from "./pool.js";

export interface ZapasRow {
  id: number;
  akceId: number;
  poradi: number;
  stav: MatchState;
  nazevLobby: string;
  heslo: string;
  lobbyId: string | null;
  vitez: Vitez | null;
  /** Dohraný zápas zavřený křížkem v režii; null = otevřený. */
  zavrenyV: Date | null;
}

/** Hráč vybraný do zápasu se mezi kontrolou přihlášek a vložením zápasu odhlásil — skutečný konflikt, ne interní chyba. */
export class UcastnikOdhlasenChyba extends Error {}

export interface UcastnikRow {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  tym: Tym;
  barva: Barva;
  civ: number | null;
  /** 1v1 ELO ze žebříčku v době čtení — na kartě hráče vedle jména. */
  elo1v1: number | null;
  jeHost: boolean;
  poradi: number;
  kliknulPripojit: Date | null;
}

/**
 * Vítěz v databázi je text: „tym:2“ nebo „hrac:<steam_id>“. Sloupec pro
 * číslo týmu nestačí od chvíle, kdy hráč bez týmu hraje sám za sebe.
 */
export function vitezDoTextu(vitez: Vitez): string {
  return "tym" in vitez ? `tym:${vitez.tym}` : `hrac:${vitez.steamId}`;
}

export function vitezZTextu(text: string | null): Vitez | null {
  if (text === null) return null;
  const tym = /^tym:([1-4])$/.exec(text);
  if (tym) return { tym: Number(tym[1]) as Tym };
  const hrac = /^hrac:(.+)$/.exec(text);
  if (hrac) return { steamId: hrac[1]! };
  return null;
}

const SLOUPCE_ZAPASU = "id, akce_id, poradi, stav, nazev_lobby, heslo, lobby_id, vitez, zavreny_v";

function mapujZapas(r: Record<string, unknown>): ZapasRow {
  return {
    id: r["id"] as number,
    akceId: r["akce_id"] as number,
    poradi: r["poradi"] as number,
    stav: r["stav"] as MatchState,
    nazevLobby: r["nazev_lobby"] as string,
    heslo: r["heslo"] as string,
    lobbyId: r["lobby_id"] as string | null,
    vitez: vitezZTextu(r["vitez"] as string | null),
    zavrenyV: (r["zavreny_v"] as Date | null) ?? null,
  };
}

export async function createZapas(akceId: number, sestava: SestavaVstup[]): Promise<ZapasRow> {
  return withTransaction(async (client) => {
    // Kdo se mezitím odhlásil, do zápasu nepatří. Kontrola i vložení jsou v jedné transakci,
    // takže neúspěch nezanechá poloviční zápas.
    const steamIds = sestava.map((s) => s.steamId);
    const { rows: prihlaseni } = await client.query<{
      steam_id: string;
      odehrano_her: number | null;
      elo_1v1: number | null;
    }>(
      `SELECT p.steam_id, p.odehrano_her, p.elo_1v1
         FROM prihlaska pr JOIN player p ON p.steam_id = pr.steam_id
        WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen' AND pr.steam_id = ANY($2::text[])`,
      [akceId, steamIds],
    );
    const odehrano = new Map(prihlaseni.map((r) => [r.steam_id, r.odehrano_her]));
    // ELO se hráči přepisuje s každým stažením statistik; pro archiv se otiskne
    // to, které platilo v okamžiku založení zápasu.
    const elo = new Map(prihlaseni.map((r) => [r.steam_id, r.elo_1v1]));
    for (const steamId of steamIds) {
      // AI se do akce nehlásí — sedí rovnou v sestavě, takže tahle kontrola
      // se jí netýká. Zato potřebuje řádek v player, jinak ji cizí klíč
      // účastníka nepustí; zakládá se tady ze sdíleného seznamu, aby jméno
      // AI existovalo v celém repu jen jednou (shared/aiHraci.ts).
      if (jeAi(steamId)) {
        await client.query(
          `INSERT INTO player (steam_id, alias, steam_name) VALUES ($1, $2, $2)
             ON CONFLICT (steam_id) DO NOTHING`,
          [steamId, JMENO_AI],
        );
        continue;
      }
      if (!odehrano.has(steamId)) {
        throw new UcastnikOdhlasenChyba(`Hráč ${steamId} už není přihlášený do akce.`);
      }
    }

    const seats = sestavSedadla(sestava, odehrano);

    const { rows: poradiRows } = await client.query<{ dalsi: number }>(
      "SELECT COALESCE(MAX(poradi), 0) + 1 AS dalsi FROM zapas WHERE akce_id = $1",
      [akceId],
    );
    const poradi = poradiRows[0]!.dalsi;

    // Nastavení lobby žije na akci a mění se každým kliknutím. Zápas si ho
    // proto obtiskne, jinak by po večeru nešlo zjistit, s čím se hrál.
    const { rows: nastaveniRows } = await client.query<{ nastaveni_lobby: unknown }>(
      "SELECT nastaveni_lobby FROM akce WHERE id = $1",
      [akceId],
    );

    // Heslo je jedno na celý večer: Rob ho do hry opisuje při každém
    // zakládání lobby a hráči si ho pamatují z prvního zápasu. Zápas si ho
    // obtiskne, aby ho přežil i případný hod kostkou (ten mění heslo jen pro
    // lobby, které teprve vzniknou). Starší akce bez hesla ho dostane teď.
    const { rows: hesloRows } = await client.query<{ pristi_heslo: string }>(
      `UPDATE akce SET pristi_heslo = COALESCE(pristi_heslo, $2) WHERE id = $1 RETURNING pristi_heslo`,
      [akceId, generatePassword()],
    );
    const heslo = hesloRows[0]?.pristi_heslo ?? generatePassword();

    const { rows } = await client.query(
      `INSERT INTO zapas (akce_id, poradi, nazev_lobby, heslo, nastaveni)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING ${SLOUPCE_ZAPASU}`,
      [akceId, poradi, lobbyName(poradi), heslo, JSON.stringify(nastaveniRows[0]?.nastaveni_lobby ?? {})],
    );
    const zapas = mapujZapas(rows[0] as Record<string, unknown>);

    for (const seat of seats) {
      await client.query(
        `INSERT INTO ucastnik (zapas_id, steam_id, tym, barva, civ, je_host, poradi, elo_pri_zapasu)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [zapas.id, seat.steamId, seat.tym, seat.barva, seat.civ, seat.jeHost, seat.poradi, elo.get(seat.steamId) ?? null],
      );
    }
    return zapas;
  });
}

async function nactiUcastniky(zapasId: number): Promise<UcastnikRow[]> {
  const { rows } = await getPool().query(
    `SELECT u.steam_id, p.alias, p.steam_name, p.elo_1v1, u.tym, u.barva, u.civ, u.je_host, u.poradi, u.kliknul_pripojit
       FROM ucastnik u JOIN player p ON p.steam_id = u.steam_id
      WHERE u.zapas_id = $1
      ORDER BY u.poradi, u.steam_id`,
    [zapasId],
  );
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      steamId: row["steam_id"] as string,
      alias: row["alias"] as string | null,
      steamName: row["steam_name"] as string | null,
      tym: row["tym"] as Tym,
      barva: row["barva"] as Barva,
      civ: (row["civ"] as number | null) ?? null,
      elo1v1: (row["elo_1v1"] as number | null) ?? null,
      jeHost: row["je_host"] as boolean,
      poradi: row["poradi"] as number,
      kliknulPripojit: row["kliknul_pripojit"] as Date | null,
    };
  });
}

export async function getZapas(
  zapasId: number,
): Promise<{ zapas: ZapasRow; ucastnici: UcastnikRow[] } | null> {
  const { rows } = await getPool().query(`SELECT ${SLOUPCE_ZAPASU} FROM zapas WHERE id = $1`, [
    zapasId,
  ]);
  if (!rows[0]) return null;
  return {
    zapas: mapujZapas(rows[0] as Record<string, unknown>),
    ucastnici: await nactiUcastniky(zapasId),
  };
}

export async function listZapasy(
  akceId: number,
): Promise<Array<{ zapas: ZapasRow; ucastnici: UcastnikRow[] }>> {
  const { rows } = await getPool().query(
    `SELECT ${SLOUPCE_ZAPASU} FROM zapas WHERE akce_id = $1 ORDER BY poradi`,
    [akceId],
  );
  const vysledek = [];
  for (const r of rows) {
    const zapas = mapujZapas(r as Record<string, unknown>);
    vysledek.push({ zapas, ucastnici: await nactiUcastniky(zapas.id) });
  }
  return vysledek;
}

export async function setZapasStav(zapasId: number, stav: MatchState): Promise<void> {
  const nacteny = await getZapas(zapasId);
  if (!nacteny) throw new Error(`Zápas ${zapasId} neexistuje.`);
  assertTransition(nacteny.zapas.stav, stav);

  // Zápis je podmíněný stavem, proti kterému jsme právě ověřili přechod — pokud
  // se mezitím stav zápasu změnil (někdo byl rychlejší), UPDATE nic netrefí
  // a přechod se odmítne, místo aby tiše přepsal cizí mezistav.
  const { rowCount } = await getPool().query(
    `UPDATE zapas SET stav = $2,
       konec = CASE WHEN $2 = 'dohrano' THEN now() ELSE NULL END
     WHERE id = $1 AND stav = $3`,
    [zapasId, stav, nacteny.zapas.stav],
  );
  // Taky konflikt, ne interní chyba: někdo byl rychlejší. Stejný typ jako
  // u odmítnutého přechodu, takže to routy překládají na jedno 409.
  if (!rowCount) {
    throw new PrechodChyba(
      `Stav zápasu ${zapasId} se mezitím změnil — někdo byl rychlejší. Načti si stránku znovu.`,
    );
  }
}

/**
 * Zrušený zápas smaže i s účastníky (kaskáda). Podmínka na stav je v SQL:
 * kdyby ho někdo mezitím vrátil do hry, nic se nesmaže a vrátí se false.
 */
export async function smazZrusenyZapas(zapasId: number): Promise<boolean> {
  const { rowCount } = await getPool().query("DELETE FROM zapas WHERE id = $1 AND stav = 'zruseny'", [zapasId]);
  return (rowCount ?? 0) > 0;
}

/** Zavřít (zavreny = true) nebo znovu otevřít dohraný zápas. Vrací false, když zápas není dohraný. */
export async function setZavreny(zapasId: number, zavreny: boolean): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE zapas SET zavreny_v = CASE WHEN $2::boolean THEN now() ELSE NULL END WHERE id = $1 AND stav = 'dohrano'`,
    [zapasId, zavreny],
  );
  return (rowCount ?? 0) > 0;
}

export async function setLobbyId(zapasId: number, lobbyId: string): Promise<void> {
  await getPool().query("UPDATE zapas SET lobby_id = $2 WHERE id = $1", [zapasId, lobbyId]);
}

export async function setHost(zapasId: number, steamId: string): Promise<void> {
  await withTransaction(async (client) => {
    // UPDATE samo o sobě trefí každého účastníka zápasu bez ohledu na to, jestli
    // steamId mezi nimi je — u cizího steamId by tiše smazalo hosta ze všech řádků.
    // RETURNING je_host prozradí, jestli aspoň jeden řádek skutečně hostem zůstal.
    const { rows } = await client.query<{ je_host: boolean }>(
      "UPDATE ucastnik SET je_host = (steam_id = $2) WHERE zapas_id = $1 RETURNING je_host",
      [zapasId, steamId],
    );
    if (!rows.some((r) => r.je_host)) {
      throw new Error(`Hráč ${steamId} není účastníkem zápasu ${zapasId}.`);
    }
    // Staré číslo lobby patřilo předchozímu hostovi — nikdo se do mrtvé lobby
    // připojovat nebude.
    await client.query("UPDATE zapas SET lobby_id = NULL WHERE id = $1", [zapasId]);
  });
}

export async function oznacKliknutiPripojit(zapasId: number, steamId: string): Promise<void> {
  await getPool().query(
    "UPDATE ucastnik SET kliknul_pripojit = now() WHERE zapas_id = $1 AND steam_id = $2",
    [zapasId, steamId],
  );
}

export async function setVysledek(zapasId: number, vitez: Vitez): Promise<void> {
  await getPool().query("UPDATE zapas SET vitez = $2 WHERE id = $1", [zapasId, vitezDoTextu(vitez)]);
}
