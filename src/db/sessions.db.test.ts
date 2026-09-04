import { afterAll, beforeEach, expect, it } from "vitest";
import { closePool, getPool } from "./pool.js";
import { upsertPlayer } from "./players.js";
import { createSession, deleteExpiredSessions, deleteSession, getSessionUser } from "./sessions.js";

const STEAM_ID = "76561198000000010";

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
  await upsertPlayer(STEAM_ID, false);
});

afterAll(async () => {
  await closePool();
});

it("založí relaci a vrátí podle ní hráče", async () => {
  const sid = await createSession(STEAM_ID);
  expect(sid).toHaveLength(64);
  expect(await getSessionUser(sid)).toBe(STEAM_ID);
});

it("neznámá relace vrátí null", async () => {
  expect(await getSessionUser("neexistuje")).toBeNull();
});

it("prošlá relace vrátí null", async () => {
  const sid = await createSession(STEAM_ID);
  await getPool().query("UPDATE session SET plati_do = now() - interval '1 hour' WHERE sid = $1", [sid]);
  expect(await getSessionUser(sid)).toBeNull();
});

it("odhlášení relaci smaže", async () => {
  const sid = await createSession(STEAM_ID);
  await deleteSession(sid);
  expect(await getSessionUser(sid)).toBeNull();
});

it("úklid smaže jen prošlé relace", async () => {
  const platna = await createSession(STEAM_ID);
  const prosla = await createSession(STEAM_ID);
  await getPool().query("UPDATE session SET plati_do = now() - interval '1 day' WHERE sid = $1", [prosla]);

  expect(await deleteExpiredSessions()).toBe(1);
  expect(await getSessionUser(platna)).toBe(STEAM_ID);
});

it("relace přežije restart procesu", async () => {
  const sid = await createSession(STEAM_ID);
  await closePool();
  expect(await getSessionUser(sid)).toBe(STEAM_ID);
});
