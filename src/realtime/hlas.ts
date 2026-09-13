import type { Divak } from "./redakce.js";
import { Hub } from "./hub.js";
import type { HlasUdalost } from "../shared/types.js";

/**
 * Hlas admina (push-to-talk, uživatel 13. 9. 2026): admin drží tlačítko,
 * prohlížeč nahrává MediaRecorderem po čtvrtvteřinových kouscích (Opus ve
 * WebM) a každý kousek pošle POSTem; server ho tady rozešle stejným SSE
 * streamem jako stav, jen jako událost `hlas`. Posluchači kousky lepí do
 * MediaSource a hrají skoro živě. Bez WebRTC: žádný signaling, žádný TURN,
 * jen to, co už máme — a pro pár vět za večer to bohatě stačí.
 *
 * Vlastní hub, ne ten stavový: hlas není stav, přírůstky se nespojují a
 * nic z něj se nedrží pro pozdní příchozí.
 */
export const hlasHub = new Hub<HlasUdalost>();

/**
 * Kdo hlas dostane: účastníci zápasu a admini (ti si ostatní adminy můžou
 * ztlumit v prohlížeči). Anonym a divák mimo zápas ne. Mluvčí sám ne —
 * slyšel by se s ozvěnou.
 */
export function smiSlyset(divak: Divak, udalost: HlasUdalost): boolean {
  if (!divak.steamId || divak.steamId === udalost.kdo) return false;
  return divak.jeAdmin || udalost.prijemci.includes(divak.steamId);
}
