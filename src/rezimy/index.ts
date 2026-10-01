import type { PoolClient } from "pg";
import { getPool } from "../db/pool.js";
import { diplomacie } from "../diplomacie/rezim.js";
import type { AkceRow } from "../db/events.js";
import { VYCHOZI_NASTAVENI, type NastaveniLobby } from "../shared/lobbyKontrola.js";
import type { Divak } from "../realtime/redakce.js";
import type { AkceStavPayload, RezimId, Seat, SestavaVstup } from "../shared/types.js";

/**
 * Mód akce (spec §4.2). Jádro volá jen tohle rozhraní; klasický večer je
 * prázdná implementace, takže bez Diplomacie se web chová jako dřív.
 * Odebrat mód = smazat jeho modul a řádek v REZIMY.
 */
export interface RezimAkce {
  id: RezimId;
  /**
   * Výchozí nastavení lobby akce (dostane výchozí nastavení jádra). Null =
   * mód vlastní výchozí hodnoty nemá: při založení se nic neukládá (akce
   * zůstane s prázdným JSON jako klasický večer) a „Reset nastavení“ nasadí
   * základ jádra (`vychoziNastaveniAkce`).
   */
  vychoziNastaveniLobby(zaklad: NastaveniLobby): Promise<Partial<NastaveniLobby> | null>;
  /** Před úpravou sestavy existujícího zápasu: věta (→ 409), nebo null. */
  predZmenouSestavy(zapasId: number): Promise<string | null>;
  /** Po uložené úpravě sestavy: mód srovná, co se k odstraněným hráčům vázalo. */
  poZmeneSestavy(zapasId: number, sestava: SestavaVstup[]): Promise<void>;
  /** V transakci založení zápasu, po vložení sedadel. */
  poVytvoreniZapasu(client: PoolClient, zapasId: number, sedadla: Seat[]): Promise<void>;
  /** Větev `rezim` stavu pro prohlížeče — plná, zaslepí ji `rediguj`. */
  doplnStav(akce: AkceRow): Promise<AkceStavPayload["rezim"]>;
  /** Zaslepení větve `rezim` pro jednoho diváka. Volá se i pro admina. */
  rediguj(rezim: NonNullable<AkceStavPayload["rezim"]>, divak: Divak): NonNullable<AkceStavPayload["rezim"]>;
}

const klasicky: RezimAkce = {
  id: "klasicky",
  vychoziNastaveniLobby: async () => null,
  predZmenouSestavy: async () => null,
  poZmeneSestavy: async () => {},
  poVytvoreniZapasu: async () => {},
  doplnStav: async () => undefined,
  rediguj: (rezim) => rezim,
};

const REZIMY: Record<RezimId, RezimAkce> = { klasicky, diplomacie };

export function rezimAkce(id: RezimId): RezimAkce {
  return REZIMY[id];
}

/**
 * Co pro akci znamená „výchozí nastavení lobby“: hodnoty módu, nebo základ
 * jádra, když mód žádné nemá. Jedno místo pro tlačítko Reset i pro stav
 * ve snímku (`akce.vychoziNastaveniLobby`), ať obojí srovnává totéž.
 */
export async function vychoziNastaveniAkce(rezim: RezimId): Promise<Partial<NastaveniLobby>> {
  return (await rezimAkce(rezim).vychoziNastaveniLobby(VYCHOZI_NASTAVENI)) ?? VYCHOZI_NASTAVENI;
}

export async function rezimAkceId(akceId: number): Promise<RezimId> {
  const { rows } = await getPool().query<{ rezim: RezimId }>("SELECT rezim FROM akce WHERE id = $1", [akceId]);
  return rows[0]?.rezim ?? "klasicky";
}

export async function rezimZapasu(zapasId: number): Promise<RezimId> {
  const { rows } = await getPool().query<{ rezim: RezimId }>("SELECT a.rezim FROM zapas z JOIN akce a ON a.id = z.akce_id WHERE z.id = $1", [zapasId]);
  return rows[0]?.rezim ?? "klasicky";
}
