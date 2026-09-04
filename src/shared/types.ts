export type Format = "1v1" | "coop_kings_2v2";
export type Tym = 1 | 2;
export type Barva = 1 | 2;

export const BARVA_NAZEV: Record<Barva, string> = {
  1: "modrá",
  2: "červená",
};

export interface Seat {
  steamId: string;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
}
