import { spawn } from "node:child_process";
import { join } from "node:path";
import { config } from "../config.js";

export type VysledekKroku<T> = { ok: true; hodnota: T } | { ok: false; chyba: string };

export interface VolbyKroku {
  python?: string;
  limitMs?: number;
}

/**
 * Spustí skript Pythonu z modulu módu (rozbor.py, sonda.py), pošle mu soubor
 * na stdin a přečte JSON `{ ok, … }` ze stdout. Každé selhání (pád, limit
 * času, nesmyslný výstup, výjimka z `precti`) je výsledek `ok: false`
 * s českou větou, ne výjimka — nahrání scénáře se pak uloží s chybou
 * (spec §5.2 bod 4). `jmeno` je podmět těch vět („Rozbor“, „Krok sondy“).
 */
export function spustKrokPythonu<T>(krok: { skript: string; jmeno: string; vstup: Buffer; precti: (json: Record<string, unknown>) => T } & VolbyKroku): Promise<VysledekKroku<T>> {
  const limitMs = krok.limitMs ?? 60_000;
  return new Promise((hotovo) => {
    const proces = spawn(krok.python ?? config.python, [join(import.meta.dirname, krok.skript)], { stdio: ["pipe", "pipe", "pipe"] });
    const vystup: Buffer[] = [];
    const chyby: Buffer[] = [];
    let konec = false;
    const skonci = (v: VysledekKroku<T>) => {
      if (konec) return;
      konec = true;
      clearTimeout(casovac);
      hotovo(v);
    };
    const casovac = setTimeout(() => {
      proces.kill("SIGKILL");
      skonci({ ok: false, chyba: `${krok.jmeno} trval déle než ${Math.floor(limitMs / 1000)} s a byl ukončen.` });
    }, limitMs);
    proces.stdout.on("data", (d: Buffer) => vystup.push(d));
    proces.stderr.on("data", (d: Buffer) => chyby.push(d));
    proces.on("error", (e) => skonci({ ok: false, chyba: `${krok.jmeno} se nespustil: ${e.message}` }));
    proces.on("close", () => {
      try {
        const json = JSON.parse(Buffer.concat(vystup).toString("utf8")) as Record<string, unknown>;
        if (json["ok"] !== true) return skonci({ ok: false, chyba: typeof json["chyba"] === "string" ? json["chyba"] : `${krok.jmeno} selhal.` });
        skonci({ ok: true, hodnota: krok.precti(json) });
      } catch (e) {
        const stderr = Buffer.concat(chyby).toString("utf8").trim().split("\n").at(-1) ?? "";
        skonci({ ok: false, chyba: e instanceof Error ? `${e.message}${stderr ? ` (${stderr})` : ""}` : `${krok.jmeno} vrátil nesmysl.` });
      }
    });
    proces.stdin.on("error", () => {});
    proces.stdin.end(krok.vstup);
  });
}
