import { randomInt } from "node:crypto";

import { zkontrolujSestavu } from "../shared/sestava.js";
import type { Seat, SestavaVstup } from "../shared/types.js";

/** Vstup od Roba nesedí (počet hráčů, duplicita, barvy, týmy) — chyba požadavku, ne serveru. */
export class SestavaChyba extends Error {}

/**
 * Ze sestavy, jak ji Rob naklikal, udělá sedadla: pořadí pole je pořadí slotů
 * v lobby a hostem se stává ten, kdo má nejvíc odehraných her — má nejspíš
 * nejstabilnější připojení a lobby už zakládal. Kdo hry nemá, počítá se jako
 * nula; při shodě vyhrává dřívější slot.
 */
export function sestavSedadla(
  sestava: SestavaVstup[],
  odehranoHer: ReadonlyMap<string, number | null>,
): Seat[] {
  const chyba = zkontrolujSestavu(sestava);
  if (chyba) throw new SestavaChyba(chyba);

  let hostIndex = 0;
  for (let i = 1; i < sestava.length; i++) {
    const her = odehranoHer.get(sestava[i]!.steamId) ?? 0;
    const nejvic = odehranoHer.get(sestava[hostIndex]!.steamId) ?? 0;
    if (her > nejvic) hostIndex = i;
  }

  return sestava.map((s, poradi) => ({
    steamId: s.steamId,
    tym: s.tym,
    barva: s.barva,
    jeHost: poradi === hostIndex,
    poradi,
  }));
}

export function lobbyName(poradi: number): string {
  return `ROB-${String(poradi).padStart(2, "0")}`;
}

const ABECEDA = "abcdefghjkmnpqrstuvwxyz23456789";

// Rozsah pro převod kryptograficky bezpečného celého čísla na float v [0, 1),
// aby výchozí generátor nebyl uhodnutelný jako Math.random.
const CSPRNG_ROZSAH = 4_294_967_296; // 2^32

function csprngFloat(): number {
  return randomInt(0, CSPRNG_ROZSAH) / CSPRNG_ROZSAH;
}

export function generatePassword(rng: () => number = csprngFloat): string {
  let heslo = "";
  for (let i = 0; i < 8; i++) {
    const index = Math.max(0, Math.min(ABECEDA.length - 1, Math.floor(rng() * ABECEDA.length)));
    heslo += ABECEDA[index];
  }
  return heslo;
}
