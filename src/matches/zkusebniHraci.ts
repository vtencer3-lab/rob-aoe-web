/**
 * Zkušební hráči pro zkoušení večera bez skutečných lidí. Jména jsou napevno,
 * aby opakované přidání vracelo pořád tytéž — jinak by se seznam plnil
 * cizinci a Rob by se v testovací akci přestal vyznat. Používají je zkušební
 * dveře (localhost, přihlášení za hráče) i tlačítko v režii na vývojové
 * verzi (jen přihlášení do akce).
 */
export const ZKUSEBNI_HRACI = [
  { jmeno: "Pepa", elo: 1180, her: 342 },
  { jmeno: "Jana", elo: 1520, her: 1204 },
  { jmeno: "Karel", elo: 890, her: 87 },
  { jmeno: "Lida", elo: 1340, her: 655 },
  { jmeno: "Mirek", elo: 1010, her: 210 },
  { jmeno: "Tonda", elo: 1690, her: 2431 },
  { jmeno: "Zdena", elo: 1255, her: 498 },
  { jmeno: "Ondra", elo: 960, her: 143 },
] as const;

/**
 * Steam ID zkušebního hráče. Prefix „test:“ je schválně něco, co skutečné
 * 64bitové Steam ID nikdy mít nebude — zkušební účet se tak nemůže srazit
 * s opravdovým člověkem ani omylem, a v databázi je na první pohled poznat.
 */
export function zkusebniId(jmeno: string): string {
  return `test:${jmeno.trim().toLowerCase()}`;
}

export function jeZkusebni(steamId: string): boolean {
  return steamId.startsWith("test:");
}
