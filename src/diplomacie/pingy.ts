import type { PingNaMape } from "../shared/diplomacie/typy.js";

/**
 * Pingy GM na mapě (uživatel 3. 10. 2026): GM klikne do mapy pultu a hráčům
 * (všem, nebo jednomu) se na mapě karty na chvíli ukáže pulzující značka.
 * Jen v paměti jako data ze hry — pomíjivé, po restartu není co obnovovat.
 * Vlastní modul bez závislostí na stavu: čte ho `doplnStav` (rezim.ts), píše
 * routa (routes.ts); stejný důvod jako u `hraPamet.ts`.
 */

/** Jak dlouho ping na mapě svítí. */
export const PING_TRVA_MS = 10_000;
/** Nejvýš tolik pingů naráz v jednom zápase — GM neklikne víc, a paměť se nenafoukne. */
const MAX_PINGU = 20;

const pamet = new Map<number, PingNaMape[]>();
let dalsiId = 1;

/** Platné pingy zápasu; prošlé se cestou zahodí. */
export function pingyZapasu(zapasId: number, ted = Date.now()): PingNaMape[] {
  const platne = (pamet.get(zapasId) ?? []).filter((p) => ted - Date.parse(p.kdy) < PING_TRVA_MS);
  if (platne.length === 0) pamet.delete(zapasId);
  else pamet.set(zapasId, platne);
  return platne;
}

/** Nový ping: místo 0–1 na minimapě, komu (hráči; null = všem). */
export function pridejPing(zapasId: number, x: number, y: number, komu: string[] | null, ted = Date.now()): PingNaMape {
  const ping: PingNaMape = { id: dalsiId++, x, y, komu, kdy: new Date(ted).toISOString() };
  pamet.set(zapasId, [...pingyZapasu(zapasId, ted), ping].slice(-MAX_PINGU));
  return ping;
}

/** Jen pro zkoušky: paměť je modulová a přežila by mezi testy. */
export function zapomenPingy(): void {
  pamet.clear();
}
