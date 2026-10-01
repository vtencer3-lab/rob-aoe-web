import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { jeHlavickaScenare, rozeberScenar } from "./rozbor.js";

const LLC = await readFile(new URL("./fixtures/LLC.aoe2scenario", import.meta.url));

/** Rozbor potřebuje Python s AoE2ScenarioParser; bez něj se sada přeskočí s jasnou hláškou. */
function maPython(): boolean {
  try {
    execFileSync(config.python, ["-c", "import AoE2ScenarioParser, PIL"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

it("hlavička: scénář projde, cokoliv jiného ne", () => {
  expect(jeHlavickaScenare(LLC)).toBe(true);
  expect(jeHlavickaScenare(Buffer.from("\x89PNG\r\n\x1a\n"))).toBe(false);
  expect(jeHlavickaScenare(Buffer.alloc(2))).toBe(false);
});

describe.skipIf(!maPython())("rozbor LLC (vyžaduje Python s AoE2ScenarioParser)", () => {
  it("přečte sloty, cíle, limity, suroviny, starty a minimapu", async () => {
    const v = await rozeberScenar(LLC);
    if (!v.ok) throw new Error(v.chyba);
    const r = v.rozbor;
    expect(r.velikostMapy).toBe(220);
    expect(r.sloty.find((s) => s.jeGm)?.barva).toBe(7);
    expect(r.cile.map((c) => c.pocet).sort((a, b) => a - b)).toEqual([5, 15, 99, 150, 650, 900]);
    expect(r.cile.find((c) => c.pocet === 650)?.text).toMatch(/zabij 650/);
    expect(r.limity).toEqual({ vesnicane: 30, rybarskeLode: 5, obchodniVozy: 5 });
    expect(r.suroviny).toEqual({ jidlo: 2000, drevo: 2000, zlato: 2000, kamen: 1000, populace: 200 });
    expect(r.starty.map((s) => s.barva).sort()).toEqual([1, 2, 3, 4, 5, 6, 8]);
    for (const s of r.starty) {
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(1);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(1);
    }
    expect(v.minimapa.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(v.minimapa.subarray(8, 12).toString("ascii")).toBe("WEBP");
  }, 120_000);

  it("rozbitý soubor vrátí chybu, ne výjimku", async () => {
    const v = await rozeberScenar(Buffer.concat([LLC.subarray(0, 4), Buffer.alloc(100)]));
    expect(v.ok).toBe(false);
  }, 120_000);

  it("limit času proces zabije", async () => {
    const v = await rozeberScenar(LLC, { limitMs: 1 });
    expect(v).toEqual({ ok: false, chyba: "Rozbor trval déle než 0 s a byl ukončen." });
  });
});
