import { afterAll, beforeEach, expect, it } from "vitest";
import {
  createAkce,
  getAktivniAkce,
  listSignups,
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

it("nová akce začíná v přípravě", async () => {
  const akce = await createAkce("Coop Kings večer");
  expect(akce.nazev).toBe("Coop Kings večer");
  expect(akce.stav).toBe("priprava");
});

it("aktivní akce je ta nejnovější nedokončená", async () => {
  const stara = await createAkce("stará");
  await setAkceStav(stara.id, "konec");
  const nova = await createAkce("nová");
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
