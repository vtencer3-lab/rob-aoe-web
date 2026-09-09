import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { createAkce, setNastaveniLobby } from "./events.js";
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
import { sestavaCoop, sestavaKazdyProtiKazdemu } from "../matches/sestavyProTesty.js";

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
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  expect(zapas.poradi).toBe(1);
  expect(zapas.nazevLobby).toBe("ROB-01");
  expect(zapas.heslo).toMatch(/^[0-9]{4}$/);
  expect(zapas.stav).toBe("bezi");
  expect(zapas.lobbyId).toBeNull();
});

it("čísluje zápasy po sobě", async () => {
  await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  const druhy = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(2, 4)));
  expect(druhy.poradi).toBe(2);
  expect(druhy.nazevLobby).toBe("ROB-02");
});

it("Coop Kings dá dvojicím sdílenou barvu", async () => {
  const zapas = await createZapas(akceId, sestavaCoop(HRACI));
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici).toHaveLength(4);
  expect(ucastnici[0]!.barva).toBe(ucastnici[1]!.barva);
  expect(ucastnici[2]!.barva).toBe(ucastnici[3]!.barva);
  expect(ucastnici[0]!.barva).not.toBe(ucastnici[2]!.barva);
});

it("hostem je nejzkušenější hráč", async () => {
  const zapas = await createZapas(akceId, sestavaCoop(HRACI));
  const { ucastnici } = (await getZapas(zapas.id))!;
  const host = ucastnici.find((u) => u.jeHost)!;
  expect(host.steamId).toBe(HRACI[3]);
});

it("účastníci nesou jméno ve hře", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.map((u) => u.alias)).toEqual(["Hrac0", "Hrac1"]);
});

it("odmítne hráče, který se mezitím odhlásil", async () => {
  await getPool().query("UPDATE prihlaska SET stav = 'odhlasen' WHERE steam_id = $1", [HRACI[1]]);
  await expect(createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)))).rejects.toThrow(/není přihlášený/i);
});

it("neúspěšné vytvoření nezanechá poloviční zápas", async () => {
  await getPool().query("UPDATE prihlaska SET stav = 'odhlasen' WHERE steam_id = $1", [HRACI[1]]);
  await expect(createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)))).rejects.toThrow();
  expect(await listZapasy(akceId)).toHaveLength(0);
});

it("odmítne špatný počet hráčů", async () => {
  await expect(createZapas(akceId, sestavaCoop(HRACI.slice(0, 2)))).rejects.toThrow(/proti komu/);
});

it("uložení čísla lobby stavem nehýbe — o založené lobby mluví sám odkaz", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  await setLobbyId(zapas.id, "234230181");

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBe("234230181");
  expect(nacteny.zapas.stav).toBe("bezi");
});


// Hostovi po zrušení mezistavů nepatří žádný přechod — smí jedinou věc, vložit
// odkaz do lobby, a tu hlídá routa, ne stavový automat. Že se stav zápasu
// nedá měnit nikým než Robem, ověřuje test „běžný hráč nesmí měnit stav
// zápasu“ v src/http/routes/matches.db.test.ts.

// Rob dostane jen tři tlačítka, ale překliknuté „Vyhrál tým 1“ musí jít vrátit
// — a s ním i časová známka konce, na které bude stát budoucí statistika.
it("vrácení dohraného zápasu zpět do běhu zruší časovou známku konce", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  await setZapasStav(zapas.id, "dohrano");
  const { rows: predOpravou } = await getPool().query<{ konec: Date | null }>(
    "SELECT konec FROM zapas WHERE id = $1",
    [zapas.id],
  );
  expect(predOpravou[0]!.konec).not.toBeNull();

  await setZapasStav(zapas.id, "bezi");
  const { rows: poOprave } = await getPool().query<{ konec: Date | null }>(
    "SELECT konec FROM zapas WHERE id = $1",
    [zapas.id],
  );
  expect(poOprave[0]!.konec).toBeNull();
});

it("změna hosta zahodí staré číslo lobby", async () => {
  const zapas = await createZapas(akceId, sestavaCoop(HRACI));
  await setLobbyId(zapas.id, "234230181");
  await setHost(zapas.id, HRACI[0]!);

  const nacteny = (await getZapas(zapas.id))!;
  expect(nacteny.zapas.lobbyId).toBeNull();
  expect(nacteny.ucastnici.filter((u) => u.jeHost).map((u) => u.steamId)).toEqual([HRACI[0]]);
});

it("setHost odmítne hráče, který není účastníkem, a zachová hosta i lobby_id", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  await setLobbyId(zapas.id, "234230181");
  const pred = (await getZapas(zapas.id))!;
  const puvodniHost = pred.ucastnici.find((u) => u.jeHost)!.steamId;

  await expect(setHost(zapas.id, HRACI[2]!)).rejects.toThrow(/není účastníkem/);

  const po = (await getZapas(zapas.id))!;
  expect(po.zapas.lobbyId).toBe("234230181");
  expect(po.ucastnici.find((u) => u.jeHost)!.steamId).toBe(puvodniHost);
});

it("setZapasStav odmítne zápis, pokud stav mezitím změnil někdo jiný", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));

  const pool = getPool();
  const puvodniQuery = pool.query.bind(pool);
  let zasazeno = false;
  const spy = vi
    .spyOn(pool, "query")
    .mockImplementation(async (text: string, params?: unknown[]) => {
      if (!zasazeno && text.includes("UPDATE zapas SET stav")) {
        zasazeno = true;
        // Simulace souběhu: mezi ověřením přechodu (SELECT uvnitř getZapas) a jeho
        // zápisem (tento UPDATE) stihne někdo jiný zápas posunout jinam.
        await puvodniQuery("UPDATE zapas SET stav = 'zruseny' WHERE id = $1", [zapas.id]);
      }
      return puvodniQuery(text, params);
    });

  try {
    await expect(setZapasStav(zapas.id, "dohrano")).rejects.toThrow(/mezitím změnil/);
  } finally {
    spy.mockRestore();
  }

  expect((await getZapas(zapas.id))!.zapas.stav).toBe("zruseny");
});

it("zaznamená kliknutí na připojení", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  await oznacKliknutiPripojit(zapas.id, HRACI[0]!);
  const { ucastnici } = (await getZapas(zapas.id))!;
  expect(ucastnici.find((u) => u.steamId === HRACI[0])!.kliknulPripojit).toBeInstanceOf(Date);
  expect(ucastnici.find((u) => u.steamId === HRACI[1])!.kliknulPripojit).toBeNull();
});

it("uloží vítězný tým", async () => {
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));
  await setVysledek(zapas.id, { tym: 2 });
  expect((await getZapas(zapas.id))!.zapas.vitez).toEqual({ tym: 2 });
});

it("neznámý zápas vrátí null", async () => {
  expect(await getZapas(9999)).toBeNull();
});

// Účet bez jediné hodnocené hry nemá ve Worlds Edge alias, takže by v sestavě
// zápasu zbylo syrové 64bitové Steam ID — soupiska přitom vedle ukazuje jméno
// ze Steamu. Sestava proto musí steamName nést taky.
it("účastník nese steamName, aby se dal pojmenovat i bez aliasu ze žebříčku", async () => {
  const bezAliasu = "76561199091641101";
  await upsertPlayer(bezAliasu, false);
  await savePlayerStats(bezAliasu, { alias: null, steamName: "TibbarZmr", chyba: null });
  await signUp(akceId, bezAliasu);

  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu([HRACI[0]!, bezAliasu]));
  const [zaznam] = await listZapasy(akceId);
  const host = zaznam!.ucastnici.find((u) => u.steamId === bezAliasu)!;

  expect(host.alias).toBeNull();
  expect(host.steamName).toBe("TibbarZmr");
  expect(zapas.poradi).toBe(1);
});

// ---- Otisk pro archiv -------------------------------------------------------
// Nastavení lobby žije na akci a přepisuje se každým kliknutím, ELO hráče se
// přepisuje stažením statistik. Bez otisku by u loňského zápasu svítila dnešní
// čísla a nešlo by zjistit, na jaké mapě se hrál.

it("zápas si obtiskne nastavení lobby a ELO hráčů", async () => {
  await savePlayerStats(HRACI[0]!, { alias: "A", steamName: "A", elo1v1: 1234, eloNejvyssi: 1300, odehranoHer: 10, chyba: null });
  await setNastaveniLobby(akceId, { location: "Arabia", population: 200 });

  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));

  const { rows } = await getPool().query<{ nastaveni: Record<string, unknown> }>(
    "SELECT nastaveni FROM zapas WHERE id = $1",
    [zapas.id],
  );
  expect(rows[0]?.nastaveni).toMatchObject({ location: "Arabia", population: 200 });

  const { rows: ucastnici } = await getPool().query<{ steam_id: string; elo_pri_zapasu: number | null }>(
    "SELECT steam_id, elo_pri_zapasu FROM ucastnik WHERE zapas_id = $1 ORDER BY steam_id",
    [zapas.id],
  );
  const otisk = new Map(ucastnici.map((u) => [u.steam_id, u.elo_pri_zapasu]));
  expect(otisk.get(HRACI[0]!)).toBe(1234);
  expect(otisk.get(HRACI[1]!)).toBeNull();
});

// Otisk je snímek, ne odkaz: pozdější změna nastavení akce se do už založeného
// zápasu nesmí promítnout.
it("pozdější změna nastavení akce zápasem nehne", async () => {
  await setNastaveniLobby(akceId, { location: "Arabia" });
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI.slice(0, 2)));

  await setNastaveniLobby(akceId, { location: "Black Forest" });

  const { rows } = await getPool().query<{ nastaveni: Record<string, unknown> }>(
    "SELECT nastaveni FROM zapas WHERE id = $1",
    [zapas.id],
  );
  expect(rows[0]?.nastaveni).toMatchObject({ location: "Arabia" });
});
