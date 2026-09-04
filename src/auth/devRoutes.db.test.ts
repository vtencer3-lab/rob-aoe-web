import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { getAktivniAkce, createAkce, listSignups } from "../db/events.js";
import { closePool, getPool } from "../db/pool.js";
import { getPlayer, upsertPlayer } from "../db/players.js";
import { buildServer } from "../http/server.js";
import { zkusebniId } from "./devRoutes.js";

function zapniDvere(baseUrl = "http://localhost:3000"): void {
  vi.stubEnv("DEV_PRISTUP", "true");
  vi.stubEnv("BASE_URL", baseUrl);
}

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closePool();
});

it("bez DEV_PRISTUP se zkušební dveře vůbec nezaregistrují", async () => {
  vi.stubEnv("DEV_PRISTUP", undefined);
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/dev/login?jmeno=Pepa" });
  expect(res.statusCode).toBe(404);
  await app.close();
});

// Tohle je ten zámek, na kterém všechno stojí. DEV_PRISTUP zůstane v .env
// ležet zapnutý — nikdo ho před spuštěním tunelu vypínat nebude. Kdyby
// rozhodovala jen ta proměnná, šlo by se přes veřejnou adresu přihlásit za
// Roba jediným GETem, bez hesla a bez Steamu.
it("na produkční adrese zůstanou dveře zavřené, i když je proměnná zapnutá", async () => {
  zapniDvere("https://neco.trycloudflare.com");
  const app = buildServer();

  for (const cesta of ["/api/dev/login?jmeno=Pepa", "/api/dev/naplnit?pocet=3", "/api/dev/hraci"]) {
    const res = await app.inject({ method: "GET", url: cesta });
    expect(res.statusCode).toBe(404);
  }

  expect(await getPlayer(zkusebniId("Pepa"))).toBeNull();
  await app.close();
});

it("přihlásí zkušebního hráče a dá mu jméno i ELO", async () => {
  zapniDvere();
  const app = buildServer();

  const res = await app.inject({ method: "GET", url: "/api/dev/login?jmeno=Jana" });
  expect(res.statusCode).toBe(302);
  const cookie = res.cookies.find((c) => c.name === "sid");
  expect(cookie?.value).toBeTruthy();

  const hrac = await getPlayer(zkusebniId("Jana"));
  expect(hrac?.alias).toBe("Jana");
  expect(hrac?.elo1v1).toBe(1520);

  const me = await app.inject({
    method: "GET",
    url: "/api/me",
    cookies: { sid: cookie!.value },
  });
  expect(me.json().hrac.steamId).toBe(zkusebniId("Jana"));
  await app.close();
});

// Zkušební dveře nesmí být cesta k režii: kdo se jimi přihlásí, dostane
// přesně tolik práv, kolik ten účet v databázi má.
it("zkušební přihlášení nikomu nedá admina", async () => {
  zapniDvere();
  const app = buildServer();

  await app.inject({ method: "GET", url: "/api/dev/login?jmeno=Pepa" });
  expect((await getPlayer(zkusebniId("Pepa")))?.jeAdmin).toBe(false);

  // Ani nepřepíše práva někomu, kdo je má: jeAdmin se schválně nesahá.
  await upsertPlayer("76561198000000099", true);
  await app.inject({ method: "GET", url: "/api/dev/login?steamId=76561198000000099" });
  expect((await getPlayer("76561198000000099"))?.jeAdmin).toBe(true);
  await app.close();
});

it("naplnění bez akce srozumitelně odmítne", async () => {
  zapniDvere();
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/dev/naplnit?pocet=3" });
  expect(res.statusCode).toBe(409);
  expect(res.json().chyba).toContain("založ akci");
  await app.close();
});

it("naplnění přihlásí hráče do běžící akce a opakování nikoho nezdvojí", async () => {
  zapniDvere();
  const akce = await createAkce("zkouška");
  const app = buildServer();

  await app.inject({ method: "GET", url: "/api/dev/naplnit?pocet=3" });
  expect(await listSignups(akce.id)).toHaveLength(3);

  await app.inject({ method: "GET", url: "/api/dev/naplnit?pocet=3" });
  expect(await listSignups(akce.id)).toHaveLength(3);

  expect((await getAktivniAkce())?.id).toBe(akce.id);
  await app.close();
});

it("počet mimo rozsah se osekne, ne aby spadl", async () => {
  zapniDvere();
  const akce = await createAkce("zkouška");
  const app = buildServer();

  await app.inject({ method: "GET", url: "/api/dev/naplnit?pocet=999" });
  const prihlaseni = await listSignups(akce.id);
  expect(prihlaseni.length).toBeGreaterThan(0);
  expect(prihlaseni.length).toBeLessThanOrEqual(6);
  await app.close();
});

it("vypíše zkušební hráče a najde admina, aby bylo kam se vrátit", async () => {
  zapniDvere();
  await upsertPlayer("76561198000000042", true);
  const app = buildServer();

  const res = await app.inject({ method: "GET", url: "/api/dev/hraci" });
  expect(res.statusCode).toBe(200);
  expect(res.json().hraci).toContain("Pepa");
  expect(res.json().admin).toBe("76561198000000042");
  await app.close();
});

it("bez admina v databázi nic nevymýšlí", async () => {
  zapniDvere();
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/dev/hraci" });
  expect(res.json().admin).toBeNull();
  await app.close();
});
