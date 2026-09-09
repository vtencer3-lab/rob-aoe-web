import { randomInt } from "node:crypto";

import { jeAi } from "../shared/aiHraci.js";
import { zkontrolujSestavu } from "../shared/sestava.js";
import type { Seat, SestavaVstup } from "../shared/types.js";

/** Vstup od Roba nesedí (počet hráčů, duplicita, barvy, týmy) — chyba požadavku, ne serveru. */
export class SestavaChyba extends Error {}

/**
 * Ze sestavy, jak ji Rob naklikal, udělá sedadla: pořadí pole je pořadí slotů
 * v lobby a hostem se stává ten, kdo má nejvíc odehraných her — má nejspíš
 * nejstabilnější připojení a lobby už zakládal. Kdo hry nemá, počítá se jako
 * nula; při shodě vyhrává dřívější slot.
 *
 * AI hostem být nemůže: lobby zakládá někdo, kdo sedí u hry. Vybírá se proto
 * jen mezi lidmi, a když by v sestavě nebyl ani jeden (samé AI sestava
 * nepustí, ale kód na to nespoléhá), zůstane host na prvním slotu.
 */
export function sestavSedadla(
  sestava: SestavaVstup[],
  odehranoHer: ReadonlyMap<string, number | null>,
): Seat[] {
  const chyba = zkontrolujSestavu(sestava);
  if (chyba) throw new SestavaChyba(chyba);

  const lide = sestava.map((s, i) => i).filter((i) => !jeAi(sestava[i]!.steamId));
  let hostIndex = lide[0] ?? 0;
  for (const i of lide) {
    const her = odehranoHer.get(sestava[i]!.steamId) ?? 0;
    const nejvic = odehranoHer.get(sestava[hostIndex]!.steamId) ?? 0;
    if (her > nejvic) hostIndex = i;
  }

  return sestava.map((s, poradi) => ({
    steamId: s.steamId,
    tym: s.tym,
    barva: s.barva,
    civ: s.civ ?? null,
    jeHost: poradi === hostIndex,
    poradi,
  }));
}

export function lobbyName(poradi: number): string {
  return `ROB-${String(poradi).padStart(2, "0")}`;
}

// Rozsah pro převod kryptograficky bezpečného celého čísla na float v [0, 1).
const CSPRNG_ROZSAH = 4_294_967_296; // 2^32

function csprngFloat(): number {
  return randomInt(0, CSPRNG_ROZSAH) / CSPRNG_ROZSAH;
}

/**
 * Heslo lobby je čtyřmístný číselný PIN. Osm znaků bylo zbytečné: heslo jen
 * brání náhodným lidem z lobby prohlížeče, ne útoku, a číslice se v přenosu
 * opisují z obrazovky bez chyb.
 */
export function generatePassword(rng: () => number = csprngFloat): string {
  let pin = "";
  for (let i = 0; i < 4; i++) {
    pin += String(Math.max(0, Math.min(9, Math.floor(rng() * 10))));
  }
  return pin;
}
