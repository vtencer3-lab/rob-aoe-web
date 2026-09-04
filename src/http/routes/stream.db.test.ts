import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, setAkceStav, signUp } from "../../db/events.js";
import { createZapas, setLobbyId, setZapasStav } from "../../db/matches.js";
import { closePool, getPool } from "../../db/pool.js";
import { savePlayerStats, upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { broadcastAkce } from "../../realtime/akceStav.js";
import { hub, KANAL_AKCE } from "../../realtime/hub.js";
import type { AkceStavPayload } from "../../shared/types.js";
import { buildServer } from "../server.js";

/** Přečte první `data:` rámec ze SSE streamu a rozbalí payload. */
async function prvniPayload(stream: NodeJS.ReadableStream): Promise<AkceStavPayload> {
  const ramec = await new Promise<string>((resolve, reject) => {
    stream.once("data", (chunk: Buffer) => resolve(chunk.toString()));
    stream.once("error", reject);
  });
  return JSON.parse(ramec.replace(/^data: /, "")) as AkceStavPayload;
}

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await closePool();
});

/**
 * Sbírá rámce průběžně, ne až na požádání. Číst je jednorázovým
 * `stream.once("data")` by u druhého a dalšího rámce byla loterie: mezi
 * odebráním posluchače a nasazením dalšího stream teče dál a to, co v tom
 * okně přijde, zmizí.
 */
function sberac(stream: NodeJS.ReadableStream): { ramec(poradi: number): Promise<AkceStavPayload> } {
  const ramce: AkceStavPayload[] = [];
  let probud: (() => void) | undefined;
  stream.on("data", (chunk: Buffer) => {
    for (const cast of chunk.toString().split("\n\n")) {
      if (!cast.startsWith("data: ")) continue; // ": puls" a prázdné konce
      ramce.push(JSON.parse(cast.slice("data: ".length)) as AkceStavPayload);
    }
    probud?.();
  });
  return {
    async ramec(poradi: number): Promise<AkceStavPayload> {
      while (ramce.length <= poradi) {
        await new Promise<void>((resolve) => {
          probud = resolve;
        });
      }
      return ramce[poradi]!;
    },
  };
}

// Dokud se sem bez akce odpovídalo 404, EventSource v prohlížeči spojení
// natvrdo zavřel a na stránce svítilo „Obnovuji spojení…“ od rána do večera —
// tedy po celou dobu, kdy je všechno v pořádku a jen ještě nic neběží. Hláška
// o výpadku, která svítí pořád, přestane být hláškou o výpadku.
it("bez aktivní akce stream drží a založení akce doručí živě", async () => {
  const app = buildServer();
  await app.ready();

  const controller = new AbortController();
  const res = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: controller.signal,
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers["content-type"]).toContain("text/event-stream");

  const fronta = sberac(res.stream());
  expect((await fronta.ramec(0)).akce).toBeNull();
  expect(hub.subscriberCount(KANAL_AKCE)).toBe(1);

  // Rob večer akci založí. Čekající její id znát nemůže, takže se to k němu
  // musí dostat společným kanálem — jinak by na založení čekal až do příští
  // obnovy spojení, a ta při držícím streamu nikdy nepřijde.
  const akce = await createAkce("večer");
  await broadcastAkce();
  expect((await fronta.ramec(1)).akce?.nazev).toBe("večer");

  controller.abort();
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

  expect(hub.subscriberCount(KANAL_AKCE)).toBe(1);

  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(hub.subscriberCount(KANAL_AKCE)).toBe(0);
  await app.close();
});

// Regrese pro únik odběratele/pulsu, když se klient odpojí, zatímco ještě
// běží buildAkceStav() (DB round trip). Bez posluchače registrovaného před
// prvním await by 'close' přišlo dřív, než by měl kdo naslouchat, a
// odběratel s intervalem by pak zůstaly viset navždy. Status kódu ověřujeme
// před odpojením, aby test neprošel naprázdno i kdyby routa selhala dřív,
// než se vůbec stihla přihlásit k odběru.
it("odpojení klienta hned po hijacku (ještě během sestavování stavu) odběratele stejně odhlásí", async () => {
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
  expect(res.statusCode).toBe(200);

  controller.abort();
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(hub.subscriberCount(KANAL_AKCE)).toBe(0);
  await app.close();
});

// Regrese pro tutéž věc, ale o okno dřív: klient se odpojí ještě během
// getAktivniAkce() — tedy PŘED hijackem, kde byl posluchač na 'close'
// registrovaný až v předchozí opravě. Bez posluchače zaregistrovaného jako
// úplně první věc v handleru by 'close' přišlo bez naslouchajícího, a
// bail-out větev po hijacku by (bez explicitního uklid()) nechala
// odběratele viset, i kdyby k odběru nakonec vůbec nedošlo.
//
// Odpojení tu simulujeme přímým destroy() zachyceného request.raw místo
// AbortSignalu předaného do inject() — signál totiž zruší request/response
// dřív, než je light-my-request vůbec stihne sestavit a napojit si na ně
// vlastní posluchače chyb, což končí nezachyceným "AbortError" mimo test.
// Reálné destroy() request.raw navíc (stejně jako u skutečného Node http
// serveru) strhne i injectovanou odpověď — to je v pořádku a odpovídá
// realitě (klient zmizel dřív, než cokoli dostal), test proto na výsledek
// inject() nespoléhá a jen ověřuje, že onRequest hook (tedy skutečné
// zpracování requestu) doopravdy proběhl, než jsme odpojili.
it("odpojení klienta ještě před hijackem (během getAktivniAkce) odběratele nenechá viset", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const app = buildServer();
  let zachycenyRaw: { destroy(): void } | undefined;
  app.addHook("onRequest", async (request) => {
    if (request.url === "/api/stream") zachycenyRaw = request.raw;
  });
  await app.ready();

  const resPromise = app.inject({ method: "GET", url: "/api/stream" }).catch(() => null);

  // Nech Fastify doběhnout přes onRequest (request.raw už existuje), ale
  // odpoj dřív, než handler stihne dokončit getAktivniAkce() — reálný DB
  // round trip trvá o řády déle než jeden tick.
  await new Promise((resolve) => setImmediate(resolve));
  expect(zachycenyRaw).toBeDefined(); // dispatch doopravdy proběhl přes handler
  zachycenyRaw!.destroy();

  await resPromise;
  await new Promise((resolve) => setTimeout(resolve, 50));

  expect(hub.subscriberCount(KANAL_AKCE)).toBe(0);
  await app.close();
});

// Odběr musí vzniknout dřív než úvodní stav (jinak broadcast v tomhle okně
// nedorazí nikomu), ale doručení samotné musí počkat, až úvodní stav
// odejde — jinak by prohlížeč na okamžik viděl novější data a hned nato je
// přepsal staršími z právě dokončeného DB dotazu.
it("broadcast doručený během sestavování úvodního stavu se pošle až po něm, ne před ním", async () => {
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
  expect(res.statusCode).toBe(200);

  // V tuhle chvíli handler určitě proběhl přes hub.subscribe (běží
  // synchronně hned po writeHead, bez await mezitím) a čeká na
  // buildAkceStav() — reálný DB round trip trvá o řády déle než jeden tick.
  // Zprávy teď procházejí redakcí (redigujProDivaka čte payload.zapasy) a hub
  // je typovaný na AkceStavPayload, takže testovací marker musí být platný
  // AkceStavPayload — schováme ho do `akce.nazev`, kde ho JSON výstup pozná.
  hub.publish(KANAL_AKCE, {
    akce: { id: akce.id, nazev: "broadcast-behem-snapshotu", stav: "prihlasovani" },
    prihlaseni: [],
    zapasy: [],
  });

  const zpravy = await new Promise<string[]>((resolve, reject) => {
    const prijate: string[] = [];
    const stream = res.stream();
    stream.on("data", (chunk: Buffer) => {
      prijate.push(chunk.toString());
      if (prijate.length === 2) resolve(prijate);
    });
    stream.once("error", reject);
  });

  expect(zpravy[0]).toContain(`"nazev":"večer"`);
  expect(zpravy[1]).toContain("broadcast-behem-snapshotu");

  controller.abort();
  await app.close();
});

it("hub o odběrateli ví a po zavření spojení ho zapomene", async () => {
  const odhlas = hub.subscribe(KANAL_AKCE, () => {});
  expect(hub.subscriberCount(KANAL_AKCE)).toBe(1);
  odhlas();
  expect(hub.subscriberCount(KANAL_AKCE)).toBe(0);
});

// Regrese k záměně redigujProDivaka(payload, divak) za holý payload v SSE routě.
// SSE nese 100 % živého provozu — dřív ho žádný test nekontroloval a taková
// záměna prošla celou sadou zeleně. Test proto čte to, co skutečně odteče na
// drát, ne to, co vrací redakční funkce zavolaná zvlášť.
it("cizímu divákovi neodteče ve streamu heslo ani číslo lobby", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const hraci = ["76561198000000081", "76561198000000082"];
  for (const [i, steamId] of hraci.entries()) {
    await upsertPlayer(steamId, false);
    await savePlayerStats(steamId, { alias: `Hrac${i}`, odehranoHer: i * 10, chyba: null });
    await signUp(akce.id, steamId);
  }
  const zapas = await createZapas(akce.id, "1v1", hraci);
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setLobbyId(zapas.id, "234230181");

  const app = buildServer();
  await app.ready();

  const controller = new AbortController();
  const res = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: controller.signal,
  });
  expect(res.statusCode).toBe(200);

  const payload = await prvniPayload(res.stream());
  const videny = payload.zapasy[0]!;
  expect(videny.heslo).toBe("");
  expect(videny.lobbyId).toBeNull();
  expect(videny.joinUri).toBeNull();
  expect(videny.spectatorUri).toBeNull();
  // Kdyby se redakce vypnula, tenhle zápas by nesl skutečné heslo — ať je vidět,
  // že v neredigované podobě opravdu neprázdné je.
  expect(zapas.heslo).not.toBe("");

  controller.abort();
  await app.close();
});

// Druhá strana téhož: účastník i Rob musí ve streamu své údaje dostat, jinak by
// "redakce" mohla být jen paušální zaslepení všeho.
it("účastník ve streamu heslo i odkaz na připojení dostane, Rob k tomu divácký odkaz", async () => {
  const akce = await createAkce("večer");
  await setAkceStav(akce.id, "prihlasovani");

  const rob = "76561198000000080";
  await upsertPlayer(rob, true);
  const robSid = await createSession(rob);

  const hraci = ["76561198000000081", "76561198000000082"];
  for (const [i, steamId] of hraci.entries()) {
    await upsertPlayer(steamId, false);
    await savePlayerStats(steamId, { alias: `Hrac${i}`, odehranoHer: i * 10, chyba: null });
    await signUp(akce.id, steamId);
  }
  const zapas = await createZapas(akce.id, "1v1", hraci);
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setLobbyId(zapas.id, "234230181");
  const hracSid = await createSession(hraci[0]!);

  const app = buildServer();
  await app.ready();

  const hracCtrl = new AbortController();
  const hracRes = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: hracCtrl.signal,
    cookies: { sid: hracSid },
  });
  const hracuv = (await prvniPayload(hracRes.stream())).zapasy[0]!;
  expect(hracuv.heslo).toBe(zapas.heslo);
  expect(hracuv.joinUri).toBe("aoe2de://0/234230181");
  expect(hracuv.spectatorUri).toBeNull();
  hracCtrl.abort();

  const robCtrl = new AbortController();
  const robRes = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: robCtrl.signal,
    cookies: { sid: robSid },
  });
  const robuv = (await prvniPayload(robRes.stream())).zapasy[0]!;
  expect(robuv.heslo).toBe(zapas.heslo);
  expect(robuv.spectatorUri).toBe("aoe2de://1/234230181");
  robCtrl.abort();

  await app.close();
});

// Přesně to, co se stalo naživo: stránka otevřená během první akce zůstala
// po jejím ukončení viset a založení druhé akce se k ní nikdy nedostalo.
// Uživatel pak četl „Právě neběží žádná akce.“ a zároveň dostával na založení
// další 409 „Ještě běží jiná akce.“ — dvě protichůdné pravdy naráz, obě od
// téhož serveru, a jediné východisko byl ruční refresh.
it("stránka otevřená během první akce dostane i tu druhou, bez obnovy spojení", async () => {
  const prvni = await createAkce("čtvrtek");
  await setAkceStav(prvni.id, "prihlasovani");

  const app = buildServer();
  await app.ready();

  const controller = new AbortController();
  const res = await app.inject({
    method: "GET",
    url: "/api/stream",
    payloadAsStream: true,
    signal: controller.signal,
  });
  const fronta = sberac(res.stream());
  expect((await fronta.ramec(0)).akce?.nazev).toBe("čtvrtek");

  await setAkceStav(prvni.id, "konec");
  await broadcastAkce();
  expect((await fronta.ramec(1)).akce).toBeNull();

  const druha = await createAkce("pátek");
  await broadcastAkce();
  expect((await fronta.ramec(2)).akce?.nazev).toBe("pátek");
  expect((await fronta.ramec(2)).akce?.id).toBe(druha.id);

  controller.abort();
  await app.close();
});
