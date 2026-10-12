import { config } from "../config.js";
import { getPlayer } from "../db/players.js";
import { REZIMY_AKCE, type RezimId } from "../shared/types.js";

/**
 * Módy, ve kterých smí hráč založit akci: admin všechny, zakladatel módu
 * (config.zakladateleModu, Jin pro Diplomacii) jen ty své, ostatní žádný.
 * Jedno místo pro route založení i pro `/api/me`, podle kterého frontend
 * ukáže formulář. Vlastní modul ze stejného důvodu jako diplomacie/opravneni.ts:
 * http/guards importuje auth/routes, takže tam by vznikl cyklus.
 */
export async function rezimyKZalozeni(hracId: string | null): Promise<RezimId[]> {
  if (hracId === null) return [];
  if ((await getPlayer(hracId))?.jeAdmin) return [...REZIMY_AKCE];
  return REZIMY_AKCE.filter((rezim) => config.zakladateleModu.includes(`${rezim}:${hracId}`));
}
