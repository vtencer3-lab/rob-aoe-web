import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createAkce } from "./events.js";
import {
  createZapas,
  getZapas,
  listZapasy,
  oznacKliknutiPripojit,
  setHost,
  setLobbyId,
  setVysledek,
  setZapasStav,
} from "./matches.js";
import { closePool, getPool } from "./pool.js";
import { savePlayerStats, upsertPlayer } from "./players.js";
import { signUp } from "./events.js";

let akceId: number;
const HRACI = ["76561198000000050", "76561198000000051", "76561198000000052", "76561198000000053"];

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  akceId = (await createAkce("večer")).id;
  for (const [i, steamId] of HRACI.entries()) {
    await upsertPlayer(steamId, false);
    await savePlayerStats(steamId, { alias: `Hrac${i}`, odehranoHer: i * 100, chyba: null });
    await signUp(akceId, steamId);
  }
});

afterAll(async () => {
  await closePool();
});

it("vytvoří 1v1 s pořadím, názvem lobby a heslem", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  expect(zapas.poradi).toBe(1);
  expect(zapas.nazevLobby).toBe("ROB-01");
  expect(zapas.heslo).toHaveLength(8);
  expect(zapas.stav).toBe("nachystany");
  expect(zapas.lobbyId).toBeNull();
});

it("čísluje zápasy po sobě", async () => {
  await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  const druhy = await createZapas(akceId, "1v1", HRACI.slice(2, 4));
  expect(druhy.poradi).toBe(2);
  expect(druhy.nazevLobby).toBe("ROB-02");
});

it("Coop Kings dá dvojicím sdílenou barvu", async () => {
  const zapas = await createZapas(akceId, "coop_kings_2v2", HRACI);
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici).toHaveLength(4);
  expect(ucastnici[0]!.barva).toBe(ucastnici[1]!.barva);
  expect(ucastnici[2]!.barva).toBe(ucastnici[3]!.barva);
  expect(ucastnici[0]!.barva).not.toBe(ucastnici[2]!.barva);
});

it("hostem je nejzkušenější hráč", async () => {
  const zapas = await createZapas(akceId, "coop_kings_2v2", HRACI);
  const { ucastnici } = (await getZapas(zapas.id))!;
  const host = ucastnici.find((u) => u.jeHost)!;
  expect(host.steamId).toBe(HRACI[3]);
});

it("účastníci nesou jméno ve hře", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.map((u) => u.alias)).toEqual(["Hrac0", "Hrac1"]);
});

it("odmítne hráče, který se mezitím odhlásil", async () => {
  await getPool().query("UPDATE prihlaska SET stav = 'odhlasen' WHERE steam_id = $1", [HRACI[1]]);
  await expect(createZapas(akceId, "1v1", HRACI.slice(0, 2))).rejects.toThrow(/není přihlášený/i);
});

it("neúspěšné vytvoření nezanechá poloviční zápas", async () => {
  await getPool().query("UPDATE prihlaska SET stav = 'odhlasen' WHERE steam_id = $1", [HRACI[1]]);
  await expect(createZapas(akceId, "1v1", HRACI.slice(0, 2))).rejects.toThrow();
  expect(await listZapasy(akceId)).toHaveLength(0);
});

it("odmítne špatný počet hráčů", async () => {
  await expect(createZapas(akceId, "coop_kings_2v2", HRACI.slice(0, 2))).rejects.toThrow(/4 hráče/);
});

it("uloží číslo lobby a posune stav", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setLobbyId(zapas.id, "234230181");
  await setZapasStav(zapas.id, "lobby_otevrena", "host");

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("234230181");
  expect(nacteny.zapas.stav).toBe("lobby_otevrena");
});

it("host nesmí zapsat výsledek", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setZapasStav(zapas.id, "lobby_otevrena", "host");
  await setZapasStav(zapas.id, "hraje_se", "host");
  await expect(setZapasStav(zapas.id, "dohrano", "host")).rejects.toThrow(/nesmí/);
});

it("oprava z dohráno zpět na hraje_se zruší časovou známku konce", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setZapasStav(zapas.id, "vyhlaseny", "admin");
  await setZapasStav(zapas.id, "lobby_otevrena", "host");
  await setZapasStav(zapas.id, "hraje_se", "host");
  await setZapasStav(zapas.id, "dohrano", "admin");
  const { rows: predOpravou } = await getPool().query<{ konec: Date | null }>(
    "SELECT konec FROM zapas WHERE id = $1",
    [zapas.id],
  );
  expect(predOpravou[0]!.konec).not.toBeNull();

  await setZapasStav(zapas.id, "hraje_se", "admin");
  const { rows: poOprave } = await getPool().query<{ konec: Date | null }>(
    "SELECT konec FROM zapas WHERE id = $1",
    [zapas.id],
  );
  expect(poOprave[0]!.konec).toBeNull();
});

it("změna hosta zahodí staré číslo lobby", async () => {
  const zapas = await createZapas(akceId, "coop_kings_2v2", HRACI);
  await setLobbyId(zapas.id, "234230181");
  await setHost(zapas.id, HRACI[0]!);

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBeNull();
  expect(nacteny.ucastnici.filter((u) => u.jeHost).map((u) => u.steamId)).toEqual([HRACI[0]]);
});

it("setHost odmítne hráče, který není účastníkem, a zachová hosta i lobby_id", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setLobbyId(zapas.id, "234230181");
  const pred = (await getZapas(zapas.id))!;
  const puvodniHost = pred.ucastnici.find((u) => u.jeHost)!.steamId;

  await expect(setHost(zapas.id, HRACI[2]!)).rejects.toThrow(/není účastníkem/);

  const po = (await getZapas(zapas.id))!;
  expect(po.zapas.lobbyId).toBe("234230181");
  expect(po.ucastnici.find((u) => u.jeHost)!.steamId).toBe(puvodniHost);
});

it("setZapasStav odmítne zápis, pokud stav mezitím změnil jiný aktér", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setZapasStav(zapas.id, "vyhlaseny", "admin");

  const pool = getPool();
  const puvodniQuery = pool.query.bind(pool);
  let zasazeno = false;
  const spy = vi
    .spyOn(pool, "query")
    .mockImplementation(async (text: string, params?: unknown[]) => {
      if (!zasazeno && text.includes("UPDATE zapas SET stav")) {
        zasazeno = true;
        // Simulace souběhu: mezi ověřením přechodu (SELECT uvnitř getZapas) a jeho
        // zápisem (tento UPDATE) stihne jiný aktér zápas posunout jinam.
        await puvodniQuery("UPDATE zapas SET stav = 'zruseny' WHERE id = $1", [zapas.id]);
      }
      return puvodniQuery(text, params);
    });

  try {
    await expect(setZapasStav(zapas.id, "lobby_otevrena", "host")).rejects.toThrow(
      /mezitím změnil/,
    );
  } finally {
    spy.mockRestore();
  }

  expect((await getZapas(zapas.id))!.zapas.stav).toBe("zruseny");
});

it("zaznamená kliknutí na připojení", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await oznacKliknutiPripojit(zapas.id, HRACI[0]!);
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.find((u) => u.steamId === HRACI[0])!.kliknulPripojit).toBeInstanceOf(Date);
  expect(ucastnici.find((u) => u.steamId === HRACI[1])!.kliknulPripojit).toBeNull();
});

it("uloží vítězný tým", async () => {
  const zapas = await createZapas(akceId, "1v1", HRACI.slice(0, 2));
  await setVysledek(zapas.id, 2);
  expect((await getZapas(zapas.id))!.zapas.viteznyTym).toBe(2);
});

it("neznámý zápas vrátí null", async () => {
  expect(await getZapas(9999)).toBeNull();
});
