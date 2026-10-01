import type { RozborScenare } from "./scenar.js";

export const ROZBOR: RozborScenare = {
  velikostMapy: 220,
  sloty: [1, 2, 3, 4, 5, 6, 7, 8].map((c) => ({ cislo: c, barva: c as any, jmeno: c === 7 ? "GM" : "", jeGm: c === 7 })),
  cile: [
    { text: "zabij 650 nepratelskych jednotek", pocet: 650 },
    { text: "zbourej 150 nepratelskych budov", pocet: 150 },
    { text: "v bitve musis ztratit 900 jednotek", pocet: 900 },
    { text: "postav celkem 15 hradu", pocet: 15 },
    { text: "prodej 5 relikvie", pocet: 5 },
    { text: "zkonvertuj 99 nepratelskych jednotek", pocet: 99 },
  ],
  suroviny: { jidlo: 2000, drevo: 2000, zlato: 2000, kamen: 1000, populace: 200 },
  limity: { vesnicane: 30, rybarskeLode: 5, obchodniVozy: 5 },
  starty: [1, 2, 3, 4, 5, 6, 8].map((b) => ({ barva: b as any, x: 0.5, y: 0.5 })),
  minimapa: { sirka: 440, vyska: 440 },
  varovani: [],
};
