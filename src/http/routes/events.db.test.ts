import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, getAktivniAkce, listSignups, setAkceStav } from "../../db/events.js";
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
  const app = buildServer();
  const res = await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska` });
  expect(res.statusCode).toBe(401);
  await app.close();
});

it("přihlášený se přidá do seznamu", async () => {
  const akce = await createAkce("večer");
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

it("do skončené akce se přihlásit nejde", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "konec");
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/prihlaska`,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(409);
  expect(res.json().chyba).toMatch(/neběží/i);
  await app.close();
});

it("běžný hráč nesmí zakládat akci ani měnit stav", async () => {
  const akce = await createAkce("večer");
  const { sid } = await prihlasenyKlient(HRAC, false);
  const app = buildServer();

  const zalozeni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "moje akce" },
  });
  expect(zalozeni.statusCode).toBe(403);

  const zmenaStavu = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/stav`,
    cookies: { sid },
    payload: { stav: "zavreno" },
  });
  expect(zmenaStavu.statusCode).toBe(403);
  await app.close();
});

it("Rob smí založit akci a ta rovnou běží", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();

  const zalozeni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "Coop Kings" },
  });

  expect(zalozeni.statusCode).toBe(200);
  expect(zalozeni.json().akce.stav).toBe("bezi");
  await app.close();
});

it("Rob smí akci ukončit", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const akce = await createAkce("Coop Kings");
  const app = buildServer();

  const stav = await app.inject({
    method: "POST",
    url: `/api/akce/${akce.id}/stav`,
    cookies: { sid },
    payload: { stav: "konec" },
  });

  expect(stav.json().akce.stav).toBe("konec");
  expect(await getAktivniAkce()).toBeNull();
  await app.close();
});

// Rob složí příští týden dřív, než uzavře tenhle večer — úplně běžná akce,
// kterou nic nezakazovalo. Musí dostat srozumitelné 409, ne 500.
it("založení druhé akce vedle běžící vrátí 409 se srozumitelnou hláškou", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();

  const prvni = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "tenhle večer" },
  });
  expect(prvni.statusCode).toBe(200);

  const druha = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "příští týden" },
  });
  expect(druha.statusCode).toBe(409);
  expect(druha.json().chyba).toMatch(/konec/i);

  // Po uzavření té první už další projde.
  await app.inject({
    method: "POST",
    url: `/api/akce/${prvni.json().akce.id}/stav`,
    cookies: { sid },
    payload: { stav: "konec" },
  });
  const potreti = await app.inject({
    method: "POST",
    url: "/api/akce",
    cookies: { sid },
    payload: { nazev: "příští týden" },
  });
  expect(potreti.statusCode).toBe(200);
  await app.close();
});

it("nečíselné ID akce vrátí 400 místo pádu do DB", async () => {
  const { sid } = await prihlasenyKlient(ROB, true);
  const app = buildServer();

  const res = await app.inject({
    method: "POST",
    url: "/api/akce/abc/stav",
    cookies: { sid },
    payload: { stav: "prihlasovani" },
  });
  expect(res.statusCode).toBe(400);
  await app.close();
});

it("GET /api/akce vrátí aktivní akci se seznamem", async () => {
  const akce = await createAkce("večer");
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
  const { sid } = await prihlasenyKlient(HRAC, false);

  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });
  await app.inject({ method: "DELETE", url: `/api/akce/${akce.id}/prihlaska`, cookies: { sid } });
  expect(await listSignups(akce.id)).toHaveLength(0);
  await app.close();
});

// Závora na stavu „prihlasovani“ byla to jediné, co přihlašování povolovalo.
// Kdyby ten stav zmizel a podmínka zůstala, nepřihlásil by se do akce už nikdo
// nikdy — a to naprosto tiše, jen 409 u každého kliknutí. Tenhle test je
// pojistka přesně proti tomu.
it("přihlásit se jde do každé běžící akce, i když už jsou zápasy složené", async () => {
  const akce = await createAkce("večer");
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
