import { afterAll, beforeEach, expect, it } from "vitest";
import { signUp } from "../db/events.js";
import { nahradSestavu } from "../db/matches.js";
import { closePool, getPool, withTransaction } from "../db/pool.js";
import { upsertPlayer } from "../db/players.js";
import { ROZBOR } from "../shared/diplomacie/fixtures.js";
import { losujRole } from "../shared/diplomacie/los.js";
import {
  aktivujVerzi,
  getAktivniVerze,
  getDiploZapas,
  getSouborVerze,
  listVerzi,
  najdiVerziPodleSha,
  setNastupce,
  setStavDiplo,
  ulozRole,
  ulozVerziScenare,
  upravRoli,
  vratNaPripravu,
  zalozDiploZapas,
} from "./db.js";
import { zapasOsmi } from "./testPomocnici.js";

beforeEach(async () => {
  await getPool().query("TRUNCATE player, akce CASCADE");
});

afterAll(async () => {
  await closePool();
});

it("první verze s rozborem se aktivuje sama, další ne; bez rozboru aktivovat nejde", async () => {
  await upsertPlayer("autor", false);
  const prvni = await ulozVerziScenare({ jmenoSouboru: "a.aoe2scenario", sha256: "1", data: Buffer.from("x"), rozbor: ROZBOR, chybaRozboru: null, minimapa: Buffer.from("m"), nahralHracId: "autor", poznamka: null });
  const druha = await ulozVerziScenare({ jmenoSouboru: "b.aoe2scenario", sha256: "2", data: Buffer.from("y"), rozbor: ROZBOR, chybaRozboru: null, minimapa: Buffer.from("m"), nahralHracId: "autor", poznamka: "v2" });
  const vadna = await ulozVerziScenare({ jmenoSouboru: "c.aoe2scenario", sha256: "3", data: Buffer.from("z"), rozbor: null, chybaRozboru: "ValueError: x", minimapa: null, nahralHracId: "autor", poznamka: null });
  expect(prvni.aktivovana).toBe(true);
  expect(druha.aktivovana).toBe(false);
  expect((await getAktivniVerze())?.id).toBe(prvni.id);
  await aktivujVerzi(druha.id);
  expect((await getAktivniVerze())?.id).toBe(druha.id);
  await expect(aktivujVerzi(vadna.id)).rejects.toThrow("Verze bez rozboru se nedá aktivovat.");
  expect((await listVerzi()).map((v) => v.id)).toEqual([vadna.id, druha.id, prvni.id]);
  expect(await najdiVerziPodleSha("2")).toBe(druha.id);
  expect((await getSouborVerze(druha.id))?.data.toString()).toBe("y");
});

it("zápas si otiskne aktivní verzi a role se ukládají i mažou", async () => {
  await upsertPlayer("autor", false);
  const { id: scenarId } = await ulozVerziScenare({ jmenoSouboru: "a.aoe2scenario", sha256: "1", data: Buffer.from("x"), rozbor: ROZBOR, chybaRozboru: null, minimapa: null, nahralHracId: "autor", poznamka: null });
  const { zapas } = await zapasOsmi("klasicky");
  await withTransaction((c) => zalozDiploZapas(c, zapas.id));
  expect(await getDiploZapas(zapas.id)).toMatchObject({ gmHracId: "h7", stav: "priprava", scenarId, nastupceHracId: null, role: [] });

  await setNastupce(zapas.id, "h1");
  const role = losujRole(["h1", "h2", "h3", "h4", "h5", "h6", "h8"], "h1", () => 0);
  await ulozRole(zapas.id, role, "losovano");
  expect((await getDiploZapas(zapas.id))?.role).toEqual(role);
  await setStavDiplo(zapas.id, "rozeslano");
  await upravRoli(zapas.id, { ...role[1]!, upravenoPoRozeslani: true });
  expect((await getDiploZapas(zapas.id))?.role[1]?.upravenoPoRozeslani).toBe(true);

  await vratNaPripravu(zapas.id);
  expect(await getDiploZapas(zapas.id)).toMatchObject({ stav: "priprava", nastupceHracId: null, role: [] });
});

it("GM je vždy ten, kdo sedí na šedé — i po výměně v sestavě", async () => {
  const { zapas, sestava } = await zapasOsmi("klasicky");
  await withTransaction((c) => zalozDiploZapas(c, zapas.id));
  await upsertPlayer("novyGm", false);
  await signUp(zapas.akceId, "novyGm");
  await nahradSestavu(zapas.id, sestava.map((s) => (s.barva === 7 ? { ...s, hracId: "novyGm" } : s)));
  expect((await getDiploZapas(zapas.id))?.gmHracId).toBe("novyGm");
});

it("smazání zápasu smaže i Diplomacii", async () => {
  const { zapas } = await zapasOsmi("klasicky");
  await withTransaction((c) => zalozDiploZapas(c, zapas.id));
  await getPool().query("DELETE FROM zapas WHERE id = $1", [zapas.id]);
  expect(await getDiploZapas(zapas.id)).toBeNull();
});
