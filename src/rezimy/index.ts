import type { PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import { diplomacie } from "../diplomacie/rezim.js";
import type { AkceRow } from "../db/events.js";
import type { NastaveniLobby } from "../shared/lobbyKontrola.js";
import type { Divak } from "../realtime/redakce.js";
import type { AkceStavPayload, RezimId, Seat } from "../shared/types.js";

/**
 * Mód akce (spec §4.2). Jádro volá jen tohle rozhraní; klasický večer je
 * prázdná implementace, takže bez Diplomacie se web chová jako dřív.
 * Odebrat mód = smazat jeho modul a řádek v REZIMY.
 */
export interface RezimAkce {
  id: RezimId;
  /** Výchozí nastavení lobby nové akce (dostane výchozí nastavení jádra). */
  vychoziNastaveniLobby(zaklad: NastaveniLobby): Promise<NastaveniLobby>;
  /** Před úpravou sestavy existujícího zápasu: věta (→ 409), nebo null. */
  predZmenouSestavy(zapasId: number): Promise<string | null>;
  /** V transakci založení zápasu, po vložení sedadel. */
  poVytvoreniZapasu(client: PoolClient, zapasId: number, sedadla: Seat[]): Promise<void>;
  /** Větev `rezim` stavu pro prohlížeče — plná, zaslepí ji `rediguj`. */
  doplnStav(akce: AkceRow): Promise<AkceStavPayload["rezim"]>;
  /** Zaslepení větve `rezim` pro jednoho diváka. Volá se i pro admina. */
  rediguj(rezim: NonNullable<AkceStavPayload["rezim"]>, divak: Divak): NonNullable<AkceStavPayload["rezim"]>;
}

const klasicky: RezimAkce = {
  id: "klasicky",
  vychoziNastaveniLobby: async (zaklad) => zaklad,
  predZmenouSestavy: async () => null,
  poVytvoreniZapasu: async () => {},
  doplnStav: async () => undefined,
  rediguj: (rezim) => rezim,
};

const REZIMY: Record<RezimId, RezimAkce> = { klasicky, diplomacie };

export function rezimAkce(id: RezimId): RezimAkce {
  return REZIMY[id];
}

export async function rezimAkceId(akceId: number): Promise<RezimId> {
  const { rows } = await getPool().query<{ rezim: RezimId }>("SELECT rezim FROM akce WHERE id = $1", [akceId]);
  return rows[0]?.rezim ?? "klasicky";
}

export async function rezimZapasu(zapasId: number): Promise<RezimId> {
  const { rows } = await getPool().query<{ rezim: RezimId }>("SELECT a.rezim FROM zapas z JOIN akce a ON a.id = z.akce_id WHERE z.id = $1", [zapasId]);
  return rows[0]?.rezim ?? "klasicky";
}
