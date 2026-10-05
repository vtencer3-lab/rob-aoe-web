import { config } from "../config.js";
import { getPlayer } from "../db/players.js";
import type { DiploZapas } from "../shared/diplomacie/typy.js";
import { getDiploZapas, ktereZapasyBezi } from "./db.js";

/**
 * Kdo smí nahrávat a aktivovat verze scénáře (spec §5.1): admin webu nebo
 * autor ze seznamu AUTORI_SCENARE. Jin tak nahrává sám, i když není admin.
 *
 * Vlastní modul schválně: potřebuje to `/api/me` v auth/routes.ts, a kdyby
 * tohle bydlelo v diplomacie/routes.ts, vznikl by cyklus auth/routes →
 * diplomacie/routes → http/guards → auth/routes.
 */
export async function smiNahratScenar(hracId: string | null): Promise<boolean> {
  if (hracId === null) return false;
  if (config.autoriScenare.includes(hracId)) return true;
  return (await getPlayer(hracId))?.jeAdmin ?? false;
}

/**
 * GM zápasu je hráč na šedé (db.ts ho dopočítává ze sestavy, neukládá se).
 * Jedno místo pro routy GM i pro háček hlasu; zápas bez hráče na šedé má
 * `gmHracId` prázdné a GM v něm není nikdo.
 */
export function jeGm(diplo: Pick<DiploZapas, "gmHracId"> | null, hracId: string | null): boolean {
  return diplo !== null && hracId !== null && diplo.gmHracId !== "" && diplo.gmHracId === hracId;
}

/** Totéž z databáze; zápas mimo Diplomacii GM nemá. */
export async function jeGmZapasu(zapasId: number, hracId: string): Promise<boolean> {
  return jeGm(await getDiploZapas(zapasId), hracId);
}

/**
 * Háček hlasu (push-to-talk GM): mluvit do zápasu smí jeho GM, ale jen
 * dokud zápas běží v otevřené akci — po dohrání, zrušení nebo v archivu
 * akce by jinak hlas GM vyskočil hráčům ve staré kartě.
 */
export async function smiGmMluvit(zapasId: number, hracId: string): Promise<boolean> {
  return (await jeGmZapasu(zapasId, hracId)) && (await ktereZapasyBezi([zapasId])).length > 0;
}
