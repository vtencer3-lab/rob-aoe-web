/**
 * Cenzura chatu: seznam slov převzatý ze Streamer.bota Roba
 * (soubor blacklist.json ve složce StreamerBot v AppData, stav 12. 9. 2026;
 * přání uživatele: „vezmi z projektu RobJewsALot seznam cenzurovaných slov
 * a aplikuj ho na chat“). Porovnává se bez ohledu na velikost písmen a
 * diakritiku, po celých slovech (a u víceslovných výrazů po celé frázi);
 * nalezené se nahradí hvězdičkami stejné délky. Uplatňuje se na serveru před
 * uložením, takže hvězdičky vidí každý včetně autora.
 */

/** Jednotlivá slova bez diakritiky, malými písmeny. */
const SLOVA: ReadonlySet<string> = new Set(["buzerant", "buzeranta", "buzerante", "buzeranti", "buzerantsky", "buzerantum", "buzeranty", "buzicci", "buziccich", "buzicek", "buzici", "buzicka", "buzickem", "buzickove", "buzickovi", "buzicku", "buzickum", "buzicky", "buzik", "buzika", "buziku", "buzikum", "buzna", "buznach", "buznam", "buznicce", "buznicek", "buznicka", "buznickach", "buznickam", "buznickami", "buznicko", "buznickou", "buznicku", "buznicky", "buzno", "buzny", "fag", "faggot", "faggota", "faggote", "faggoti", "faggotsky", "faggotu", "faggoty", "fagotici", "fagoticich", "fagotik", "fagotika", "fagotikem", "fagotikove", "fagotikovi", "fagotiku", "fagotikum", "fagotiky", "fagove", "fagy", "gas-the-jews", "gasthejews", "hail-hitler", "hailhitler", "heil-hitler", "heilhitler", "homous", "homousci", "homouscich", "homouse", "homousek", "homousi", "homouska", "homouskem", "homouskove", "homouskovi", "homousku", "homouskum", "homousky", "homousum", "kneegrow", "kneegurr", "negr", "negra", "negracek", "negracku", "negrak", "negraku", "negre", "negrech", "negri", "negrich", "negrici", "negricich", "negrik", "negriku", "negrikum", "negrisko", "negro", "negrousch", "negrousci", "negrouscich", "negrousek", "negrouska", "negrouski", "negrouskovi", "negrousku", "negrouskum", "negrousky", "negrovska", "negrovske", "negrovsky", "negrovskych", "negrovskym", "negrovsti", "negrum", "negry", "nickgurr", "nigga", "nigger", "niggera", "niggere", "niggerovi", "niggery", "niggo", "niggove", "niggr", "niggrem", "niggri", "niggrove", "nigguh", "sieg-heil", "siegheil", "teplous", "teplousci", "teplouse", "teplousek", "teplousi", "teplousku", "teplousum"]);

/** Doplněno uživatelem 12. 9. 2026 nad rámec seznamu ze Streamer.bota. */
for (const slovo of ["negroid", "negroida", "negroidovi", "negroidu", "negroidem", "negroide", "negroidi", "negroidove", "negroidu", "negroidum", "negroidy", "negroidech", "negroidama", "negroidum"]) {
  (SLOVA as Set<string>).add(slovo);
}

/** Víceslovné výrazy, porovnávají se jako celek s libovolnými mezerami. */
const FRAZE: readonly string[] = ["gas the jews", "hail hitler", "heil hitler", "knee grow", "knee gurr", "nick gurr", "sieg heil"];

/**
 * Zjednodušení znak po znaku — každý znak nahradí svým základem bez diakritiky
 * a malým písmenem, takže výsledek má stejnou délku jako vstup a pozice
 * nálezu jde přenést zpátky do původního textu.
 */
export function zjednodus(text: string): string {
  let out = "";
  for (const ch of text) {
    const zaklad = ch.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    out += (zaklad === "" ? ch : zaklad[0]!).toLowerCase();
  }
  return out;
}

export function jeZakazane(slovo: string): boolean {
  return SLOVA.has(zjednodus(slovo));
}

/**
 * Nahradí zakázaná slova a fráze hvězdičkami, ostatní text nechá být.
 * Vrací původní řetězec, když není co cenzurovat.
 */
export function cenzuruj(text: string): string {
  const znaky = Array.from(text);
  const jednoduchy = Array.from(zjednodus(text));
  if (znaky.length !== jednoduchy.length) return cenzurujHrube(text);
  const skryt = new Array<boolean>(znaky.length).fill(false);
  const proste = jednoduchy.join("");
  for (const m of proste.matchAll(/[\p{L}\p{N}]+/gu)) {
    if (SLOVA.has(m[0])) for (let i = m.index; i < m.index + m[0].length; i++) skryt[i] = true;
  }
  for (const fraze of FRAZE) {
    const vzor = new RegExp("(?<![\\p{L}\\p{N}])" + fraze.split(" ").map(uniknout).join("\\s+") + "(?![\\p{L}\\p{N}])", "gu");
    for (const m of proste.matchAll(vzor)) for (let i = m.index; i < m.index + m[0].length; i++) skryt[i] = true;
  }
  if (!skryt.some(Boolean)) return text;
  return znaky.map((ch, i) => (skryt[i] && /[\p{L}\p{N}]/u.test(ch) ? "*" : ch)).join("");
}

/** Záložní cesta, kdyby zjednodušení změnilo délku (exotické znaky): jen po slovech. */
function cenzurujHrube(text: string): string {
  return text.replace(/[\p{L}\p{N}]+/gu, (slovo) => (jeZakazane(slovo) ? "*".repeat(slovo.length) : slovo));
}

function uniknout(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
