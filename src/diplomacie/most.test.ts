import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { config } from "../config.js";
import { prectiSnimek, vyhodnotHru } from "../shared/diplomacie/hra.js";
import type { Barva } from "../shared/types.js";

const NASTROJE = join(import.meta.dirname, "..", "..", "nastroje", "diplomacie");
const GM = "76561198000000007";

/** Most a čtečka jsou čistý Python bez knihoven; bez interpretu se sada přeskočí. */
function maPython(): boolean {
  try {
    execFileSync(config.python, ["-c", "import sys"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const cislo = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeInt32LE(n);
  return b;
};
const retezec = (t: string) => Buffer.concat([cislo(Buffer.byteLength(t)), Buffer.from(t, "utf8")]);
const desetinne = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeFloatLE(n);
  return b;
};

/**
 * Soubor sondy formátu 5 (značka „ROBD“), jak ho píše sonda.xs; `format: 3`
 * je starší tvar bez značky. GM sedí v lobby první (slot 7 → hráč 1), cíl
 * dostali všichni kromě slotu 4.
 */
function souborSondy(cas: number, casNaKonci = cas, format: 3 | 5 | 6 = 5): Buffer {
  const promenne = new Array<number>(256).fill(0);
  for (const [slot, pocitadlo] of [
    [1, 15],
    [2, 16],
    [3, 17],
    [5, 19],
    [6, 20],
    [8, 21],
  ] as const) {
    promenne[200 + slot] = pocitadlo;
  }
  promenne[16] = 120;
  return Buffer.concat([
    ...(format === 3 ? [cislo(3)] : [cislo(0x44424f52), cislo(format)]),
    cislo(cas),
    ...[7, 2, 3, 4, 5, 6, 1, 8].map(cislo),
    ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((p) => [retezec(`Hráč ${p}`), retezec("<BLUE>"), desetinne(p === 7 ? 2 : 0), cislo(p === 3 ? 0 : 1)]),
    // Formát 6: poloha krále hráče 1 je (12.5, 40), ostatní krále nemají.
    ...(format === 6 ? [1, 2, 3, 4, 5, 6, 7, 8].flatMap((p) => (p === 1 ? [desetinne(12.5), desetinne(40)] : [desetinne(-1), desetinne(-1)])) : []),
    ...new Array<number>(64).fill(3).map(cislo),
    ...promenne.map(cislo),
    cislo(casNaKonci),
  ]);
}

/** Složka hry s jedním profilem a souborem sondy; po zkoušce se smaže. */
async function sHrou<T>(soubor: Buffer, fn: (koren: string, cesta: string) => T): Promise<T> {
  const koren = await mkdtemp(join(tmpdir(), "most-"));
  try {
    const profil = join(koren, GM, "profile");
    await mkdir(profil, { recursive: true });
    await writeFile(join(profil, "LLC.xsdat"), soubor);
    return fn(koren, join(profil, "LLC.xsdat"));
  } finally {
    await rm(koren, { recursive: true, force: true });
  }
}

describe.skipIf(!maPython())("most ke hře (vyžaduje Python)", () => {
  it("zpráva mostu ze souboru sondy je tělo, které server přijme, a dává Nástupce", async () => {
    const vystup = await sHrou(souborSondy(95), (koren) => execFileSync(config.python, [join(NASTROJE, "most.py"), "--slozka", koren, "--nasucho", "--jednou"], { encoding: "utf8", timeout: 30_000 }));
    const snimek = prectiSnimek(JSON.parse(vystup));
    expect(snimek).toMatchObject({ odesilatel: GM, scenar: "LLC.aoe2scenario", cas: 95, sloty: [7, 2, 3, 4, 5, 6, 1, 8] });
    expect(snimek.hraci[0]).toEqual({ cislo: 1, jmeno: "Hráč 1", barva: "<BLUE>", relikvie: 0, zije: true });
    const hraci = ([1, 2, 3, 4, 5, 6, 8] as Barva[]).map((barva) => ({ hracId: `h${barva}`, barva }));
    const hra = vyhodnotHru(snimek, hraci, [{ promenna: 16, slot: 2, text: "zabito : {} /650 jednotek", limit: 650 }], "2026-10-02T20:00:00.000Z");
    expect(hra.nastupceHracId).toBe("h4");
    expect(hra.hraci.find((h) => h.hracId === "h2")!.cil).toEqual({ text: "zabito : {} /650 jednotek", limit: 650, hodnota: 120 });
    expect(hra.hraci.find((h) => h.hracId === "h1")).toMatchObject({ relikvie: 2, zije: true });
  }, 60_000);

  it("--odesilatel (i starší --gm) přepíše id ze jména složky; výpis říká, odkud web data vzal", async () => {
    for (const prepinac of ["--odesilatel", "--gm"]) {
      const vystup = await sHrou(souborSondy(95), (koren) =>
        execFileSync(config.python, [join(NASTROJE, "most.py"), "--slozka", koren, "--nasucho", "--jednou", prepinac, "divak1"], { encoding: "utf8", timeout: 30_000 }),
      );
      expect(prectiSnimek(JSON.parse(vystup)).odesilatel).toBe("divak1");
    }
    const popis = (stav: number, odpoved: object) =>
      execFileSync(config.python, ["-c", `import json,sys; from most import popis_odpovedi; print(popis_odpovedi(${stav}, json.loads(sys.argv[1]), "d1"))`, JSON.stringify(odpoved)], {
        cwd: NASTROJE,
        encoding: "utf8",
        env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      }).trim();
    expect(popis(200, { zapasId: 5, zdroj: "gm", nastupce: "h4" })).toBe("zápas 5 (jako GM), Nástupce: h4");
    expect(popis(200, { zapasId: 5, zdroj: "divak", nastupce: null })).toBe("zápas 5 (jako divák), Nástupce: zatím neurčen");
    expect(popis(200, { zapasId: 5, zdroj: "divak", nastupce: "h4", pouzito: false })).toBe("zápas 5 (jako divák), Nástupce: h4 — nepoužito, data posílá GM");
    expect(popis(404, { chyba: "Na webu teď neběží žádný zápas Diplomacie." })).toBe(
      "web data od d1 nepřiřadil k žádnému zápasu (404): Na webu teď neběží žádný zápas Diplomacie. Jiné id nastaví --odesilatel.",
    );
  }, 60_000);

  it("čtečka xsdat: formát 5 se značkou i starší 3, převod slotů a proměnné; rozepsaný soubor neplatí", async () => {
    const cti = (soubor: Buffer) => sHrou(soubor, (_koren, cesta) => JSON.parse(execFileSync(config.python, [join(NASTROJE, "xsdat.py"), cesta], { encoding: "utf8" })) as Record<string, unknown>);
    const cele = await cti(souborSondy(95));
    expect(cele).toMatchObject({ platne: true, verze: 5, cas: 95, sloty: [7, 2, 3, 4, 5, 6, 1, 8] });
    expect(Buffer.from(souborSondy(95).subarray(0, 4)).toString("ascii")).toBe("ROBD");
    expect(await cti(souborSondy(95, 95, 3))).toMatchObject({ platne: true, verze: 3, cas: 95 });
    const s6 = await cti(souborSondy(95, 95, 6));
    expect(s6).toMatchObject({ platne: true, verze: 6, cas: 95, sloty: [7, 2, 3, 4, 5, 6, 1, 8] });
    expect((s6["hraci"] as { kral: unknown }[]).map((h) => h.kral)).toEqual([{ x: 12.5, y: 40 }, null, null, null, null, null, null, null]);
    expect((cele["promenne"] as number[])[204]).toBe(0);
    expect((cele["promenne"] as number[])[202]).toBe(16);
    // Čas na začátku a na konci se liší = hra soubor zrovna přepisovala.
    expect(await cti(souborSondy(95, 97))).toMatchObject({ platne: false });
    expect(await cti(souborSondy(95).subarray(0, 600))).toMatchObject({ platne: false });
  }, 60_000);

  it("bez tokenu most skončí s českou hláškou a nic neposílá", async () => {
    const beh = await sHrou(souborSondy(95), (koren) => {
      try {
        // HOME i USERPROFILE do prázdné složky: skutečný soubor s tokenem se nesmí číst.
        execFileSync(config.python, [join(NASTROJE, "most.py"), "--slozka", koren, "--jednou", "--url", "http://127.0.0.1:9"], {
          encoding: "utf8",
          timeout: 30_000,
          env: { ...process.env, MOST_TOKEN: "", HOME: koren, USERPROFILE: koren, PYTHONIOENCODING: "utf-8" },
          stdio: ["ignore", "pipe", "pipe"],
        });
        return { kod: 0, chyba: "" };
      } catch (e) {
        const chyba = e as { status?: number; stderr?: string };
        return { kod: chyba.status, chyba: chyba.stderr ?? "" };
      }
    });
    expect(beh.kod).toBe(2);
    expect(beh.chyba).toContain("Chybí token mostu");
  }, 60_000);
});
