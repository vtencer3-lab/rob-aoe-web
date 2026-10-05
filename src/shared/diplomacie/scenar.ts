import { BARVY, type Barva } from "../types.js";
import { overovace } from "./overeni.js";

/**
 * Jméno, pod kterým web verzi scénáře servíruje (kopie se sondou) a podle
 * kterého ji pozná všude, kde se jména porovnávají: kontrola lobby, uložení
 * do složky hry, most ke hře (soubor .xsdat se jmenuje podle scénáře).
 * `poradi` je pořadí nahrání (migrace 035), po smazání se nepoužije znovu.
 * Originál od autora si nechává jméno, pod kterým ho nahrál.
 *
 * Všechny naše scénáře začínají `ROB_` (uživatel 3. 10. 2026, dřív
 * `JIN_DIPLO_`): soubor sondy se jmenuje jako scénář, agent na herním PC tak
 * hlídá jen `ROB_*.xsdat` a cizí soubory modů nečte vůbec. Nový mód nebo
 * scénář dostane `ROB_<CO>_<N>` a masku sledování nemění.
 *
 * Od 4. 10. 2026 nese jméno i verzi sondy (`…_v<VERZE_SONDY>`): ze jména
 * souboru ve složce hry je hned vidět, jestli je stažený se současnou
 * sondou. Starší stažená kopie má jiné jméno — kontrola lobby i most ji
 * poznají jako jiný soubor a hlásí to.
 */
export function jmenoScenareProHru(poradi: number): string {
  return `ROB_DIPLO_${poradi}_v${VERZE_SONDY}.aoe2scenario`;
}

/**
 * Naše verze sondy (src/diplomacie/sonda.xs) — zvednout při každé změně
 * jejího kódu; test v sonda.test.ts to hlídá přes otisk `REVIZE_SONDY`.
 * 9 = formát souboru 8 + počitadlo držení 7 relikvií (proměnné 240–247).
 */
export const VERZE_SONDY = 10;
/** Otisk sonda.xs (`revizeSondy`), ke kterému patří `VERZE_SONDY`. */
export const REVIZE_SONDY = "b7c9e3fb4a47";

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
  /**
   * Podmínky vítězství ze sekce GlobalVictory (mode 0–4). Volitelné: verze
   * rozebrané před 1. 10. 2026 je v databázi nemají — pak „podle scénáře“.
   */
  vitezstvi?: { rezim: RezimVitezstvi; popis: string };
  varovani: string[];
}

export const REZIMY_VITEZSTVI = ["standard", "dobyti", "skore", "cas", "vlastni"] as const;
export type RezimVitezstvi = (typeof REZIMY_VITEZSTVI)[number];

const { cislo, text, pole, objekt } = overovace("Rozbor");
const cisloNeboNull = (v: unknown, kde: string): number | null => (v === null ? null : cislo(v, kde));
const barva = (v: unknown, kde: string): Barva => {
  if (!BARVY.includes(v as Barva)) throw new Error(`Rozbor: ${kde} není barva 1–8.`);
  return v as Barva;
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
  // Chybějící klíč zůstane chybět (ne `undefined`), ať JSON v databázi
  // vypadá u starých i nových verzí stejně.
  if (o["vitezstvi"] !== undefined) {
    const v = objekt(o["vitezstvi"], "vitezstvi");
    const rezim = v["rezim"];
    if (!REZIMY_VITEZSTVI.includes(rezim as RezimVitezstvi)) throw new Error("Rozbor: vitezstvi.rezim není známý druh vítězství.");
    rozbor.vitezstvi = { rezim: rezim as RezimVitezstvi, popis: text(v["popis"], "vitezstvi.popis") };
  }
  if (rozbor.sloty.filter((x) => x.jeGm).length !== 1) throw new Error("Rozbor: scénář nemá právě jednoho GM.");
  return rozbor;
}
