import type { Barva, Format, Seat, Tym } from "../shared/types.js";

export interface SeatInput {
  steamId: string;
  odehranoHer: number | null;
}

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
    throw new Error(`Formát ${format} potřebuje přesně ${rozlozeni.length} hráče.`);
  }
  const unikatni = new Set(players.map((p) => p.steamId));
  if (unikatni.size !== players.length) {
    throw new Error("Stejný hráč nemůže být v zápase dvakrát.");
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

export function generatePassword(rng: () => number = Math.random): string {
  let heslo = "";
  for (let i = 0; i < 8; i++) {
    heslo += ABECEDA[Math.floor(rng() * ABECEDA.length)];
  }
  return heslo;
}
