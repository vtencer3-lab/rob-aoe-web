import { AKTIVITA_MINUT, ODSTUP_PULSU_MINUT, PRODLOUZENI_MINUT, ZVONEK_PO_MINUTACH } from "../shared/aktivita.js";
import type { SestavaVstup } from "../shared/types.js";
import { generatePassword } from "../matches/composition.js";
import { getPool, withTransaction } from "./pool.js";
import { mapuj, PLAYER_SLOUPEC_NAZVY, type DbRow, type PlayerRow } from "./players.js";

/** Akce buď běží, nebo skončila. Mezistavy zmizely i s tlačítky, která je nastavovala. */
export type AkceStav = "bezi" | "konec";

export interface AkceRow {
  id: number;
  nazev: string;
  stav: AkceStav;
  /** JSON s částí NastaveniLobby; zbytek doplní kód výchozími hodnotami. Mění se každým kliknutím. */
  nastaveniLobby: Record<string, unknown>;
  /** Snímek nastavení uložený tlačítkem; null = zatím nic neuloženo. */
  ulozeneNastaveniLobby: Record<string, unknown> | null;
  /** Rozpracovaná sestava zápasu, sdílená všemi adminy přes SSE. */
  skladani: SestavaVstup[];
  /** Heslo večera — společné všem lobby akce; null jen u akcí z doby, kdy ho neměly. */
  pristiHeslo: string | null;
}

interface AkceDbRow {
  id: number;
  nazev: string;
  stav: AkceStav;
  nastaveni_lobby: Record<string, unknown> | null;
  ulozene_nastaveni_lobby: Record<string, unknown> | null;
  skladani: SestavaVstup[] | null;
  pristi_heslo: string | null;
}

const SLOUPCE_AKCE = "id, nazev, stav, nastaveni_lobby, ulozene_nastaveni_lobby, skladani, pristi_heslo";

function mapujAkci(r: AkceDbRow): AkceRow {
  return {
    id: r.id,
    nazev: r.nazev,
    stav: r.stav,
    nastaveniLobby: r.nastaveni_lobby ?? {},
    ulozeneNastaveniLobby: r.ulozene_nastaveni_lobby,
    skladani: Array.isArray(r.skladani) ? r.skladani : [],
    pristiHeslo: r.pristi_heslo,
  };
}

/**
 * Lhůta aktivity je globální nastavení webu (migrace 024): jedno číslo pro
 * všechny akce, rozsah hlídá i databáze (CHECK 2–120).
 */
export async function getLhutaAktivity(): Promise<number> {
  const { rows } = await getPool().query<{ lhuta_aktivity_minut: number }>("SELECT lhuta_aktivity_minut FROM nastaveni_webu");
  return rows[0]?.lhuta_aktivity_minut ?? AKTIVITA_MINUT;
}

export async function setLhutaAktivity(minut: number): Promise<number> {
  await getPool().query("UPDATE nastaveni_webu SET lhuta_aktivity_minut = $1", [minut]);
  // Platí hned: bdícím hráčům se lhůta přepočítá od posledního projevu života,
  // takže kdo mlčí déle než nová lhůta, usne teď, a kdo ne, dostane víc času.
  await getPool().query(
    `UPDATE prihlaska
        SET aktivni_do = COALESCE(posledni_puls, kdy) + $1 * interval '1 minute'
      WHERE stav = 'prihlasen' AND aktivni_do > now()`,
    [minut],
  );
  return minut;
}

/**
 * Svolání do radnice: admin klikne na zvonek u hráče, hráči v prohlížeči
 * zazvoní poplach. Vrací false, když hráč v akci není.
 */
/**
 * Super zvonek: svolá naráz všechny, u kterých by admin viděl zvonek — komu
 * zbývá nejvýš lhůta − ZVONEK_PO_MINUTACH, včetně spících (shared/aktivita
 * `nabidnoutZvonek`, tady v SQL). Sebe admin nesvolává. Vrací počet.
 */
export async function svolejVsechny(akceId: number, kdoHracId: string): Promise<number> {
  const { rowCount } = await getPool().query(
    `UPDATE prihlaska SET svolan_v = now(), svolal_hrac_id = $2
      WHERE akce_id = $1 AND stav = 'prihlasen' AND hrac_id <> $2
        AND aktivni_do <= now() + ((SELECT lhuta_aktivity_minut FROM nastaveni_webu) - $3) * interval '1 minute'`,
    [akceId, kdoHracId, ZVONEK_PO_MINUTACH],
  );
  return rowCount ?? 0;
}

export async function svolej(akceId: number, hracId: string, kdoHracId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    "UPDATE prihlaska SET svolan_v = now(), svolal_hrac_id = $3 WHERE akce_id = $1 AND hrac_id = $2 AND stav = 'prihlasen'",
    [akceId, hracId, kdoHracId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Heslo večera. Vzniká s akcí a je společné všem jejím lobby — Rob ho opisuje
 * do hry při každém zakládání, hráči si ho pamatují z prvního zápasu. `nahod`
 * ho přegeneruje (kostka v okně Pre-Lobby) pro lobby, které teprve vzniknou;
 * už založené zápasy si drží svoje. Jinak se jen doplní, když ještě žádné není.
 */
export async function pripravPristiHeslo(akceId: number, nahod = false): Promise<AkceRow | null> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET pristi_heslo = $2
      WHERE id = $1 AND ($3::boolean OR pristi_heslo IS NULL)
      RETURNING ${SLOUPCE_AKCE}`,
    [akceId, generatePassword(), nahod],
  );
  if (rows[0]) return mapujAkci(rows[0]);
  const { rows: beze } = await getPool().query<AkceDbRow>(`SELECT ${SLOUPCE_AKCE} FROM akce WHERE id = $1`, [akceId]);
  return beze[0] ? mapujAkci(beze[0]) : null;
}

export async function createAkce(nazev: string): Promise<AkceRow> {
  // Heslo večera vzniká rovnou s akcí — okno Pre-Lobby ho ukazuje k opsání
  // do hry a nemá čekat, až si o něj někdo řekne.
  const { rows } = await getPool().query<AkceDbRow>(
    `INSERT INTO akce (nazev, pristi_heslo) VALUES ($1, $2) RETURNING ${SLOUPCE_AKCE}`,
    [nazev, generatePassword()],
  );
  return mapujAkci(rows[0]!);
}

export async function getAktivniAkce(): Promise<AkceRow | null> {
  const { rows } = await getPool().query<AkceDbRow>(
    `SELECT ${SLOUPCE_AKCE} FROM akce WHERE stav <> 'konec' ORDER BY id DESC LIMIT 1`,
  );
  return rows[0] ? mapujAkci(rows[0]) : null;
}

export async function setAkceStav(akceId: number, stav: AkceStav): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET stav = $2 WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, stav],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

/**
 * Akce bez výpovědní hodnoty se při ukončení maže (uživatel 13. 9. 2026):
 * prázdná, jen se zrušenými zápasy, nebo i s rozehranými — „on je stejně
 * neukončuje, to dělám já“. Zůstává jen akce, která má aspoň jeden dohraný
 * zápas s vítězem. Přihlášky, zápasy, účastníci, chat i události jdou
 * s ní (ON DELETE CASCADE). Vrací true, když se smazala.
 */
export async function smazAkciBezVysledku(akceId: number): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `DELETE FROM akce
      WHERE id = $1
        AND NOT EXISTS (SELECT 1 FROM zapas WHERE akce_id = $1 AND stav = 'dohrano' AND vitez IS NOT NULL)`,
    [akceId],
  );
  return (rowCount ?? 0) > 0;
}

export async function setNastaveniLobby(
  akceId: number,
  nastaveni: Record<string, unknown>,
): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET nastaveni_lobby = $2::jsonb WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, JSON.stringify(nastaveni)],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

/** „Uložit nastavení lobby“: živé nastavení se zkopíruje do snímku. */
export async function ulozNastaveniLobby(akceId: number): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET ulozene_nastaveni_lobby = nastaveni_lobby WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

export async function setSkladani(akceId: number, sestava: SestavaVstup[]): Promise<AkceRow> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET skladani = $2::jsonb WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, JSON.stringify(sestava)],
  );
  if (!rows[0]) throw new Error(`Akce ${akceId} neexistuje.`);
  return mapujAkci(rows[0]);
}

/** Přejmenuje akci. Vrací `null`, když akce neexistuje. */
export async function prejmenujAkci(akceId: number, nazev: string): Promise<AkceRow | null> {
  const { rows } = await getPool().query<AkceDbRow>(
    `UPDATE akce SET nazev = $2 WHERE id = $1 RETURNING ${SLOUPCE_AKCE}`,
    [akceId, nazev],
  );
  return rows[0] ? mapujAkci(rows[0]) : null;
}

export async function signUp(akceId: number, hracId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO prihlaska (akce_id, hrac_id, stav, kdy, aktivni_do)
          VALUES ($1, $2, 'prihlasen', now(), now() + (SELECT lhuta_aktivity_minut FROM nastaveni_webu) * interval '1 minute')
     ON CONFLICT (akce_id, hrac_id) DO UPDATE
          SET stav = 'prihlasen', kdy = now(),
              aktivni_do = now() + (SELECT lhuta_aktivity_minut FROM nastaveni_webu) * interval '1 minute',
              posledni_puls = NULL,
              svolan_v = NULL, svolal_hrac_id = NULL`,
    [akceId, hracId],
  );
}

/**
 * „Jsem tu!“: lhůta se nastaví na plnou, bez ohledu na to, jestli vypršela.
 * Vrací `false`, když se nic nezměnilo — odhlášený hráč, nebo cizí akce.
 *
 * Svolání se tím vyřídí (`svolan_v` = NULL): nevyřízené svolání by po
 * odhlášení a novém přihlášení — které ho maže také — nebo po dalším
 * načtení stavu vyskočilo znovu, i když admin nezvonil (Trokner, 13. 9. 2026).
 */
export async function obnovAktivitu(akceId: number, hracId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    `UPDATE prihlaska
        SET aktivni_do = now() + (SELECT lhuta_aktivity_minut FROM nastaveni_webu) * interval '1 minute', posledni_puls = now(),
            svolan_v = NULL, svolal_hrac_id = NULL
      WHERE akce_id = $1 AND hrac_id = $2 AND stav = 'prihlasen'`,
    [akceId, hracId],
  );
  return (rowCount ?? 0) > 0;
}

/**
 * Puls z prohlížeče: hráč něco na stránce udělal.
 *
 * Vypršelou lhůtu vrátí na plnou — to je zpráva „už jsem zpátky“ a opakovat ji
 * nevadí, výsledek je pořád stejný. Běžící lhůtu jen prodlouží, a to nejvýš
 * jednou za `ODSTUP_PULSU_MINUT`; jinak by se dala naklikat donekonečna.
 * Strop je vždycky plná lhůta od teď.
 *
 * Vrací `false`, když se nic nezměnilo. Volající pak nemusí rozesílat stav,
 * a puls tak nestojí nic, i když chodí od každého kliknutí.
 */
export async function pulsAktivity(akceId: number, hracId: string): Promise<boolean> {
  // Plná lhůta je globální (migrace 024); jednou dotazem se přečte do CTE.
  const { rowCount } = await getPool().query(
    `WITH lhuta AS (SELECT lhuta_aktivity_minut * interval '1 minute' AS plna FROM nastaveni_webu)
     UPDATE prihlaska
        SET aktivni_do = CASE
              WHEN aktivni_do <= now() THEN now() + (SELECT plna FROM lhuta)
              ELSE LEAST(aktivni_do + $3 * interval '1 minute', now() + (SELECT plna FROM lhuta))
            END,
            posledni_puls = now()
      WHERE akce_id = $1 AND hrac_id = $2 AND stav = 'prihlasen'
        AND (
          aktivni_do <= now()
          OR posledni_puls IS NULL
          OR posledni_puls <= now() - $4 * interval '1 minute'
        )
        -- Prodloužení, které by nic nepřidalo (lhůta už je na stropu), se
        -- zahodí tady: jinak by každé kliknutí rozesílalo stav nazdařbůh.
        AND (aktivni_do <= now() OR aktivni_do < now() + (SELECT plna FROM lhuta))`,
    [akceId, hracId, PRODLOUZENI_MINUT, ODSTUP_PULSU_MINUT],
  );
  return (rowCount ?? 0) > 0;
}

export async function withdraw(akceId: number, hracId: string): Promise<void> {
  await getPool().query(
    "UPDATE prihlaska SET stav = 'odhlasen' WHERE akce_id = $1 AND hrac_id = $2",
    [akceId, hracId],
  );
}

/**
 * Vymaže zkušební hráče z databáze, jako by nikdy nebyli. Ne odhlášení jako
 * u člověka, který odešel domů — smazání: zkušební hráč je nástroj na
 * zkoušení večera nasucho a po sobě nemá nechat nic, co by se pak pletlo
 * mezi skutečnými daty.
 *
 * Padají s ním i zápasy, ve kterých seděl — **včetně dohraných a včetně
 * těch, kde vedle něj hráli skuteční lidé**. Zápas se zkušebním hráčem
 * stejně není doklad o ničem, a nechat ho v historii by znamenalo věčný
 * zmatek. Zápasů, kde žádný zkušební nebyl, se úklid nedotkne.
 *
 * Pořadí kroků je dané cizími klíči: `ucastnik.hrac_id` ani `udalost.kdo`
 * nemají ON DELETE, takže dokud existují, `DELETE FROM player` neprojde.
 * Účastníky smaže kaskáda po zápase, události se mažou zvlášť; přihlášky
 * a sezení padnou kaskádou s hráčem. Všechno v jedné transakci, ať po
 * nezdaru nezůstane půl smazaného hráče.
 *
 * Vrací, kolik zkušebních hráčů bylo v akci přihlášených — to je číslo,
 * které Rob na tlačítku čeká.
 */
export async function smazZkusebniHrace(akceId: number): Promise<number> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ pocet: string }>(
      "SELECT count(*) AS pocet FROM prihlaska WHERE akce_id = $1 AND stav = 'prihlasen' AND hrac_id LIKE 'test:%'",
      [akceId],
    );
    const prihlasenych = Number(rows[0]?.pocet ?? 0);

    await client.query(
      "DELETE FROM zapas WHERE id IN (SELECT zapas_id FROM ucastnik WHERE hrac_id LIKE 'test:%')",
    );
    await client.query("DELETE FROM udalost WHERE kdo LIKE 'test:%'");
    await client.query("DELETE FROM player WHERE hrac_id LIKE 'test:%'");
    return prihlasenych;
  });
}

/**
 * Posune všem přihláškám v akci lhůtu o daný počet minut zpátky, jako by ten
 * čas uběhl. Jen pro debug mód: čekat čtvrt hodiny, aby šlo vidět, jak hráči
 * usínají, není zkouška, ale trest.
 *
 * Zpátky jde i poslední puls, jinak by přetočení odemklo odstup mezi pulsy
 * a chování by po něm neodpovídalo skutečnosti.
 */
export async function pretocCas(akceId: number, minut: number): Promise<number> {
  const { rowCount } = await getPool().query(
    `UPDATE prihlaska
        SET aktivni_do = aktivni_do - $2 * interval '1 minute',
            posledni_puls = posledni_puls - $2 * interval '1 minute'
      WHERE akce_id = $1 AND stav = 'prihlasen'`,
    [akceId, minut],
  );
  return rowCount ?? 0;
}

/** Přihlášený hráč i s tím, dokdy platí jeho přihláška (viz shared/aktivita.ts). */
export type PrihlasenyRow = PlayerRow & { aktivniDo: Date; svolanV: Date | null; svolalJmeno: string | null };

export async function listSignups(akceId: number): Promise<PrihlasenyRow[]> {
  const sloupce = PLAYER_SLOUPEC_NAZVY.map((sloupec) => `p.${sloupec}`).join(", ");
  const { rows } = await getPool().query<DbRow & { aktivni_do: Date; svolan_v: Date | null; svolal_jmeno: string | null }>(
    `SELECT ${sloupce}, pr.aktivni_do, pr.svolan_v,
            COALESCE(a.alias, a.steam_name, a.hrac_id) AS svolal_jmeno
       FROM prihlaska pr
       JOIN player p ON p.hrac_id = pr.hrac_id
       LEFT JOIN player a ON a.hrac_id = pr.svolal_hrac_id
      WHERE pr.akce_id = $1 AND pr.stav = 'prihlasen'
      ORDER BY pr.kdy ASC`,
    [akceId],
  );
  // Pořadí zůstává podle času přihlášení. Neaktivní se propadají na konec až
  // v prohlížeči: lhůta vyprší sama od sebe, bez zápisu, který by šel poznat
  // na serveru a vyvolal rozeslání stavu.
  return rows.map((row) => ({ ...mapuj(row), aktivniDo: row.aktivni_do, svolanV: row.svolan_v, svolalJmeno: row.svolal_jmeno }));
}
