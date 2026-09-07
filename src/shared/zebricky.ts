/**
 * Žebříčky, jak je hra vypisuje po najetí na hráče v lobby, v témže pořadí.
 * Id 3 a 4 jsou ověřená naživo (7. 9. 2026); ostatní podle historického
 * číslování aoe2.net / aoe2insights — kdyby některé neseděly, řádek bude
 * trvale „---“, nic víc.
 */
export interface ZebricekRadek {
  /** leaderboard_id ze hry. */
  id: number;
  rating: number | null;
  nejvyssi: number | null;
  poradi: number | null;
  vyhry: number;
  prohry: number;
}

export const ZEBRICKY: ReadonlyArray<{ id: number; nazev: string; tymovy: boolean }> = [
  { id: 3, nazev: "Random Map", tymovy: false },
  { id: 4, nazev: "Team Random Map", tymovy: true },
  { id: 13, nazev: "Empire Wars", tymovy: false },
  { id: 14, nazev: "Team Empire Wars", tymovy: true },
  { id: 1, nazev: "Death Match", tymovy: false },
  { id: 2, nazev: "Team Death Match", tymovy: true },
  { id: 27, nazev: "Return of Rome", tymovy: false },
  { id: 28, nazev: "Team Return of Rome", tymovy: true },
];

/** Procento výher zaokrouhlené jako ve hře; bez her 0 %. */
export function procentoVyher(r: Pick<ZebricekRadek, "vyhry" | "prohry">): number {
  const her = r.vyhry + r.prohry;
  return her === 0 ? 0 : Math.round((r.vyhry / her) * 100);
}
