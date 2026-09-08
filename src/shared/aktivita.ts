/**
 * Kdo z přihlášených ještě sedí u počítače.
 *
 * Večer se hlásí lidi, kteří pak odejdou vařit nebo zavřou notebook, a Rob
 * z tabulky nepozná, koho má smysl dát do zápasu. Přihláška proto platí jen
 * chvíli: po vypršení hráč ztmavne, propadne na konec seznamu a dostane
 * u sebe tlačítko „Jsem tu!“.
 *
 * Lhůty jsou tady, ne v SQL a v komponentě zvlášť, aby server i prohlížeč
 * počítaly s týmiž čísly. Později je má nastavovat admin; zatím jsou pevné.
 */

/** Jak dlouho platí přihláška od posledního projevu života. */
export const AKTIVITA_MINUT = 15;

/** Kolik přidá jedno kliknutí do stránky, dokud lhůta ještě běží. */
export const PRODLOUZENI_MINUT = 5;

/**
 * Nejmenší odstup mezi dvěma automatickými prodlouženími. Bez něj by stačilo
 * třikrát kliknout a lhůta by byla plná, aniž by u toho kdokoliv seděl.
 */
export const ODSTUP_PULSU_MINUT = 4;

/**
 * Sedí hráč u počítače? `aktivniDo` je ISO čas z přenosu; `ted` je milisekundy,
 * ať jde v testech dosadit pevný okamžik.
 *
 * Chybějící hodnota znamená aktivní: tak vypadají starší snímky stavu a
 * zkušební data, a schovat kvůli tomu hráče dolů by bylo horší než nic.
 */
export function jeAktivni(aktivniDo: string | null | undefined, ted: number): boolean {
  if (!aktivniDo) return true;
  const konec = Date.parse(aktivniDo);
  return Number.isNaN(konec) || konec > ted;
}
