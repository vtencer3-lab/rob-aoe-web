import { BARVY, type Barva } from "../types.js";

/** Co rozbor scénáře (src/diplomacie/rozbor.py) vrací; spec §5.2. */
export interface RozborScenare {
  velikostMapy: number;
  sloty: { cislo: number; barva: Barva; jmeno: string; jeGm: boolean }[];
  /** Sekundární cíle: text z hlášky „TVUJ SEKUNDARNI CIL JE" a číslo z podmínky triggeru. */
  cile: { text: string; pocet: number }[];
  suroviny: { jidlo: number; drevo: number; zlato: number; kamen: number; populace: number };
  limity: { vesnicane: number | null; rybarskeLode: number | null; obchodniVozy: number | null };
  /** Startovní pozice v souřadnicích obrázku minimapy (0–1 zleva a shora). */
  starty: { barva: Barva; x: number; y: number }[];
  minimapa: { sirka: number; vyska: number };
  varovani: string[];
}

const cislo = (v: unknown, kde: string): number => {
  if (typeof v !== "number" || !Number.isFinite(v)) throw new Error(`Rozbor: ${kde} není číslo.`);
  return v;
};
const cisloNeboNull = (v: unknown, kde: string): number | null => (v === null ? null : cislo(v, kde));
const text = (v: unknown, kde: string): string => {
  if (typeof v !== "string") throw new Error(`Rozbor: ${kde} není text.`);
  return v;
};
const barva = (v: unknown, kde: string): Barva => {
  if (!BARVY.includes(v as Barva)) throw new Error(`Rozbor: ${kde} není barva 1–8.`);
  return v as Barva;
};
const pole = (v: unknown, kde: string): unknown[] => {
  if (!Array.isArray(v)) throw new Error(`Rozbor: ${kde} není seznam.`);
  return v;
};
const objekt = (v: unknown, kde: string): Record<string, unknown> => {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error(`Rozbor: ${kde} chybí.`);
  return v as Record<string, unknown>;
};

/** Ověří tvar výstupu rozboru. Do databáze ani ke klientovi nesmí nic jiného. */
export function prectiRozbor(json: unknown): RozborScenare {
  const o = objekt(json, "výsledek");
  const s = objekt(o["suroviny"], "suroviny");
  const l = objekt(o["limity"], "limity");
  const m = objekt(o["minimapa"], "minimapa");
  const rozbor: RozborScenare = {
    velikostMapy: cislo(o["velikostMapy"], "velikostMapy"),
    sloty: pole(o["sloty"], "sloty").map((x, i) => {
      const r = objekt(x, `slot ${i}`);
      return { cislo: cislo(r["cislo"], "slot.cislo"), barva: barva(r["barva"], "slot.barva"), jmeno: text(r["jmeno"], "slot.jmeno"), jeGm: r["jeGm"] === true };
    }),
    cile: pole(o["cile"], "cile").map((x, i) => {
      const r = objekt(x, `cíl ${i}`);
      return { text: text(r["text"], "cíl.text"), pocet: cislo(r["pocet"], "cíl.pocet") };
    }),
    suroviny: {
      jidlo: cislo(s["jidlo"], "suroviny.jidlo"),
      drevo: cislo(s["drevo"], "suroviny.drevo"),
      zlato: cislo(s["zlato"], "suroviny.zlato"),
      kamen: cislo(s["kamen"], "suroviny.kamen"),
      populace: cislo(s["populace"], "suroviny.populace"),
    },
    limity: {
      vesnicane: cisloNeboNull(l["vesnicane"], "limity.vesnicane"),
      rybarskeLode: cisloNeboNull(l["rybarskeLode"], "limity.rybarskeLode"),
      obchodniVozy: cisloNeboNull(l["obchodniVozy"], "limity.obchodniVozy"),
    },
    starty: pole(o["starty"], "starty").map((x, i) => {
      const r = objekt(x, `start ${i}`);
      return { barva: barva(r["barva"], "start.barva"), x: cislo(r["x"], "start.x"), y: cislo(r["y"], "start.y") };
    }),
    minimapa: { sirka: cislo(m["sirka"], "minimapa.sirka"), vyska: cislo(m["vyska"], "minimapa.vyska") },
    varovani: pole(o["varovani"], "varovani").map((x) => text(x, "varování")),
  };
  if (rozbor.sloty.filter((x) => x.jeGm).length !== 1) throw new Error("Rozbor: scénář nemá právě jednoho GM.");
  return rozbor;
}
