import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, setAkceStav } from "../../db/events.js";
import { closePool, getPool } from "../../db/pool.js";
import { hub } from "../../realtime/hub.js";
import { buildServer } from "../server.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("bez aktivní akce vrátí 404", async () => {
  const app = buildServer();
  const res = await app.inject({ method: "GET", url: "/api/stream" });
  expect(res.statusCode).toBe(404);
  await app.close();
});

// Poznámka k app.inject a SSE: spojení se u SSE nikdy samo neukončí (žádné
// reply.raw.end()), takže Fastify musí dostat `reply.hijack()`, jinak se po
// doběhnutí handleru pokusí odpověď odeslat znovu přes už rozjetý raw stream.
// Aby na tohle inject nečekal donekonečna (čeká na 'finish', které bez
// end() nikdy nepřijde), používáme payloadAsStream a čteme první zprávu
// přímo ze streamu; odpojení klienta simulujeme přes AbortSignal.
it("pošle úvodní stav a přihlásí odběratele", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const app = buildServer();
  await app.ready();

  const controller = new AbortController();
  const res = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: controller.signal,
  });
  expect(res.headers["content-type"]).toContain("text/event-stream");
  expect(res.headers["cache-control"]).toBe("no-cache");
  expect(res.headers["x-accel-buffering"]).toBe("no");

  const uvodniZprava = await new Promise<string>((resolve, reject) => {
    const stream = res.stream();
    stream.once("data", (chunk: Buffer) => resolve(chunk.toString()));
    stream.once("error", reject);
  });
  expect(uvodniZprava).toContain(`"nazev":"večer"`);

  controller.abort();
  await app.close();
});

it("po odpojení klienta se odběratel odhlásí z hubu", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const app = buildServer();
  await app.ready();

  const controller = new AbortController();
  const res = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: controller.signal,
  });
  await new Promise<void>((resolve, reject) => {
    const stream = res.stream();
    stream.once("data", () => resolve());
    stream.once("error", reject);
  });

  expect(hub.subscriberCount(akce.id)).toBe(1);

  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(hub.subscriberCount(akce.id)).toBe(0);
  await app.close();
});

// Regrese pro únik odběratele/pulsu, když se klient odpojí, zatímco ještě
// běží buildAkceStav() (DB round trip). Bez posluchače registrovaného před
// prvním await by 'close' přišlo dřív, než by měl kdo naslouchat, a
// odběratel s intervalem by pak zůstaly viset navždy.
it("odpojení klienta hned po hijacku (ještě během sestavování stavu) odběratele stejně odhlásí", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const app = buildServer();
  await app.ready();

  const controller = new AbortController();
  await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: controller.signal,
  });

  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(hub.subscriberCount(akce.id)).toBe(0);
  await app.close();
});

it("hub o odběrateli ví a po zavření spojení ho zapomene", async () => {
  const akce = await createAkce("večer");
  const odhlas = hub.subscribe(akce.id, () => {});
  expect(hub.subscriberCount(akce.id)).toBe(1);
  odhlas();
  expect(hub.subscriberCount(akce.id)).toBe(0);
});
