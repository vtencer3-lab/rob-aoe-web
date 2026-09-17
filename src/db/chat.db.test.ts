import { afterAll, beforeEach, expect, it } from "vitest";
import { listZpravy, pridejZpravu } from "./chat.js";
import { createAkce, signUp } from "./events.js";
import { createZapas } from "./matches.js";
import { closePool, getPool } from "./pool.js";
import { upsertPlayer } from "./players.js";
import { sestavaKazdyProtiKazdemu } from "../matches/sestavyProTesty.js";

const HRACI = ["76561198000000090", "76561198000000091"];
let akceId: number;

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
  // Lhůta je globální (migrace 024) a TRUNCATE ji nevrátí — jinak by test
  // dědil hodnotu z jiného souboru.
  await getPool().query("UPDATE nastaveni_webu SET lhuta_aktivity_minut = 15");
  akceId = (await createAkce("večer")).id;
  for (const s of HRACI) {
    await upsertPlayer(s, false);
    await signUp(akceId, s);
  }
});

afterAll(async () => {
  await closePool();
});

// Do stavu jde jen posledních N zpráv na zápas, od nejstarší; starší zůstávají
// v databázi. Každý zápas má vlastní okno.
it("vrátí posledních N zpráv každého zápasu, od nejstarší", async () => {
  const prvni = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI));
  const druhy = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI));
  for (let i = 1; i <= 4; i++) await pridejZpravu(prvni.id, HRACI[0]!, `a${i}`);
  await pridejZpravu(druhy.id, HRACI[1]!, "b1");

  const okno = await listZpravy(akceId, 3);
  expect(okno.get(prvni.id)!.map((z) => z.text)).toEqual(["a2", "a3", "a4"]);
  expect(okno.get(druhy.id)!.map((z) => z.text)).toEqual(["b1"]);
  expect(okno.get(druhy.id)![0]).toMatchObject({ hracId: HRACI[1], tym: 2, barva: 2, jeAdmin: false });
});

// Cenzura běží v db vrstvě a pamatuje si originál; zpětná cenzura dožene
// zprávy uložené před rozšířením seznamu.
// Odpověď na zprávu (migrace 026): nese náhled původní; po smazání původní
// zůstane bez náhledu; odkaz mimo zápas se zahodí.
it("odpověď nese původní zprávu a přežije její smazání bez náhledu", async () => {
  const { smazZpravu } = await import("./chat.js");
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI));
  await pridejZpravu(zapas.id, HRACI[0]!, "jdeme?");
  const puvodni = (await listZpravy(akceId)).get(zapas.id)![0]!;
  await pridejZpravu(zapas.id, HRACI[1]!, "jo", puvodni.id);
  await pridejZpravu(zapas.id, HRACI[1]!, "mimo", 999_999);
  let zpravy = (await listZpravy(akceId)).get(zapas.id)!;
  expect(zpravy[1]!.odpovedNa).toEqual({ id: puvodni.id, jmeno: expect.any(String), text: "jdeme?" });
  expect(zpravy[2]!.odpovedNa).toBeNull();
  await smazZpravu(zapas.id, puvodni.id);
  zpravy = (await listZpravy(akceId)).get(zapas.id)!;
  expect(zpravy[0]!.text).toBe("jo");
  expect(zpravy[0]!.odpovedNa).toBeNull();
});

it("schová zakázané slovo, originál nechá v text_puvodni a zpětně docenzuruje", async () => {
  const { cenzurujZpetne } = await import("./chat.js");
  const zapas = await createZapas(akceId, sestavaKazdyProtiKazdemu(HRACI));
  await pridejZpravu(zapas.id, HRACI[0]!, "ty buzerante");
  await pridejZpravu(zapas.id, HRACI[0]!, "ahoj");
  const { rows } = await getPool().query<{ text: string; text_puvodni: string | null }>("SELECT text, text_puvodni FROM zprava WHERE zapas_id = $1 ORDER BY id", [zapas.id]);
  expect(rows[0]).toEqual({ text: "ty *********", text_puvodni: "ty buzerante" });
  expect(rows[1]).toEqual({ text: "ahoj", text_puvodni: null });

  // Zpráva „z doby před seznamem“: uložená natvrdo, projde až zpětnou cenzurou.
  await getPool().query("INSERT INTO zprava (zapas_id, hrac_id, text) VALUES ($1, $2, 'negroidovy')", [zapas.id, HRACI[1]!]);
  expect(await cenzurujZpetne()).toBe(1);
  const { rows: po } = await getPool().query<{ text: string; text_puvodni: string | null }>("SELECT text, text_puvodni FROM zprava WHERE zapas_id = $1 ORDER BY id DESC LIMIT 1", [zapas.id]);
  expect(po[0]).toEqual({ text: "**********", text_puvodni: "negroidovy" });
  expect(await cenzurujZpetne()).toBe(0);
});
