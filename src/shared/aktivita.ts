/**
 * Kdo z přihlášených ještě sedí u počítače.
 *
 * Večer se hlásí lidi, kteří pak odejdou vařit nebo zavřou notebook, a Rob
 * z tabulky nepozná, koho má smysl dát do zápasu. Přihláška proto platí jen
 * chvíli: po vypršení hráč ztmavne, propadne na konec seznamu a dostane
 * u sebe tlačítko „Jsem tu!“.
 *
 * Lhůty jsou tady, ne v SQL a v komponentě zvlášť, aby server i prohlížeč
 * počítaly s týmiž čísly. Plnou lhůtu si od migrace 021 nastavuje admin u akce
 * (`akce.lhuta_aktivity_minut`); tady zůstává výchozí hodnota a meze.
 */

/** Výchozí lhůta přihlášky od posledního projevu života; skutečnou nese akce. */
export const AKTIVITA_MINUT = 15;
export const LHUTA_MIN_MINUT = 2;
export const LHUTA_MAX_MINUT = 120;

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

/** Kolik milisekund zbývá do usnutí. Záporné číslo = hráč už spí. */
export function zbyvaMs(aktivniDo: string | null | undefined, ted: number): number | null {
  if (!aktivniDo) return null;
  const konec = Date.parse(aktivniDo);
  return Number.isNaN(konec) ? null : konec - ted;
}

/**
 * Má hráč u sebe vidět „Jsem tu!“?
 *
 * Nabídne se minutu po posledním obnovení lhůty, ne až když hráč usne: kdo
 * u počítače sedí a vidí, že mu čas ubývá, si má umět sáhnout na tlačítko dřív,
 * než ho seznam odsune dolů. Práh se počítá z lhůty, ať sedí i tehdy, až si ji
 * bude admin nastavovat sám.
 */
/**
 * Má admin u hráče vidět zvonek? Až po pěti minutách odpočtu (uživatel: „v tomto
 * defaultním nastavení v 10. minutě“) a dokud hráč nespí — spícího zvonek
 * nesvolá, ten má „Jsem tu!“. Po „Jsem tu!“ je lhůta plná a zvonek zmizí.
 */
export const ZVONEK_PO_MINUTACH = 5;
export function nabidnoutZvonek(aktivniDo: string | null | undefined, ted: number, lhutaMinut = AKTIVITA_MINUT): boolean {
  const zbyva = zbyvaMs(aktivniDo, ted);
  return zbyva !== null && zbyva > 0 && zbyva <= (lhutaMinut - ZVONEK_PO_MINUTACH) * 60_000;
}

export function nabidnoutJsemTu(aktivniDo: string | null | undefined, ted: number, lhutaMinut = AKTIVITA_MINUT): boolean {
  const zbyva = zbyvaMs(aktivniDo, ted);
  return zbyva !== null && zbyva < (lhutaMinut - 1) * 60_000;
}
