import { afterAll, beforeEach, expect, it } from "vitest";
import { listZpravy, pridejZpravu } from "./chat.js";
import { createAkce, signUp } from "./events.js";
import { createZapas } from "./matches.js";
import { closePool, getPool } from "./pool.js";
import { upsertPlayer } from "./players.js";
import { sestavaKazdyProtiKazdemu } from "../matches/sestavyProTesty.js";

const HRACI = ["76561198000000090", "76561198000000091"];
let akceId: number;

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;
  for (const s of HRACI) {
    await upsertPlayer(s, false);
    await signUp(akceId, s);
  }
});

afterAll(async () => {
  await closePool();
});

// Do stavu jde jen posledních N zpráv na zápas, od nejstarší; starší zůstávají
// v databázi. Každý zápas má vlastní okno.
it("vrátí posledních N zpráv každého zápasu, od nejstarší", async () => {
  const prvni = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI));
  const druhy = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI));
  for (let i = 1; i <= 4; i++) await pridejZpravu(prvni.id, HRACI[0]!, `a${i}`);
  await pridejZpravu(druhy.id, HRACI[1]!, "b1");

  const okno = await listZpravy(akceId, 3);
  expect(okno.get(prvni.id)!.map((z) => z.text)).toEqual(["a2", "a3", "a4"]);
  expect(okno.get(druhy.id)!.map((z) => z.text)).toEqual(["b1"]);
  expect(okno.get(druhy.id)![0]).toMatchObject({ steamId: HRACI[1], tym: 2, barva: 2, jeAdmin: false });
});
