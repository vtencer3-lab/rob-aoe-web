import { spawn } from "node:child_process";
import { join } from "node:path";
import { config } from "../config.js";
import { prectiRozbor, type RozborScenare } from "../shared/diplomacie/scenar.js";

export type VysledekRozboru = { ok: true; rozbor: RozborScenare; minimapa: Buffer } | { ok: false; chyba: string };

/** Scénář AoE2 DE začíná textovou verzí formátu, např. „1.59“ (spec §5.2 bod 1). */
export function jeHlavickaScenare(soubor: Buffer): boolean {
  return soubor.length > 8 && /^\d\.\d\d$/.test(soubor.subarray(0, 4).toString("latin1"));
}

/**
 * Spustí rozbor.py, pošle mu soubor na stdin a přečte JSON. Každé selhání
 * (pád, limit, nesmyslný výstup) je výsledek `ok: false`, ne výjimka —
 * nahrání se pak uloží s chybou rozboru (spec §5.2 bod 4).
 */
export function rozeberScenar(soubor: Buffer, volby: { python?: string; limitMs?: number } = {}): Promise<VysledekRozboru> {
  const limitMs = volby.limitMs ?? 60_000;
  return new Promise((hotovo) => {
    const proces = spawn(volby.python ?? config.python, [join(import.meta.dirname, "rozbor.py")], { stdio: ["pipe", "pipe", "pipe"] });
    const vystup: Buffer[] = [];
    const chyby: Buffer[] = [];
    let konec = false;
    const skonci = (v: VysledekRozboru) => {
      if (konec) return;
      konec = true;
      clearTimeout(casovac);
      hotovo(v);
    };
    const casovac = setTimeout(() => {
      proces.kill("SIGKILL");
      skonci({ ok: false, chyba: `Rozbor trval déle než ${Math.floor(limitMs / 1000)} s a byl ukončen.` });
    }, limitMs);
    proces.stdout.on("data", (d: Buffer) => vystup.push(d));
    proces.stderr.on("data", (d: Buffer) => chyby.push(d));
    proces.on("error", (e) => skonci({ ok: false, chyba: `Rozbor se nespustil: ${e.message}` }));
    proces.on("close", () => {
      try {
        const json = JSON.parse(Buffer.concat(vystup).toString("utf8")) as { ok?: unknown; rozbor?: unknown; minimapa?: unknown; chyba?: unknown };
        if (json.ok !== true) return skonci({ ok: false, chyba: typeof json.chyba === "string" ? json.chyba : "Rozbor selhal." });
        if (typeof json.minimapa !== "string") return skonci({ ok: false, chyba: "Rozbor nevrátil minimapu." });
        skonci({ ok: true, rozbor: prectiRozbor(json.rozbor), minimapa: Buffer.from(json.minimapa, "base64") });
      } catch (e) {
        const stderr = Buffer.concat(chyby).toString("utf8").trim().split("\n").at(-1) ?? "";
        skonci({ ok: false, chyba: e instanceof Error ? `${e.message}${stderr ? ` (${stderr})` : ""}` : "Rozbor vrátil nesmysl." });
      }
    });
    proces.stdin.on("error", () => {});
    proces.stdin.end(soubor);
  });
}
