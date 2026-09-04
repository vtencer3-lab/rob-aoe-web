import { afterAll, beforeEach, expect, it } from "vitest";
import { closePool, getPool } from "./pool.js";
import { getPlayer, getPlayers, savePlayerStats, upsertPlayer } from "./players.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("založí hráče a podruhé ho jen vrátí", async () => {
  const prvni = await upsertPlayer("76561198000000001", false);
  expect(prvni.steamId).toBe("76561198000000001");
  expect(prvni.alias).toBeNull();

  await upsertPlayer("76561198000000001", false);
  const { rows } = await getPool().query("SELECT 1 FROM player");
  expect(rows).toHaveLength(1);
});

it("nastaví příznak admina", async () => {
  const hrac = await upsertPlayer("76561198000000002", true);
  expect(hrac.jeAdmin).toBe(true);
});

it("uloží statistiky včetně času stažení", async () => {
  await upsertPlayer("76561198000000003", false);
  await savePlayerStats("76561198000000003", {
    alias: "TenceR",
    elo1v1: 1847,
    eloNejvyssi: 1901,
    odehranoHer: 512,
    steamHodiny: 1230,
    chyba: null,
  });

  const hrac = await getPlayer("76561198000000003");
  expect(hrac?.alias).toBe("TenceR");
  expect(hrac?.elo1v1).toBe(1847);
  expect(hrac?.steamHodiny).toBe(1230);
  expect(hrac?.statyStazenyV).toBeInstanceOf(Date);
  expect(hrac?.statyChyba).toBeNull();
});

it("zapíše chybu, ale nepřepíše dřívější hodnoty", async () => {
  await upsertPlayer("76561198000000004", false);
  await savePlayerStats("76561198000000004", { alias: "Pepa", elo1v1: 1500, chyba: null });
  await savePlayerStats("76561198000000004", { chyba: "Worlds Edge neodpovědělo" });

  const hrac = await getPlayer("76561198000000004");
  expect(hrac?.alias).toBe("Pepa");
  expect(hrac?.elo1v1).toBe(1500);
  expect(hrac?.statyChyba).toBe("Worlds Edge neodpovědělo");
});

it("skryté hodiny se uloží jako null", async () => {
  await upsertPlayer("76561198000000005", false);
  await savePlayerStats("76561198000000005", { steamHodiny: null, chyba: null });
  expect((await getPlayer("76561198000000005"))?.steamHodiny).toBeNull();
});

it("vrátí null pro neznámého hráče", async () => {
  expect(await getPlayer("76561198000000099")).toBeNull();
});

it("načte víc hráčů najednou", async () => {
  await upsertPlayer("76561198000000006", false);
  await upsertPlayer("76561198000000007", false);
  const hraci = await getPlayers(["76561198000000006", "76561198000000007", "neznamy"]);
  expect(hraci.map((h) => h.steamId).sort()).toEqual(["76561198000000006", "76561198000000007"]);
});
