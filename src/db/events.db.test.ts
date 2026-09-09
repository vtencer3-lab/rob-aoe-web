import { afterAll, beforeEach, expect, it } from "vitest";
import { AKTIVITA_MINUT, ODSTUP_PULSU_MINUT, PRODLOUZENI_MINUT } from "../shared/aktivita.js";
import {
  createAkce,
  getAktivniAkce,
  listSignups,
  obnovAktivitu,
  pretocCas,
  pulsAktivity,
  setAkceStav,
  signUp,
  withdraw,
} from "./events.js";
import { closePool, getPool } from "./pool.js";
import { savePlayerStats, upsertPlayer } from "./players.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  await getPool().query("ALTER SEQUENCE akce_id_seq RESTART WITH 1");
});

afterAll(async () => {
  await closePool();
});

it("nová akce rovnou běží, na nic se nečeká", async () => {
  const akce = await createAkce("Coop Kings večer");
  expect(akce.nazev).toBe("Coop Kings večer");
  expect(akce.stav).toBe("bezi");
});

it("aktivní akce je ta nejnovější nedokončená", async () => {
  const stara = await createAkce("stará");
  await setAkceStav(stara.id, "konec");
  const nova = await createAkce("nová");
  expect((await getAktivniAkce())?.id).toBe(nova.id);
});

// Invariant „nejvýš jedna nedokončená akce“ drží od migrace 003 databáze sama.
// Dřív ho nedržel nikdo: getAktivniAkce si jednu jen VYBERE, ale odběratelé SSE
// jsou přihlášení na akce.id z okamžiku připojení, takže druhá otevřená akce
// znamená, že broadcast jde na kanál, na kterém nikdo není — všem tiše zamrzne
// stránka.
it("druhou nedokončenou akci databáze nepustí", async () => {
  await createAkce("tenhle večer");
  await expect(createAkce("příští týden")).rejects.toMatchObject({ code: "23505" });
});

it("po uzavření předchozí akce jde založit další", async () => {
  const stara = await createAkce("tenhle večer");
  await setAkceStav(stara.id, "konec");
  const nova = await createAkce("příští týden");
  expect((await getAktivniAkce())?.id).toBe(nova.id);
});

it("bez akce vrátí null", async () => {
  expect(await getAktivniAkce()).toBeNull();
});

it("přihláška a odhlášení mění seznam", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000031", false);
  await upsertPlayer("76561198000000032", false);

  await signUp(akce.id, "76561198000000031");
  await signUp(akce.id, "76561198000000032");
  expect(await listSignups(akce.id)).toHaveLength(2);

  await withdraw(akce.id, "76561198000000031");
  const zbyli = await listSignups(akce.id);
  expect(zbyli.map((h) => h.steamId)).toEqual(["76561198000000032"]);
});

it("dvojí přihlášení nezaloží druhý řádek", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000033", false);
  await signUp(akce.id, "76561198000000033");
  await signUp(akce.id, "76561198000000033");
  expect(await listSignups(akce.id)).toHaveLength(1);
});

it("po odhlášení se jde přihlásit znovu", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000034", false);
  await signUp(akce.id, "76561198000000034");
  await withdraw(akce.id, "76561198000000034");
  await signUp(akce.id, "76561198000000034");
  expect(await listSignups(akce.id)).toHaveLength(1);
});

it("seznam nese statistiky hráče", async () => {
  const akce = await createAkce("večer");
  await upsertPlayer("76561198000000035", false);
  await savePlayerStats("76561198000000035", { alias: "TenceR", elo1v1: 1847, chyba: null });
  await signUp(akce.id, "76561198000000035");

  const [hrac] = await listSignups(akce.id);
  expect(hrac!.alias).toBe("TenceR");
  expect(hrac!.elo1v1).toBe(1847);
});

// ---- Lhůta aktivity přihlášky ---------------------------------------------
// Kdo se dlouho neozve, ztmavne a spadne na konec seznamu (shared/aktivita.ts).
// Lhůtu drží databáze, protože se musí chovat stejně pro všechny prohlížeče.

const HRAC = "76561198000000900";

/** Přihlásí hráče do nové akce a vrátí její id. */
async function pripravAkci(): Promise<number> {
  const akce = await createAkce("večer");
  await upsertPlayer(HRAC, null);
  await signUp(akce.id, HRAC);
  return akce.id;
}

/** Kolik minut zbývá do usnutí; záporné číslo znamená, že lhůta vypršela. */
async function zbyvaMinut(akceId: number): Promise<number> {
  const [prihlaseny] = await listSignups(akceId);
  if (!prihlaseny) throw new Error("Hráč v akci není.");
  return (prihlaseny.aktivniDo.getTime() - Date.now()) / 60_000;
}

/** Posune lhůtu tak, aby hráči zbývalo přesně tolik minut (záporné = usnul). */
async function nastavZbyvajici(akceId: number, minut: number): Promise<void> {
  await getPool().query(
    `UPDATE prihlaska SET aktivni_do = now() + $2 * interval '1 minute' WHERE akce_id = $1`,
    [akceId, minut],
  );
}

it("přihláška platí od začátku plnou lhůtu", async () => {
  const akceId = await pripravAkci();
  expect(await zbyvaMinut(akceId)).toBeGreaterThan(AKTIVITA_MINUT - 1);
  expect(await zbyvaMinut(akceId)).toBeLessThanOrEqual(AKTIVITA_MINUT);
});

it("„Jsem tu!“ vrátí plnou lhůtu i tomu, kdo dávno usnul", async () => {
  const akceId = await pripravAkci();
  await nastavZbyvajici(akceId, -60);

  expect(await obnovAktivitu(akceId, HRAC)).toBe(true);
  expect(await zbyvaMinut(akceId)).toBeGreaterThan(AKTIVITA_MINUT - 1);
});

it("„Jsem tu!“ od odhlášeného nic nezmění", async () => {
  const akceId = await pripravAkci();
  await withdraw(akceId, HRAC);
  expect(await obnovAktivitu(akceId, HRAC)).toBe(false);
});

it("puls vrátí usnulému plnou lhůtu", async () => {
  const akceId = await pripravAkci();
  await nastavZbyvajici(akceId, -1);

  expect(await pulsAktivity(akceId, HRAC)).toBe(true);
  expect(await zbyvaMinut(akceId)).toBeGreaterThan(AKTIVITA_MINUT - 1);
});

it("puls běžící lhůtu prodlouží jen o kousek, ne na plnou", async () => {
  const akceId = await pripravAkci();
  await nastavZbyvajici(akceId, 2);

  expect(await pulsAktivity(akceId, HRAC)).toBe(true);
  const zbyva = await zbyvaMinut(akceId);
  expect(zbyva).toBeGreaterThan(2 + PRODLOUZENI_MINUT - 1);
  expect(zbyva).toBeLessThan(2 + PRODLOUZENI_MINUT + 0.5);
});

// Jinak by stačilo třikrát kliknout a lhůta by byla plná, aniž by u toho
// kdokoliv seděl.
it("druhý puls hned po prvním lhůtu nehne", async () => {
  const akceId = await pripravAkci();
  await nastavZbyvajici(akceId, 2);
  await pulsAktivity(akceId, HRAC);
  const poPrvnim = await zbyvaMinut(akceId);

  expect(await pulsAktivity(akceId, HRAC)).toBe(false);
  expect(await zbyvaMinut(akceId)).toBeCloseTo(poPrvnim, 1);
});

it("po uplynutí odstupu puls zabere znovu", async () => {
  const akceId = await pripravAkci();
  await nastavZbyvajici(akceId, 2);
  await pulsAktivity(akceId, HRAC);
  await getPool().query(
    `UPDATE prihlaska SET posledni_puls = now() - $1 * interval '1 minute' WHERE akce_id = $2`,
    [ODSTUP_PULSU_MINUT + 1, akceId],
  );

  expect(await pulsAktivity(akceId, HRAC)).toBe(true);
});

// Strop je plná lhůta od teď: prodlužování nesmí lhůtu natáhnout přes ni.
it("puls nepřetáhne lhůtu přes strop", async () => {
  const akceId = await pripravAkci();
  await nastavZbyvajici(akceId, AKTIVITA_MINUT - 1);

  // Prodloužení by lhůtu natáhlo na 19 minut; strop ji srazí zpátky na 15.
  expect(await pulsAktivity(akceId, HRAC)).toBe(true);
  expect(await zbyvaMinut(akceId)).toBeLessThanOrEqual(AKTIVITA_MINUT);
});

it("přetočení času uspí všechny přihlášené", async () => {
  const akceId = await pripravAkci();
  expect(await pretocCas(akceId, AKTIVITA_MINUT)).toBe(1);
  expect(await zbyvaMinut(akceId)).toBeLessThanOrEqual(0);
});
