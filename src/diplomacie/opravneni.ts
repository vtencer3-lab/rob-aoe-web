import { config } from "../config.js";
import { getPlayer } from "../db/players.js";

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
