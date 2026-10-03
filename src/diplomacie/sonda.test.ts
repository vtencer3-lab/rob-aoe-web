import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { GM_BARVA } from "../shared/diplomacie/sestava.js";
import { rozeberScenar } from "./rozbor.js";
import { pribalSondu, revizeSondy } from "./sonda.js";

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
    // Úplné rozdání (6 cílů pro každého ze 7 hráčů) — bez varování.
    expect(v.sonda.varovani).toEqual([]);
    // Otisk kódu sondy počítá Python i server stejně; podle něj správa pozná zastaralou kopii.
    expect(v.sonda.revize).toMatch(/^[0-9a-f]{12}$/);
    expect(v.sonda.revize).toBe(revizeSondy());
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
    expect(await pribalSondu(LLC, { limitMs: 1 })).toEqual({ ok: false, chyba: "Krok sondy trval déle než 1 ms a byl ukončen." });
  }, 120_000);

  // Parser při zápisu scénáře XS nevaliduje (binárka xs-check je pro glibc a
  // v produkčním obrazu Alpine se nespustí) — kód sondy proto hlídá tenhle test.
  it("sonda.xs projde validátorem xs-check a je čisté ASCII", async () => {
    const vystup = execFileSync(config.python, [join(import.meta.dirname, "sonda.py"), "--over"], { encoding: "utf8" });
    expect(JSON.parse(vystup)).toEqual({ ok: true });
    const xs = await readFile(new URL("./sonda.xs", import.meta.url));
    expect([...xs].every((b) => b < 128)).toBe(true);
    expect(xs.toString("ascii")).toContain("xsWriteInt(114519637 * 10);");
  }, 60_000);
});

// Sonda píše soubor na každém počítači ve hře, hráčům i divákům: XS diváka
// od hráče nerozezná (u diváka vrací xsUnsyncGetLocalPlayerId sledovaného
// hráče) a data se mají sbírat i z PC diváka. Rozhodnutí uživatele
// 2. 10. 2026 — komunitní hra, bez šifrování. Bez Pythonu, hlídá se text sondy.
describe("sonda.xs píše na každém počítači", () => {
  it("zápis souboru není podmíněný místním hráčem", async () => {
    const xs = (await readFile(new URL("./sonda.xs", import.meta.url))).toString("ascii").replace(/\r\n/g, "\n");
    expect(xs).not.toMatch(/^\s*if \(xsUnsyncGetLocalPlayerId/m);
    expect(xs).not.toContain(`xsGetWorldPlayerId(${GM_BARVA})`);
    // Soubor se otevírá přímo ve funkci zápisu, ne v žádném bloku.
    expect(xs).toMatch(/\n {2}xsCreateFile\(false\);\n/);
    expect(xs).toMatch(/xsCloseFile\(\);\n\}\n/);
    // Rozložení se nezměnilo — formát zůstává 3.
    expect(xs).toContain("xsWriteInt(114519637 * 10);");
  });

  it("revize sondy je otisk jejího textu", () => {
    expect(revizeSondy()).toMatch(/^[0-9a-f]{12}$/);
  });
});

/** Stačí holý interpret: `varovani_cilu` knihovnu scénářů nepotřebuje. */
function maHolyPython(): boolean {
  try {
    execFileSync(config.python, ["-c", "import sys"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

// Nástupce se pozná jako jediný hráč bez cíle. Když sonda některý trigger
// přidělení nenajde (autor ho postavil jinak), vyšel by Nástupce špatně —
// správa scénáře na to má upozornit hned u nahrané verze.
describe.skipIf(!maHolyPython())("varování, když nalezené cíle nevypadají jako úplné rozdání (vyžaduje Python)", () => {
  // Podvržený scénář: osm aktivních hráčů, sedmý se jmenuje GM.
  const SKRIPT = `
import importlib.util, json, sys, types
spec = importlib.util.spec_from_file_location("sonda_webu", sys.argv[1])
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
hrac = lambda jmeno: types.SimpleNamespace(tribe_name=jmeno, active=True)
scenar = types.SimpleNamespace(player_manager=types.SimpleNamespace(players=[None] + [hrac("GM" if c == 7 else "") for c in range(1, 9)]))
cile = lambda sloty: [(None, {"slot": s}) for s in sloty]
uplne = [1, 2, 3, 4, 5, 6, 8] * 6
print(json.dumps([m.varovani_cilu(scenar, cile(uplne)), m.varovani_cilu(scenar, cile(uplne[:-1])), m.varovani_cilu(scenar, []), m.varovani_cilu(scenar, cile(uplne + [7]))]))
`;

  it("úplné rozdání nevaruje; chybějící trigger, žádný trigger a cíl pro GM ano", () => {
    const vystup = execFileSync(config.python, ["-c", SKRIPT, join(import.meta.dirname, "sonda.py")], { encoding: "utf8" });
    const [uplne, chybi, zadny, proGm] = JSON.parse(vystup) as string[][];
    expect(uplne).toEqual([]);
    expect(chybi).toEqual(["počet označených triggerů (41) nesedí na 7 hráčů bez GM (p1: 6, p2: 6, p3: 6, p4: 6, p5: 6, p6: 6, p8: 5) — Nástupce ze hry může vyjít špatně"]);
    expect(zadny).toEqual(["sonda nenašla žádný trigger přidělení sekundárního cíle — Nástupce se ze hry nepozná"]);
    expect(proGm).toContain("cíl má dostat i slot GM (p7)");
  });
});
