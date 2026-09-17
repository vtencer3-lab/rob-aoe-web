import { ZAKLAD } from "./cesty.js";

export type PravniStranka = "podminky" | "soukromi";

/**
 * Adresa, na kterou se píše o smazání účtu. Stojí tu, protože ji jmenují obě
 * právní stránky — kdyby si ji každá držela svou, jedna by po změně mlčky
 * posílala lidi jinam a nikdo by si toho nevšiml.
 */
export const KONTAKT_SMAZANI = "m.joukal+aoekomunitky@gmail.com";

/**
 * Která právní stránka (pokud nějaká) patří k adrese z adresního řádku.
 * Web nemá router — tohle je jediné místo, kde se cesta z prohlížeče
 * porovnává s něčím konkrétním. Odřezává základ webu (`/aoe`, `/aoe/dev`,
 * `/aoe/experimental`) a snáší koncové lomítko: lidi si adresu kopírují
 * i s ním, a je to nejlevnější způsob, jak takovou stránku rozbít.
 *
 * `zaklad` jde jako parametr (výchozí `ZAKLAD` z cesty.ts), aby šlo otestovat
 * chování pro všechna tři nasazení bez přepínání `import.meta.env` v testu.
 */
export function pravniStrankaZCesty(pathname: string, zaklad: string = ZAKLAD): PravniStranka | null {
  const bezZakladu = pathname.startsWith(zaklad) ? pathname.slice(zaklad.length) : pathname;
  const cesta = bezZakladu.replace(/\/+$/, "") || "/";
  if (cesta === "/podminky") return "podminky";
  if (cesta === "/soukromi") return "soukromi";
  return null;
}
