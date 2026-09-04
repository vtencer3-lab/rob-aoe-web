import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, setAkceStav, signUp } from "../../db/events.js";
import { getZapas } from "../../db/matches.js";
import { closePool, getPool } from "../../db/pool.js";
import { savePlayerStats, upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { buildServer } from "../server.js";

const ROB = "76561198000000070";
const HRACI = ["76561198000000071", "76561198000000072"];
let akceId: number;
let robSid: string;
let hracSid: string;

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;
  await setAkceStav(akceId, "prihlasovani");

  await upsertPlayer(ROB, true);
  robSid = await createSession(ROB);

  for (const [i, steamId] of HRACI.entries()) {
    await upsertPlayer(steamId, false);
    await savePlayerStats(steamId, { alias: `Hrac${i}`, odehranoHer: i * 10, chyba: null });
    await signUp(akceId, steamId);
  }
  hracSid = await createSession(HRACI[0]!);
});

afterAll(async () => {
  await closePool();
});

async function vytvorZapas(app: ReturnType<typeof buildServer>) {
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: robSid },
    payload: { format: "1v1", steamIds: HRACI },
  });
  return res.json().zapas as { id: number };
}

it("běžný hráč nesmí vytvořit zápas", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: hracSid },
    payload: { format: "1v1", steamIds: HRACI },
  });
  expect(res.statusCode).toBe(403);
  await app.close();
});

// Tyhle tři routy jsou admin-only stejně jako vytvoření zápasu, ale jejich
// bránu nic nehlídalo: záměna requireAdmin za requireUser na všech třech
// nechala 78 ze 79 db testů zelených. Kdyby to někdy zregresovalo, mohl by
// kterýkoliv přihlášený účastník přehodit hosta (což zároveň vynuluje lobby_id
// a zabije živý odkaz i Robův Spectate), protlačit stav zápasu nebo zapsat
// výsledek.
it("běžný hráč nesmí měnit stav zápasu", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: hracSid },
    payload: { stav: "vyhlaseny" },
  });
  expect(res.statusCode).toBe(403);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("nachystany");
  await app.close();
});

it("běžný hráč nesmí přehodit hosta zápasu", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const puvodniHost = (await getZapas(zapas.id))!.ucastnici.find((u) => u.jeHost)!.steamId;

  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/host`,
    cookies: { sid: hracSid },
    payload: { steamId: HRACI[0] },
  });
  expect(res.statusCode).toBe(403);
  expect((await getZapas(zapas.id))!.ucastnici.find((u) => u.jeHost)!.steamId).toBe(puvodniHost);
  await app.close();
});

it("běžný hráč nesmí zapsat výsledek zápasu", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/vysledek`,
    cookies: { sid: hracSid },
    payload: { viteznyTym: 1 },
  });
  expect(res.statusCode).toBe(403);
  expect((await getZapas(zapas.id))!.zapas.viteznyTym).toBeNull();
  await app.close();
});

it("špatný počet hráčů na formát vrátí 400 se srozumitelnou hláškou", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: robSid },
    payload: { format: "coop_kings_2v2", steamIds: HRACI },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/4 hráče/);
  await app.close();
});

it("stejný hráč dvakrát v sestavě vrátí 400 se srozumitelnou hláškou", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: robSid },
    payload: { format: "1v1", steamIds: [HRACI[0], HRACI[0]] },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/dvakrát/);
  await app.close();
});

it("Rob vytvoří zápas a vyhlásí ho", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const vyhlaseni = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  expect(vyhlaseni.statusCode).toBe(200);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("vyhlaseny");
  await app.close();
});

// Rob dvojklik na svoje vlastní tlačítko v přímém přenosu udělá dřív nebo
// později. Do teď to znamenalo červený „Něco se pokazilo na serveru.“, protože
// odmítnutý přechod padal jako holá Error na 500.
it("druhé kliknutí na Vyhlásit dostane srozumitelné 409, ne 500", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const prvni = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  expect(prvni.statusCode).toBe(200);

  const druhe = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  expect(druhe.statusCode).toBe(409);
  expect(druhe.json().chyba).toMatch(/už ve stavu „vyhlaseny“ je/);
  await app.close();
});

// Souběh, který se naživo opravdu stává: host odesílá odkaz z lobby a Rob
// mezitím klikne „Hraje se“. Odkaz se uloží, jen přechod se odmítne — hlásit
// hostovi chybu by byla lež o jeho vlastní práci. Aby byl test deterministický,
// otevřeme přesně tohle okno dočasným triggerem, který stav přehodí uvnitř
// téhož UPDATE, kterým se ukládá lobby_id.
it("odkaz uložený těsně před Robovým „Hraje se“ se nehlásí jako chyba", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  const hostSid = await createSession(HRACI[1]!);

  await getPool().query(`
    CREATE FUNCTION pokus_prepni_stav() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN NEW.stav := 'hraje_se'; RETURN NEW; END $$;
    CREATE TRIGGER pokus_prepni_stav BEFORE UPDATE OF lobby_id ON zapas
      FOR EACH ROW EXECUTE FUNCTION pokus_prepni_stav();
  `);
  try {
    const res = await app.inject({
      method: "POST",
      url: `/api/zapas/${zapas.id}/lobby`,
      cookies: { sid: hostSid },
      payload: { odkaz: "aoe2de://0/234230181" },
    });
    expect(res.statusCode).toBe(200);
  } finally {
    await getPool().query(
      "DROP TRIGGER pokus_prepni_stav ON zapas; DROP FUNCTION pokus_prepni_stav()",
    );
  }

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("234230181"); // odkaz opravdu uložený
  expect(nacteny.zapas.stav).toBe("hraje_se"); // přechod odmítnutý, a to je v pořádku
  await app.close();
});

it("host vloží odkaz a zápas se posune", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });

  const hostSid = await createSession(HRACI[1]!); // nejvíc odehraných her
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });

  expect(res.statusCode).toBe(200);
  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("234230181");
  expect(nacteny.zapas.stav).toBe("lobby_otevrena");
  await app.close();
});

it("omylem vložený divácký odkaz dostane vlastní vysvětlení", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  const hostSid = await createSession(HRACI[1]!);

  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://1/234230181" },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/divácký/i);
  await app.close();
});

it("nesmyslný odkaz se odmítne", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "https://example.com" },
  });
  expect(res.statusCode).toBe(400);
  await app.close();
});

it.each(["dohrano", "zruseny"])("do zápasu ve stavu %s se odkaz vložit nedá", async (stav) => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav },
  });

  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  expect(res.statusCode).toBe(409);
  expect((await getZapas(zapas.id))!.zapas.lobbyId).toBeNull();
  await app.close();
});

it("kdo není host, odkaz vložit nesmí", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hracSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  expect(res.statusCode).toBe(403);
  await app.close();
});

it("host potvrdí nachystanou lobby", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/potvrzeni`,
    cookies: { sid: hostSid },
  });
  expect((await getZapas(zapas.id))!.zapas.hostPotvrdil).toBeInstanceOf(Date);
  await app.close();
});

it("potvrzení bez odkazu na lobby se odmítne", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/potvrzeni`,
    cookies: { sid: hostSid },
  });
  expect(res.statusCode).toBe(400);
  expect((await getZapas(zapas.id))!.zapas.hostPotvrdil).toBeNull();
  await app.close();
});

it("nový odkaz na lobby zruší staré potvrzení hosta", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/potvrzeni`,
    cookies: { sid: hostSid },
  });
  expect((await getZapas(zapas.id))!.zapas.hostPotvrdil).toBeInstanceOf(Date);

  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/999999999" },
  });
  expect(res.statusCode).toBe(200);
  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("999999999");
  expect(nacteny.zapas.hostPotvrdil).toBeNull();
  await app.close();
});

it("změna hosta zahodí odkaz i potvrzení", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/potvrzeni`,
    cookies: { sid: hostSid },
  });

  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/host`,
    cookies: { sid: robSid },
    payload: { steamId: HRACI[0] },
  });

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBeNull();
  expect(nacteny.zapas.hostPotvrdil).toBeNull();
  expect(nacteny.ucastnici.find((u) => u.jeHost)!.steamId).toBe(HRACI[0]);
  await app.close();
});

it("účastník si označí kliknutí na připojení", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/pripojeni`,
    cookies: { sid: hracSid },
  });
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.find((u) => u.steamId === HRACI[0])!.kliknulPripojit).toBeInstanceOf(Date);
  await app.close();
});

it("Rob zapíše vítěze", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/vysledek`,
    cookies: { sid: robSid },
    payload: { viteznyTym: 2 },
  });
  expect(res.statusCode).toBe(200);
  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.viteznyTym).toBe(2);
  expect(nacteny.zapas.stav).toBe("dohrano");
  await app.close();
});

// Pozor na jméno: tenhle test kontroluje GET /api/akce, NE SSE stream — tam
// vede vlastní test v stream.db.test.ts. Dřív se jmenoval "…ve streamu…" a
// tvrdil tím pokrytí, které neměl.
// Specifikace §7: nachystaný zápas nikdo kromě Roba nevidí. Skládání dvojic
// naživo na streamu je celý smysl věci — kdyby se sestava objevila lidem na
// obrazovce ve chvíli, kdy ji Rob klikne, byla by pointa pryč. Filtruje to
// redakční hranice na serveru, takže dvojice nejsou ani v odpovědi.
it("nachystaný zápas nevidí ani účastník, jen Rob", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("nachystany");

  const ucastnik = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } });
  expect(ucastnik.json().zapasy).toHaveLength(0);

  const anonym = await app.inject({ method: "GET", url: "/api/akce" });
  expect(anonym.json().zapasy).toHaveLength(0);

  const robuv = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(robuv.json().zapasy).toHaveLength(1);
  expect(robuv.json().zapasy[0].stav).toBe("nachystany");

  // Jakmile ho Rob vyhlásí, účastník ho dostane.
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  const po = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } });
  expect(po.json().zapasy).toHaveLength(1);
  await app.close();
});

it("cizí divák nevidí v GET /api/akce heslo", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const hostSid = await createSession(HRACI[1]!);
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "vyhlaseny" },
  });
  await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/lobby`,
    cookies: { sid: hostSid },
    payload: { odkaz: "aoe2de://0/234230181" },
  });

  const cizi = await app.inject({ method: "GET", url: "/api/akce" });
  const videny = cizi.json().zapasy[0];
  expect(videny.heslo).toBe("");
  expect(videny.lobbyId).toBeNull();

  const robuv = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(robuv.json().zapasy[0].spectatorUri).toBe("aoe2de://1/234230181");
  await app.close();
});
