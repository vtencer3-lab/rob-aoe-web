import { randomInt } from "node:crypto";

import type { Barva, Format, Seat, Tym } from "../shared/types.js";

export interface SeatInput {
  steamId: string;
  odehranoHer: number | null;
}

/** Vstup od Roba nesedí formátu zápasu — chybný počet hráčů nebo duplicita, ne interní chyba. */
export class SestavaChyba extends Error {}

const ROZLOZENI: Record<Format, ReadonlyArray<{ tym: Tym; barva: Barva }>> = {
  "1v1": [
    { tym: 1, barva: 1 },
    { tym: 2, barva: 2 },
  ],
  coop_kings_2v2: [
    { tym: 1, barva: 1 },
    { tym: 1, barva: 1 },
    { tym: 2, barva: 2 },
    { tym: 2, barva: 2 },
  ],
};

export function seatCount(format: Format): number {
  return ROZLOZENI[format].length;
}

export function assignSeats(format: Format, players: SeatInput[]): Seat[] {
  const rozlozeni = ROZLOZENI[format];
  if (players.length !== rozlozeni.length) {
    throw new SestavaChyba(`Formát ${format} potřebuje přesně ${rozlozeni.length} hráče.`);
  }
  const unikatni = new Set(players.map((p) => p.steamId));
  if (unikatni.size !== players.length) {
    throw new SestavaChyba("Stejný hráč nemůže být v zápase dvakrát.");
  }

  let hostIndex = 0;
  for (let i = 1; i < players.length; i++) {
    if ((players[i]!.odehranoHer ?? 0) > (players[hostIndex]!.odehranoHer ?? 0)) {
      hostIndex = i;
    }
  }

  return players.map((hrac, i) => ({
    steamId: hrac.steamId,
    tym: rozlozeni[i]!.tym,
    barva: rozlozeni[i]!.barva,
    jeHost: i === hostIndex,
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
