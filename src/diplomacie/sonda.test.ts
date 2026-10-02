import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { rozeberScenar } from "./rozbor.js";
import { pribalSondu } from "./sonda.js";

const LLC = await readFile(new URL("./fixtures/LLC.aoe2scenario", import.meta.url));

/** Přibalení potřebuje Python s AoE2ScenarioParser; bez něj se sada přeskočí s jasnou hláškou. */
function maPython(): boolean {
  try {
    execFileSync(config.python, ["-c", "import AoE2ScenarioParser, PIL"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!maPython())("sonda v LLC (vyžaduje Python s AoE2ScenarioParser)", () => {
  it("označí 42 triggerů přidělení cíle a vypíše 42 cílů: 6 druhů × 7 hráčů, GM žádný", async () => {
    const v = await pribalSondu(LLC);
    if (!v.ok) throw new Error(v.chyba);
    expect(v.sonda.oznaceno).toBe(42);
    expect(v.sonda.chyba).toBeNull();
    expect(v.sonda.cile).toHaveLength(42);
    // Šedá (slot 7) je GM a cíl nedostává.
    expect([...new Set(v.sonda.cile.map((c) => c.slot))].sort()).toEqual([1, 2, 3, 4, 5, 6, 8]);
    for (const slot of [1, 2, 3, 4, 5, 6, 8]) {
      expect(
        v.sonda.cile
          .filter((c) => c.slot === slot)
          .map((c) => c.limit)
          .sort((a, b) => a - b),
      ).toEqual([5, 15, 99, 150, 650, 900]);
    }
    // Každý cíl má vlastní počitadlo — podle něj se pozná, kdo co dostal.
    expect(new Set(v.sonda.cile.map((c) => c.promenna)).size).toBe(42);
    expect(v.sonda.cile.find((c) => c.slot === 1 && c.limit === 650)).toEqual({ promenna: 15, slot: 1, text: "zabito : {} /650 jednotek", limit: 650 });
    expect(v.sonda.cile.find((c) => c.slot === 1 && c.limit === 5)).toEqual({ promenna: 13, slot: 1, text: "{} /5 prodanych reliku", limit: 5 });
  }, 120_000);

  it("kopie se sondou je zase čitelný scénář se stejnými pravidly a jiným obsahem", async () => {
    const v = await pribalSondu(LLC);
    if (!v.ok) throw new Error(v.chyba);
    expect(v.soubor.equals(LLC)).toBe(false);
    const [puvodni, kopie] = await Promise.all([rozeberScenar(LLC), rozeberScenar(v.soubor)]);
    if (!puvodni.ok || !kopie.ok) throw new Error("rozbor selhal");
    expect(kopie.rozbor).toEqual(puvodni.rozbor);
  }, 240_000);

  it("scénář, který sondu už má, se podruhé neinstrumentuje", async () => {
    const prvni = await pribalSondu(LLC);
    if (!prvni.ok) throw new Error(prvni.chyba);
    const druhy = await pribalSondu(prvni.soubor);
    expect(druhy).toEqual({ ok: false, chyba: "ValueError: scénář už sondu obsahuje — nahraj originál bez sondy" });
  }, 240_000);

  it("rozbitý soubor a limit času jsou chyba, ne výjimka", async () => {
    expect((await pribalSondu(Buffer.concat([LLC.subarray(0, 4), Buffer.alloc(100)]))).ok).toBe(false);
    expect(await pribalSondu(LLC, { limitMs: 1 })).toEqual({ ok: false, chyba: "Krok sondy trval déle než 0 s a byl ukončen." });
  }, 120_000);

  // Parser při zápisu scénáře XS nevaliduje (binárka xs-check je pro glibc a
  // v produkčním obrazu Alpine se nespustí) — kód sondy proto hlídá tenhle test.
  it("sonda.xs projde validátorem xs-check a je čisté ASCII", async () => {
    const vystup = execFileSync(config.python, [join(import.meta.dirname, "sonda.py"), "--over"], { encoding: "utf8" });
    expect(JSON.parse(vystup)).toEqual({ ok: true });
    const xs = await readFile(new URL("./sonda.xs", import.meta.url));
    expect([...xs].every((b) => b < 128)).toBe(true);
    expect(xs.toString("ascii")).toContain("xsWriteInt(3);");
  }, 60_000);
});
