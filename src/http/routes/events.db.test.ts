import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, listSignups, setAkceStav } from "../../db/events.js";
import { closePool, getPool } from "../../db/pool.js";
import { upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { buildServer } from "../server.js";

const HRAC = "76561198000000040";
const ROB = "76561198000000041";

async function prihlasenyKlient(steamId: string, jeAdmin: boolean) {
  await upsertPlayer(steamId, jeAdmin);
  return { sid: await createSession(steamId) };
}

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("nepřihlášený se nepřihlásí do akce", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const app = buildServer();
  const res = await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska` });
  expect(res.statusCode).toBe(401);
  await app.close();
});

it("přihlášený se přidá do seznamu", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/prihlaska`,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  expect(await listSignups(akce.id)).toHaveLength(1);
  await app.close();
});

it("do zavřené akce se přihlásit nejde", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "zavreno");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/prihlaska`,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(409);
  expect(res.json().chyba).toMatch(/není otevřené/i);
  await app.close();
});

it("běžný hráč nesmí zakládat akci ani měnit stav", async () => {
  const { sid } = await prihlasenyKlient(HRAC, false);
  const app = buildServer();

  const zalozeni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "moje akce" },
  });
  expect(zalozeni.statusCode).toBe(403);
  await app.close();
});

it("Rob smí založit akci a otevřít přihlašování", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();

  const zalozeni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "Coop Kings" },
  });
  expect(zalozeni.statusCode).toBe(200);
  const akceId = zalozeni.json().akce.id;

  const stav = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/stav`,
    cookies: { sid },
    payload: { stav: "prihlasovani" },
  });
  expect(stav.json().akce.stav).toBe("prihlasovani");
  await app.close();
});

it("GET /api/akce vrátí aktivní akci se seznamem", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });

  const res = await app.inject({ method: "GET", url: "/api/akce" });
  expect(res.json().akce.nazev).toBe("večer");
  expect(res.json().prihlaseni).toHaveLength(1);
  await app.close();
});

it("odhlášení hráče ze seznamu odebere", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });
  await app.inject({ method: "DELETE", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });
  expect(await listSignups(akce.id)).toHaveLength(0);
  await app.close();
});
