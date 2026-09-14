/**
 * Našeptávání v poli chatu, po vzoru UnityChat (uživatel 14. 9. 2026):
 *
 * - **Emoty jen na Tab.** Žádný prefix, žádné otevírání při psaní: Tab
 *   dokončí slovo pod kurzorem (od poslední mezery po kurzor). První Tab
 *   otevře seznam a rovnou vloží první položku, další Taby cyklují
 *   (Shift+Tab zpátky), ↑/↓ totéž, → potvrdí a zavře, Enter zprávu odešle
 *   (emote už je vložený). Jakákoli jiná klávesa seznam zavře.
 * - **@jméno se otevírá při psaní** (od `@` + 1 znak); Tab pak jen potvrdí.
 *   Enter u jména jen zavře seznam, zprávu neodešle.
 * - **Fulltext**: bez něj se hledá začátek jména, s ním kdekoli ve jméně.
 *
 * Tady je jen logika nad textem a pozicí kurzoru — DOM a klávesy řeší Chat.
 */

export type DruhNaseptavani = "emote" | "uzivatel";

export interface Naseptavani {
  /** Rozsah rozepsaného slova v textu, co se nahrazuje. */
  start: number;
  end: number;
  /** Co bylo napsané, když se seznam otevřel (fulltext přefiltruje proti tomu). */
  prefix: string;
  matches: string[];
  index: number;
  /** Už se něco vložilo do textu (první Tab u auto-otevřeného @ jen potvrzuje). */
  applied: boolean;
  druh: DruhNaseptavani;
}

/** Slovo pod kurzorem: od poslední mezery (jen mezera, ne nový řádek) po kurzor. */
export function slovoPodKurzorem(text: string, pos: number): { start: number; slovo: string } {
  let start = pos;
  while (start > 0 && text[start - 1] !== " ") start--;
  return { start, slovo: text.slice(start, pos) };
}

/**
 * Emoty podle prefixu: bez fulltextu jen začátek jména, s ním kdekoli.
 * Řazení: shoda začátku před shodou uprostřed, přesná velikost písmen
 * před nepřesnou, pak abecedně.
 */
export function najdiEmoty(prefix: string, jmena: Iterable<string>, fulltext: boolean): string[] {
  if (!prefix) return [];
  const male = prefix.toLowerCase();
  const shoda = fulltext ? (n: string) => n.toLowerCase().includes(male) : (n: string) => n.toLowerCase().startsWith(male);
  const vysledky = [...new Set(jmena)].filter(shoda);
  vysledky.sort((a, b) => {
    const aZac = a.toLowerCase().startsWith(male);
    const bZac = b.toLowerCase().startsWith(male);
    if (aZac !== bZac) return aZac ? -1 : 1;
    const aPresne = a.startsWith(prefix);
    const bPresne = b.startsWith(prefix);
    if (aPresne !== bPresne) return aPresne ? -1 : 1;
    return a.localeCompare(b);
  });
  return vysledky;
}

/** Jména uživatelů podle `@prefix` (holé `@` = všichni), bez duplicit, abecedně. */
export function najdiUzivatele(prefixSeZavinacem: string, jmena: Iterable<string>): string[] {
  const male = prefixSeZavinacem.slice(1).toLowerCase();
  const videne = new Set<string>();
  const vysledky: string[] = [];
  for (const j of jmena) {
    const klic = j.toLowerCase();
    if (videne.has(klic) || !klic.startsWith(male)) continue;
    videne.add(klic);
    vysledky.push(`@${j}`);
  }
  return vysledky.sort((a, b) => a.localeCompare(b));
}

/**
 * Otevře našeptávání pro slovo pod kurzorem, nebo null, když není co
 * nabídnout. `@` vede k uživatelům, cokoli jiného k emotům.
 */
export function otevri(text: string, pos: number, emoty: Iterable<string>, uzivatele: Iterable<string>, fulltext: boolean): Naseptavani | null {
  const { start, slovo } = slovoPodKurzorem(text, pos);
  if (!slovo) return null;
  const druh: DruhNaseptavani = slovo.startsWith("@") ? "uzivatel" : "emote";
  const matches = druh === "uzivatel" ? najdiUzivatele(slovo, uzivatele) : najdiEmoty(slovo, emoty, fulltext);
  if (matches.length === 0) return null;
  return { start, end: pos, prefix: slovo, matches, index: 0, applied: false, druh };
}

/** Vloží vybranou položku místo rozepsaného slova (+ mezera) a posune kurzor za ni. */
export function aplikuj(text: string, ac: Naseptavani): { text: string; pos: number; ac: Naseptavani } {
  const match = ac.matches[ac.index] ?? "";
  const novy = text.slice(0, ac.start) + match + " " + text.slice(ac.end);
  const end = ac.start + match.length + 1;
  return { text: novy, pos: end, ac: { ...ac, end, applied: true } };
}

/** Další/předchozí položka, cyklicky. */
export function posun(ac: Naseptavani, smer: 1 | -1): Naseptavani {
  const n = ac.matches.length;
  return { ...ac, index: (ac.index + smer + n) % n };
}

/** Přefiltrování otevřeného seznamu (přepnutí fulltextu) proti původnímu prefixu. */
export function prefiltruj(ac: Naseptavani, emoty: Iterable<string>, fulltext: boolean): Naseptavani | null {
  if (ac.druh !== "emote") return ac;
  const matches = najdiEmoty(ac.prefix, emoty, fulltext);
  return matches.length === 0 ? null : { ...ac, matches, index: 0 };
}

/** Kolik položek je vidět naráz; okno se posouvá kolem vybrané. */
export const VIDITELNYCH = 4;

/** Začátek okna viditelných položek tak, aby vybraná byla uvnitř. */
export function oknoOd(index: number, celkem: number, predchoziOd: number): number {
  if (celkem <= VIDITELNYCH) return 0;
  let od = predchoziOd;
  if (index < od) od = index;
  if (index >= od + VIDITELNYCH) od = index - VIDITELNYCH + 1;
  return Math.max(0, Math.min(od, celkem - VIDITELNYCH));
}
