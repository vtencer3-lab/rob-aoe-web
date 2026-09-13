import { afterAll, beforeEach, expect, it } from "vitest";
import { createAkce, setAkceStav, signUp } from "../../db/events.js";
import { getZapas } from "../../db/matches.js";
import { closePool, getPool } from "../../db/pool.js";
import { savePlayerStats, upsertPlayer } from "../../db/players.js";
import { createSession } from "../../db/sessions.js";
import { buildServer } from "../server.js";
import { sestavaCoop, sestavaKazdyProtiKazdemu } from "../../matches/sestavyProTesty.js";


const ROB = "76561198000000070";
const HRACI = ["76561198000000071", "76561198000000072"];
let akceId: number;
let robSid: string;
let hracSid: string;

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;

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
    payload: { sestava: sestavaKazdyProtiKazdemu(HRACI) },
  });
  return res.json().zapas as { id: number };
}

it("běžný hráč nesmí vytvořit zápas", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: hracSid },
    payload: { sestava: sestavaKazdyProtiKazdemu(HRACI) },
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
    payload: { stav: "zruseny" },
  });
  expect(res.statusCode).toBe(403);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("bezi");
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
    payload: { vitez: { tym: 1 } },
  });
  expect(res.statusCode).toBe(403);
  expect((await getZapas(zapas.id))!.zapas.vitez).toBeNull();
  await app.close();
});

it("neplatná sestava vrátí 400 se srozumitelnou hláškou", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: robSid },
    payload: { sestava: sestavaCoop(HRACI) },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/proti komu/);
  await app.close();
});

it("stejný hráč dvakrát v sestavě vrátí 400 se srozumitelnou hláškou", async () => {
  const app = buildServer();
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/zapas`,
    cookies: { sid: robSid },
    payload: { sestava: sestavaKazdyProtiKazdemu([HRACI[0]!, HRACI[0]!]) },
  });
  expect(res.statusCode).toBe(400);
  expect(res.json().chyba).toMatch(/dvakrát/);
  await app.close();
});

it("Rob smí zápas zrušit", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const zruseni = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "zruseny" },
  });
  expect(zruseni.statusCode).toBe(200);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("zruseny");
  await app.close();
});

// Zrušený zápas, ke kterému se Rob nevrátí, jde odebrat úplně — i s účastníky.
// Jen zrušený: běžící ani dohraný ne, a jen Rob.
it("zrušený zápas jde smazat, běžící ne a běžný hráč vůbec", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const bezici = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}`, cookies: { sid: robSid } });
  expect(bezici.statusCode).toBe(409);

  await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/stav`, cookies: { sid: robSid }, payload: { stav: "zruseny" } });
  const hrac = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}`, cookies: { sid: hracSid } });
  expect(hrac.statusCode).toBe(403);

  const rob = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}`, cookies: { sid: robSid } });
  expect(rob.statusCode).toBe(200);
  expect(await getZapas(zapas.id)).toBeNull();
  const { rows } = await getPool().query("SELECT count(*)::int AS n FROM ucastnik WHERE zapas_id = $1", [zapas.id]);
  expect(rows[0].n).toBe(0);

  const znovu = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}`, cookies: { sid: robSid } });
  expect(znovu.statusCode).toBe(404);
  await app.close();
});

// Dohraný zápas jde zavřít křížkem a zase otevřít; běžící ne, hráč vůbec.
it("dohraný zápas jde zavřít a znovu otevřít, běžící ne", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  const bezici = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zavrit`, cookies: { sid: robSid }, payload: {} });
  expect(bezici.statusCode).toBe(409);

  await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/vysledek`, cookies: { sid: robSid }, payload: { vitez: { tym: 1 } } });
  const hrac = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zavrit`, cookies: { sid: hracSid }, payload: {} });
  expect(hrac.statusCode).toBe(403);

  const zavreni = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zavrit`, cookies: { sid: robSid }, payload: {} });
  expect(zavreni.statusCode).toBe(200);
  let stav = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(stav.json().zapasy[0].zavreny).toBe(true);
  expect(stav.json().zapasy[0].vitez).toEqual({ tym: 1 });

  await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zavrit`, cookies: { sid: robSid }, payload: { zavreny: false } });
  stav = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(stav.json().zapasy[0].zavreny).toBe(false);
  await app.close();
});

// Rob dvojklik na svoje vlastní tlačítko v přímém přenosu udělá dřív nebo
// později. Do teď to znamenalo červený „Něco se pokazilo na serveru.“, protože
// odmítnutý přechod padal jako holá Error na 500.
it("druhé kliknutí na totéž tlačítko dostane srozumitelné 409, ne 500", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const prvni = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "zruseny" },
  });
  expect(prvni.statusCode).toBe(200);

  const druhe = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/stav`,
    cookies: { sid: robSid },
    payload: { stav: "zruseny" },
  });
  expect(druhe.statusCode).toBe(409);
  expect(druhe.json().chyba).toMatch(/už ve stavu „zruseny“ je/);
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

it("host vloží odkaz a ten se uloží, stav zůstává", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

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
  // Že je lobby založená, se pozná podle existence odkazu — zvláštní stav
  // pro to zmizel spolu s tlačítky, která ho hýbala.
  expect(nacteny.zapas.stav).toBe("bezi");
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




it("změna hosta zahodí odkaz", async () => {
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
    url: `/api/zapas/${zapas.id}/host`,
    cookies: { sid: robSid },
    payload: { steamId: HRACI[0] },
  });

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBeNull();
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
    payload: { vitez: { tym: 2 } },
  });
  expect(res.statusCode).toBe(200);
  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.vitez).toEqual({ tym: 2 });
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
// Celá cesta, ne jen jednotka: dřív tu byl mezistav „nachystany“, který zápas
// před ne-adminy skrýval, dokud ho Rob nevyhlásil. Ten krok je pryč — složením
// zápasu je hotovo a všichni ho vidí okamžitě. Tenhle test hlídá právě to a
// zároveň, že se s viditelností neotevřela i tajemství.
it("složený zápas dostane hned účastník i anonym, každý ve své míře", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  expect((await getZapas(zapas.id))!.zapas.stav).toBe("bezi");

  const ucastnik = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } });
  expect(ucastnik.json().zapasy).toHaveLength(1);
  expect(ucastnik.json().zapasy[0].heslo).not.toBe("");

  const anonym = await app.inject({ method: "GET", url: "/api/akce" });
  expect(anonym.json().zapasy).toHaveLength(1);
  expect(anonym.json().zapasy[0].heslo).toBe("");
  expect(anonym.json().zapasy[0].lobbyId).toBeNull();

  const robuv = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(robuv.json().zapasy).toHaveLength(1);
  expect(robuv.json().zapasy[0].stav).toBe("bezi");
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

// „Vyhledat hru“: seznam lobby ze hry se podstrkuje, hledá se podle Steam ID
// hosta zápasu. Host zápasu je ten s víc odehranými hrami, tedy HRACI[1].
function inzerat(lobbyId: string, hostSteamId: string) {
  return {
    lobbyId,
    hostSteamId,
    nazev: "cokoliv",
    maHeslo: true,
    povolujeDivaky: true,
    clenoveSteamIds: [hostSteamId],
    sloty: [{ steamId: hostSteamId, barva: 1 as const, tym: 1 as const, civ: null, pripraven: true }],
    nastaveni: { mapaId: 10875, velikost: 120, rychlost: 2 as const, populace: 200, vitezstvi: 1 as const, cheaty: false },
  };
}

it("účastník vyhledá lobby hosta a číslo se uloží všem", async () => {
  const app = buildServer({
    nactiInzeraty: async () => [inzerat("111", "76561198999999999"), inzerat("504953429", HRACI[1]!)],
  });
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/hledat-lobby`,
    cookies: { sid: hracSid },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ nalezeno: true, lobbyId: "504953429", povolujeDivaky: true });
  expect((await getZapas(zapas.id))!.zapas.lobbyId).toBe("504953429");
  await app.close();
});

it("když lobby v seznamu není, nic se nepřepíše", async () => {
  const app = buildServer({ nactiInzeraty: async () => [inzerat("111", "76561198999999999")] });
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/hledat-lobby`,
    cookies: { sid: robSid },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json()).toMatchObject({ nalezeno: false, lobbyId: null });
  expect((await getZapas(zapas.id))!.zapas.lobbyId).toBeNull();
  await app.close();
});

it("kdo v zápase nehraje a není Rob, hledat nesmí", async () => {
  const cizi = "76561198000000099";
  await upsertPlayer(cizi, false);
  const ciziSid = await createSession(cizi);
  const app = buildServer({ nactiInzeraty: async () => [inzerat("504953429", HRACI[1]!)] });
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/hledat-lobby`,
    cookies: { sid: ciziSid },
  });
  expect(res.statusCode).toBe(403);
  expect((await getZapas(zapas.id))!.zapas.lobbyId).toBeNull();
  await app.close();
});

it("výpadek seznamu ze hry je 502 se srozumitelnou větou, ne 500", async () => {
  const app = buildServer({
    nactiInzeraty: async () => {
      throw new Error("timeout");
    },
  });
  const zapas = await vytvorZapas(app);
  const res = await app.inject({
    method: "POST",
    url: `/api/zapas/${zapas.id}/hledat-lobby`,
    cookies: { sid: hracSid },
  });
  expect(res.statusCode).toBe(502);
  expect(res.json().chyba).toMatch(/ručně/);
  await app.close();
});

// „Zkontrolovat lobby“: porovnání lobby ze hry se sestavou a očekáváním akce.
it("kontrola lobby vrátí fajfky a křížky a nové číslo lobby si uloží", async () => {
  const app = buildServer({
    nactiInzeraty: async () => [
      {
        ...inzerat("504987862", HRACI[1]!),
        sloty: [{ steamId: HRACI[1]!, barva: 2, tym: 2, civ: null, pripraven: true }],
        nastaveni: { mapaId: 10878, velikost: 120, rychlost: 2, populace: 200, vitezstvi: 1, cheaty: false },
      },
    ],
  });
  const zapas = await vytvorZapas(app);
  await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby`, cookies: { sid: robSid }, payload: { mapaId: 10875, populace: 200 } });

  const res = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/kontrola-lobby`, cookies: { sid: hracSid } });
  expect(res.statusCode).toBe(200);
  const telo = res.json() as { nalezeno: boolean; kontroly: { klic: string; stav: string; text: string }[] };
  expect(telo.nalezeno).toBe(true);
  const podle = Object.fromEntries(telo.kontroly.map((k) => [k.klic, k]));
  expect(podle["hraci"]!.stav).toBe("spatne");
  expect(podle["mapa"]).toMatchObject({ stav: "spatne", text: /Black Forest, má být Arabia/ });
  expect(podle["velikost"]!.stav).toBe("ok");
  expect((await getZapas(zapas.id))!.zapas.lobbyId).toBe("504987862");
  await app.close();
});

it("kontrola bez lobby v seznamu vrátí nalezeno=false, cizí hráč 403", async () => {
  const app = buildServer({ nactiInzeraty: async () => [] });
  const zapas = await vytvorZapas(app);
  const res = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/kontrola-lobby`, cookies: { sid: robSid } });
  expect(res.json()).toEqual({ nalezeno: false, kontroly: [] });

  const cizi = "76561198000000099";
  await upsertPlayer(cizi, false);
  const ciziSid = await createSession(cizi);
  const zakazano = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/kontrola-lobby`, cookies: { sid: ciziSid } });
  expect(zakazano.statusCode).toBe(403);
  await app.close();
});

// Rozpracovaná sestava žije u akce: co jeden admin naklikal, druhý vidí ve
// stavu; vytvoření zápasu ji vyprázdní. Jen Rob, jen tvarově platné řádky.
it("rozpracovaná sestava se ukládá u akce a vytvoření zápasu ji vyprázdní", async () => {
  const app = buildServer();
  const sestava = [{ steamId: HRACI[0], tym: 1, barva: 1, civ: 18 }, { steamId: HRACI[1], tym: 2, barva: 2, civ: null }];

  const zakazano = await app.inject({ method: "PUT", url: `/api/akce/${akceId}/skladani`, cookies: { sid: hracSid }, payload: { sestava } });
  expect(zakazano.statusCode).toBe(403);
  const spatne = await app.inject({ method: "PUT", url: `/api/akce/${akceId}/skladani`, cookies: { sid: robSid }, payload: { sestava: [{ steamId: "x", tym: 9, barva: 1 }] } });
  expect(spatne.statusCode).toBe(400);

  const res = await app.inject({ method: "PUT", url: `/api/akce/${akceId}/skladani`, cookies: { sid: robSid }, payload: { sestava } });
  expect(res.statusCode).toBe(200);
  expect(res.json().akce.skladani).toEqual(sestava);
  const stav = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } });
  expect(stav.json().akce.skladani).toEqual(sestava);

  await vytvorZapas(app);
  const po = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(po.json().akce.skladani).toEqual([]);
  await app.close();
});

// „Uložit nastavení lobby“ = snímek živého nastavení; živé se dál mění
// každým kliknutím, snímek jen tímhle tlačítkem.
it("uložení nastavení lobby udělá snímek, který živé změny nepřepíšou", async () => {
  const app = buildServer();
  await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby`, cookies: { sid: robSid }, payload: { populace: 150 } });
  const zakazano = await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby/ulozit`, cookies: { sid: hracSid } });
  expect(zakazano.statusCode).toBe(403);

  const ulozeni = await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby/ulozit`, cookies: { sid: robSid } });
  expect(ulozeni.statusCode).toBe(200);
  expect(ulozeni.json().akce.ulozeneNastaveniLobby).toEqual({ populace: 150 });

  await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby`, cookies: { sid: robSid }, payload: { populace: 300 } });
  const stav = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } });
  expect(stav.json().akce.nastaveniLobby).toEqual({ populace: 300 });
  expect(stav.json().akce.ulozeneNastaveniLobby).toEqual({ populace: 150 });
  await app.close();
});

it("nastavení lobby smí jen Rob a ukládá jen známé klíče", async () => {
  const app = buildServer();
  const zakazano = await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby`, cookies: { sid: hracSid }, payload: { populace: 100 } });
  expect(zakazano.statusCode).toBe(403);
  const res = await app.inject({
    method: "POST",
    url: `/api/akce/${akceId}/nastaveni-lobby`,
    cookies: { sid: robSid },
    payload: { populace: 250, rychlost: 3, nesmysl: 1, mapaId: null, sadaCivilizaci: 2, rezim: 99, primeri: 15, lockTeams: false, turbo: "ano", aiObtiznost: null },
  });
  expect(res.statusCode).toBe(200);
  // rezim 99 a turbo "ano" hra nezná — zahodí se; null = „je to jedno“ projde.
  expect(res.json().akce.nastaveniLobby).toEqual({ populace: 250, rychlost: 3, mapaId: null, sadaCivilizaci: 2, primeri: 15, lockTeams: false, aiObtiznost: null });
  const prazdne = await app.inject({ method: "POST", url: `/api/akce/${akceId}/nastaveni-lobby`, cookies: { sid: robSid }, payload: { nesmysl: 1 } });
  expect(prazdne.statusCode).toBe(400);
  await app.close();
});

// Chat zápasu: účastník i Rob píšou, zpráva přijde v celém stavu s aktuálním
// jménem a barvou slotu; kdo v zápase nehraje, nesmí psát ani číst.
it("chat: účastník a Rob píšou, cizí hráč nesmí, anonym nic nevidí", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const hracova = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zprava`, cookies: { sid: hracSid }, payload: { text: "  jdu tam  " } });
  expect(hracova.statusCode).toBe(200);
  const robova = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zprava`, cookies: { sid: robSid }, payload: { text: "za minutu zakládám" } });
  expect(robova.statusCode).toBe(200);

  const CIZI = "76561198000000073";
  await upsertPlayer(CIZI, false);
  const ciziSid = await createSession(CIZI);
  const cizi = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zprava`, cookies: { sid: ciziSid }, payload: { text: "ahoj" } });
  expect(cizi.statusCode).toBe(403);
  const prazdna = await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zprava`, cookies: { sid: hracSid }, payload: { text: "   " } });
  expect(prazdna.statusCode).toBe(400);

  const ucastnik = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } });
  const zpravy = ucastnik.json().zapasy[0].zpravy as Array<Record<string, unknown>>;
  expect(zpravy.map((z) => z["text"])).toEqual(["jdu tam", "za minutu zakládám"]);
  expect(zpravy[0]).toMatchObject({ steamId: HRACI[0], jeAdmin: false, barva: 1, tym: 1 });
  expect(zpravy[1]).toMatchObject({ steamId: ROB, jeAdmin: true, barva: null, tym: null });

  const anonym = await app.inject({ method: "GET", url: "/api/akce" });
  expect(anonym.json().zapasy[0].zpravy).toEqual([]);
  const ciziCte = await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: ciziSid } });
  expect(ciziCte.json().zapasy[0].zpravy).toEqual([]);
  await app.close();
});

// Ozubené kolečko v režii: nastavení, jméno lobby i sestava se mění jen
// adminovi a jen u běžícího zápasu; změna přijde ve stavu všem.
it("Rob upraví nastavení, jméno lobby i sestavu zápasu; hráč nesmí", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);

  const nastaveni = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/nastaveni`, cookies: { sid: robSid }, payload: { mapaId: 10895, populace: 250 } });
  expect(nastaveni.statusCode).toBe(200);
  const nazev = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/nazev-lobby`, cookies: { sid: robSid }, payload: { nazevLobby: "  ROB-finale " } });
  expect(nazev.statusCode).toBe(200);
  const sestava = await app.inject({
    method: "PUT",
    url: `/api/zapas/${zapas.id}/sestava`,
    cookies: { sid: robSid },
    payload: { sestava: [{ steamId: HRACI[0], tym: 2, barva: 2, civ: null }, { steamId: HRACI[1], tym: 1, barva: 1, civ: null }] },
  });
  expect(sestava.statusCode).toBe(200);

  const stav = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: robSid } })).json();
  expect(stav.zapasy[0].nastaveni).toMatchObject({ mapaId: 10895, populace: 250 });
  expect(stav.zapasy[0].nazevLobby).toBe("ROB-finale");
  expect(stav.zapasy[0].ucastnici.find((u: { steamId: string }) => u.steamId === HRACI[0]).barva).toBe(2);

  for (const url of ["nastaveni", "nazev-lobby", "sestava"]) {
    const hracova = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/${url}`, cookies: { sid: hracSid }, payload: {} });
    expect(hracova.statusCode).toBe(403);
  }
  const prazdne = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/nazev-lobby`, cookies: { sid: robSid }, payload: { nazevLobby: " " } });
  expect(prazdne.statusCode).toBe(400);
  const spatna = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/sestava`, cookies: { sid: robSid }, payload: { sestava: [{ steamId: HRACI[0], tym: 1, barva: 1, civ: null }] } });
  expect(spatna.statusCode).toBe(400);
  await app.close();
});

// Cenzura běží na serveru před uložením; Rob smí zprávu smazat, hráč ne.
it("chat: zakázané slovo se uloží s hvězdičkami a Rob zprávu smaže", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zprava`, cookies: { sid: hracSid }, payload: { text: "ty Buzerante" } });
  let zpravy = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } })).json().zapasy[0].zpravy as Array<{ id: number; text: string }>;
  expect(zpravy[0]!.text).toBe("ty *********");

  const hracova = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}/zprava/${zpravy[0]!.id}`, cookies: { sid: hracSid } });
  expect(hracova.statusCode).toBe(403);
  const robova = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}/zprava/${zpravy[0]!.id}`, cookies: { sid: robSid } });
  expect(robova.statusCode).toBe(200);
  zpravy = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } })).json().zapasy[0].zpravy;
  expect(zpravy).toEqual([]);
  const znovu = await app.inject({ method: "DELETE", url: `/api/zapas/${zapas.id}/zprava/999999`, cookies: { sid: robSid } });
  expect(znovu.statusCode).toBe(404);
  await app.close();
});

// Šipka nahoru: autor přepíše svou zprávu, cizí ne; ve stavu je „upraveno“.
it("chat: autor upraví svou zprávu, cizí zprávu ne", async () => {
  const app = buildServer();
  const zapas = await vytvorZapas(app);
  await app.inject({ method: "POST", url: `/api/zapas/${zapas.id}/zprava`, cookies: { sid: hracSid }, payload: { text: "puvodni" } });
  const id = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } })).json().zapasy[0].zpravy[0].id as number;
  const robova = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/zprava/${id}`, cookies: { sid: robSid }, payload: { text: "cizi" } });
  expect(robova.statusCode).toBe(404);
  const vlastni = await app.inject({ method: "PUT", url: `/api/zapas/${zapas.id}/zprava/${id}`, cookies: { sid: hracSid }, payload: { text: " nova verze " } });
  expect(vlastni.statusCode).toBe(200);
  const zprava = (await app.inject({ method: "GET", url: "/api/akce", cookies: { sid: hracSid } })).json().zapasy[0].zpravy[0];
  expect(zprava).toMatchObject({ id, text: "nova verze", upraveno: true });
  await app.close();
});
