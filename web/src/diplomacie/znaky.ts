import type { Role } from "../../../src/shared/diplomacie/typy.js";
import garda from "../assets/diplomacie/role-garda.webp";
import gm from "../assets/diplomacie/role-gm.webp";
import kat from "../assets/diplomacie/role-kat.webp";
import najezdnik from "../assets/diplomacie/role-najezdnik.webp";
import nastupce from "../assets/diplomacie/role-nastupce.webp";
import sasek from "../assets/diplomacie/role-sasek.webp";
import zoldak from "../assets/diplomacie/role-zoldak.webp";
import relikvie from "../assets/diplomacie/relikvie.webp";
import ikGarda from "../assets/diplomacie/ikonka-garda.webp";
import ikKat from "../assets/diplomacie/ikonka-kat.webp";
import ikNajezdnik from "../assets/diplomacie/ikonka-najezdnik.webp";
import ikNastupce from "../assets/diplomacie/ikonka-nastupce.webp";
import ikRelikvie from "../assets/diplomacie/ikonka-relikvie.webp";
import ikSasek from "../assets/diplomacie/ikonka-sasek.webp";
import ikZoldak from "../assets/diplomacie/ikonka-zoldak.webp";
import plameny from "../assets/diplomacie/plameny.webm";
import prohra from "../assets/diplomacie/prohra.webp";
import rubKarty from "../assets/diplomacie/rub-karty.webp";

/**
 * Znaky rolí (spec §8.3): 208 px, tj. 104 px na obrazovce při 2× jako erby
 * civilizací vedle nich. Vygenerované lokálně, zadání
 * `nastroje/grafika/zadani/diplomacie.md`. GM roli nemá, znak ale ano.
 */
export const ZNAK_ROLE: Record<Role | "gm", string> = { nastupce, garda, najezdnik, sasek, zoldak, kat, gm };

/** Rub zakryté karty (pečeť s orlicí) — co hráč vidí, dokud kartu neodkryje. */
export const RUB_KARTY: string = rubKarty;

/** Prohra role (zlomený meč přes bílou vlajku) — obrazovka „rezignuj“ na kartě. */
export const ZNAK_PROHRA: string = prohra;

/**
 * Plameny hořící karty (proměna Šaška v Gardu): VP9 s průhledností,
 * 720×960, 1,8 s. 2D simulace hoření (Codex), `nastroje/grafika/plameny.mjs`.
 */
export const PLAMENY: string = plameny;

/**
 * Ikonky do textů (TextSIkonami): 56×56 px, CSS je kreslí 28×28 (uživatel
 * 4. 10. 2026: „ve dvojnásobné velikosti, zmenšené přes CSS“). Zmenšené
 * nástrojem `nastroje/grafika/export.py … --sirka 56 --ctverec` ze znaků rolí
 * a relikvie.
 */
export const IKONKA_ROLE: Record<Role, string> = { nastupce: ikNastupce, garda: ikGarda, najezdnik: ikNajezdnik, sasek: ikSasek, zoldak: ikZoldak, kat: ikKat };
export const IKONKA_RELIKVIE: string = ikRelikvie;

/** Relikvie ze hry (90×95 px, od uživatele 3. 10. 2026) — místo slova „relikvie“ u počtu. */
export const ZNAK_RELIKVIE: string = relikvie;
