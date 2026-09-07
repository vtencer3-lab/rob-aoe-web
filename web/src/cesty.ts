/**
 * Základ všech adres, které frontend posílá na server. Vite ho při buildu
 * dostane z `base` (proměnná BASE_PATH, viz vite.config.ts): na jouki.cz je to
 * `/aoe/` nebo `/aoe/dev/`, při vývoji `/`. Bez toho by `fetch("/api/…")` z
 * `jouki.cz/aoe` šel na kořen domény, kde běží něco jiného.
 */
export const ZAKLAD = import.meta.env.BASE_URL.replace(/\/$/, "");

/** `/api/me` → `/aoe/api/me` (nebo beze změny při vývoji). */
export function cesta(relativni: string): string {
  return `${ZAKLAD}${relativni}`;
}
