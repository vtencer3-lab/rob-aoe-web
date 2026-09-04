import { assignSeats, generatePassword, lobbyName } from "../matches/composition.js";
import { assertTransition, type Actor, type MatchState } from "../matches/stateMachine.js";
import type { Barva, Format, Tym } from "../shared/types.js";
import { getPool, withTransaction } from "./pool.js";

export interface ZapasRow {
  id: number;
  akceId: number;
  poradi: number;
  format: Format;
  stav: MatchState;
  nazevLobby: string;
  heslo: string;
  lobbyId: string | null;
  viteznyTym: Tym | null;
  hostPotvrdil: Date | null;
}

/** Hráč vybraný do zápasu se mezi kontrolou přihlášek a vložením zápasu odhlásil — skutečný konflikt, ne interní chyba. */
export class UcastnikOdhlasenChyba extends Error {}

export interface UcastnikRow {
  steamId: string;
  alias: string | null;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
  kliknulPripojit: Date | null;
}

function mapujZapas(r: Record<string, unknown>): ZapasRow {
  return {
    id: r["id"] as number,
    akceId: r["akce_id"] as number,
    poradi: r["poradi"] as number,
    format: r["format"] as Format,
    stav: r["stav"] as MatchState,
    nazevLobby: r["nazev_lobby"] as string,
    heslo: r["heslo"] as string,
    lobbyId: r["lobby_id"] as string | null,
    viteznyTym: r["vitezny_tym"] as Tym | null,
    hostPotvrdil: r["host_potvrdil"] as Date | null,
  };
}

export async function createZapas(
  akceId: number,
  format: Format,
  steamIds: string[],
): Promise<ZapasRow> {
  return withTransaction(async (client) => {
    // Kdo se mezitím odhlásil, do zápasu nepatří. Kontrola i vložení jsou v jedné transakci,
    // takže neúspěch nezanechá poloviční zápas.
    const { rows: prihlaseni } = await client.query<{ steam_id: string; odehrano_her: number | null }>(
      `SELECT p.steam_id, p.odehrano_her
         FROM prihlaska pr JOIN player p ON p.steam_id = pr.steam_id
        WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen' AND pr.steam_id = ANY($2::text[])`,
      [akceId, steamIds],
    );
    const podleId = new Map(prihlaseni.map((r) => [r.steam_id, r.odehrano_her]));
    for (const steamId of steamIds) {
      if (!podleId.has(steamId)) {
        throw new UcastnikOdhlasenChyba(`Hráč ${steamId} už není přihlášený do akce.`);
      }
    }

    const seats = assignSeats(
      format,
      steamIds.map((steamId) => ({ steamId, odehranoHer: podleId.get(steamId) ?? null })),
    );

    const { rows: poradiRows } = await client.query<{ dalsi: number }>(
      "SELECT COALESCE(MAX(poradi), 0) + 1 AS dalsi FROM zapas WHERE akce_id = $1",
      [akceId],
    );
    const poradi = poradiRows[0]!.dalsi;

    const { rows } = await client.query(
      `INSERT INTO zapas (akce_id, poradi, format, nazev_lobby, heslo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, akce_id, poradi, format, stav, nazev_lobby, heslo, lobby_id, vitezny_tym, host_potvrdil`,
      [akceId, poradi, format, lobbyName(poradi), generatePassword()],
    );
    const zapas = mapujZapas(rows[0] as Record<string, unknown>);

    for (const seat of seats) {
      await client.query(
        "INSERT INTO ucastnik (zapas_id, steam_id, tym, barva, je_host) VALUES ($1, $2, $3, $4, $5)",
        [zapas.id, seat.steamId, seat.tym, seat.barva, seat.jeHost],
      );
    }
    return zapas;
  });
}

async function nactiUcastniky(zapasId: number): Promise<UcastnikRow[]> {
  const { rows } = await getPool().query(
    `SELECT u.steam_id, p.alias, u.tym, u.barva, u.je_host, u.kliknul_pripojit
       FROM ucastnik u JOIN player p ON p.steam_id = u.steam_id
      WHERE u.zapas_id = $1
      ORDER BY u.tym, u.steam_id`,
    [zapasId],
  );
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      steamId: row["steam_id"] as string,
      alias: row["alias"] as string | null,
      tym: row["tym"] as Tym,
      barva: row["barva"] as Barva,
      jeHost: row["je_host"] as boolean,
      kliknulPripojit: row["kliknul_pripojit"] as Date | null,
    };
  });
}

export async function getZapas(
  zapasId: number,
): Promise<{ zapas: ZapasRow; ucastnici: UcastnikRow[] } | null> {
  const { rows } = await getPool().query(
    `SELECT id, akce_id, poradi, format, stav, nazev_lobby, heslo, lobby_id, vitezny_tym, host_potvrdil
       FROM zapas WHERE id = $1`,
    [zapasId],
  );
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
    `SELECT id, akce_id, poradi, format, stav, nazev_lobby, heslo, lobby_id, vitezny_tym, host_potvrdil
       FROM zapas WHERE akce_id = $1 ORDER BY poradi`,
    [akceId],
  );
  const vysledek = [];
  for (const r of rows) {
    const zapas = mapujZapas(r as Record<string, unknown>);
    vysledek.push({ zapas, ucastnici: await nactiUcastniky(zapas.id) });
  }
  return vysledek;
}

export async function setZapasStav(
  zapasId: number,
  stav: MatchState,
  actor: Actor,
): Promise<void> {
  const nacteny = await getZapas(zapasId);
  if (!nacteny) throw new Error(`Zápas ${zapasId} neexistuje.`);
  assertTransition(nacteny.zapas.stav, stav, actor);

  // Zápis je podmíněný stavem, proti kterému jsme právě ověřili přechod — pokud
  // se mezitím stav zápasu změnil (druhý aktér byl rychlejší), UPDATE nic netrefí
  // a přechod se odmítne, místo aby tiše přepsal cizí mezistav.
  const { rowCount } = await getPool().query(
    `UPDATE zapas SET stav = $2,
       zacatek = CASE WHEN $2 = 'hraje_se' THEN COALESCE(zacatek, now()) ELSE zacatek END,
       konec   = CASE WHEN $2 = 'dohrano'  THEN now() ELSE NULL END
     WHERE id = $1 AND stav = $3`,
    [zapasId, stav, nacteny.zapas.stav],
  );
  if (!rowCount) throw new Error(`Stav zápasu ${zapasId} se mezitím změnil.`);
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
    // Staré číslo lobby patřilo předchozímu hostovi — nikdo se do mrtvé lobby připojovat
    // nebude. Nový host taky ještě nic nepotvrdil.
    await client.query("UPDATE zapas SET lobby_id = NULL, host_potvrdil = NULL WHERE id = $1", [
      zapasId,
    ]);
  });
}

export async function oznacKliknutiPripojit(zapasId: number, steamId: string): Promise<void> {
  await getPool().query(
    "UPDATE ucastnik SET kliknul_pripojit = now() WHERE zapas_id = $1 AND steam_id = $2",
    [zapasId, steamId],
  );
}

export async function setVysledek(zapasId: number, viteznyTym: Tym): Promise<void> {
  await getPool().query("UPDATE zapas SET vitezny_tym = $2 WHERE id = $1", [zapasId, viteznyTym]);
}

export async function setHostPotvrdil(zapasId: number): Promise<void> {
  await getPool().query("UPDATE zapas SET host_potvrdil = now() WHERE id = $1", [zapasId]);
}

export async function zrusHostPotvrdil(zapasId: number): Promise<void> {
  await getPool().query("UPDATE zapas SET host_potvrdil = NULL WHERE id = $1", [zapasId]);
}
