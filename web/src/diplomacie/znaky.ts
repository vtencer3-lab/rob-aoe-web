import type { Role } from "../../../src/shared/diplomacie/typy.js";
import garda from "../assets/diplomacie/role-garda.webp";
import gm from "../assets/diplomacie/role-gm.webp";
import kat from "../assets/diplomacie/role-kat.webp";
import najezdnik from "../assets/diplomacie/role-najezdnik.webp";
import nastupce from "../assets/diplomacie/role-nastupce.webp";
import sasek from "../assets/diplomacie/role-sasek.webp";
import zoldak from "../assets/diplomacie/role-zoldak.webp";
import relikvie from "../assets/diplomacie/relikvie.webp";
import rubKarty from "../assets/diplomacie/rub-karty.webp";

/**
 * Znaky rolí (spec §8.3): 208 px, tj. 104 px na obrazovce při 2× jako erby
 * civilizací vedle nich. Vygenerované lokálně, zadání
 * `nastroje/grafika/zadani/diplomacie.md`. GM roli nemá, znak ale ano.
 */
export const ZNAK_ROLE: Record<Role | "gm", string> = { nastupce, garda, najezdnik, sasek, zoldak, kat, gm };

/** Rub zakryté karty (pečeť s orlicí) — co hráč vidí, dokud kartu neodkryje. */
export const RUB_KARTY: string = rubKarty;

/** Relikvie ze hry (90×95 px, od uživatele 3. 10. 2026) — místo slova „relikvie“ u počtu. */
export const ZNAK_RELIKVIE: string = relikvie;
