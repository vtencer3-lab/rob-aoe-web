import { CIVILIZACE } from "../../src/shared/civilizace.js";

/**
 * Erby civilizací: kulaté ikony z herních souborů
 * (`resources/_common/wpfg/resources/civ_techtree/menu_techtree_*.png`, tytéž
 * co v lobby u jména civilizace), zmenšené na 96 px (48 px na obrazovce při
 * 2×). Jména souborů jsou herní slugy, které se od názvů liší u čtyř civilizací.
 */
const VYJIMKY: Record<number, string> = { 16: "mayans", 20: "indians", 21: "inca", 27: "berber" };

const SOUBORY = import.meta.glob("./assets/civ/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

function slug(id: number | null): string {
  if (id === null) return "random";
  return VYJIMKY[id] ?? (CIVILIZACE[id] ?? "").toLowerCase();
}

/** URL erbu civilizace; null = náhodná (herní ikona s otazníkem). Bez erbu undefined. */
export function erbCivilizace(id: number | null): string | undefined {
  return SOUBORY[`./assets/civ/${slug(id)}.webp`];
}
