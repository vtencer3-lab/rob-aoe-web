import { CIVILIZACE } from "../../src/shared/civilizace.js";

/**
 * Erby civilizací: výřezy z herních souborů
 * (`resources/_common/wpfg/resources/civ_emblems/*.png`), oříznuté a zmenšené
 * na 96 px výšky (48 px na obrazovce při 2×). Jména souborů jsou herní slugy,
 * které se od názvů liší jen u tří civilizací.
 */
const VYJIMKY: Record<number, string> = { 16: "mayans", 20: "indians", 21: "incas" };

const SOUBORY = import.meta.glob("./assets/civ/*.webp", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

function slug(id: number | null): string {
  if (id === null) return "random";
  return VYJIMKY[id] ?? (CIVILIZACE[id] ?? "").toLowerCase();
}

/** URL erbu civilizace; null = náhodná (herní ikona s otazníkem). Bez erbu undefined. */
export function erbCivilizace(id: number | null): string | undefined {
  return SOUBORY[`./assets/civ/${slug(id)}.webp`];
}
