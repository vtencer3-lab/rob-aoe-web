import { nazevCivilizace } from "../../src/shared/civilizace.js";
import {
  AI_OBTIZNOSTI,
  KONECNE_VEKY,
  ODKRYTI_MAPY,
  POCATECNI_VEKY,
  REZIMY,
  RYCHLOSTI,
  SADY_CIVILIZACI,
  SUROVINY,
  VELIKOSTI,
  VITEZSTVI,
  type NastaveniLobby,
} from "../../src/shared/lobbyKontrola.js";
import { nazevMapy } from "../../src/shared/mapy.js";
import { BARVA_NAZEV, type SestavaVstup } from "../../src/shared/types.js";

/**
 * Jeden krok historie pro Ctrl+Z / Ctrl+Y: co bylo před a po, věta pro toast
 * a cíl zvýraznění (steamId řádku, nebo klíč nastavení).
 */
export interface ZaznamSkladani {
  druh: "skladani";
  pred: SestavaVstup[];
  po: SestavaVstup[];
  text: string;
  cil: string | null;
}
export interface ZaznamNastaveni {
  druh: "nastaveni";
  pred: NastaveniLobby;
  po: NastaveniLobby;
  text: string;
  cil: string | null;
}
export type Zaznam = ZaznamSkladani | ZaznamNastaveni;

const popisTymu = (t: number) => (t === 0 ? "–" : `tým ${t}`);

/** Věta o změně sestavy a řádek, který se má zvýraznit. */
export function popisZmenySestavy(pred: SestavaVstup[], po: SestavaVstup[], jmeno: (steamId: string) => string): { text: string; cil: string | null } {
  const predIds = new Set(pred.map((v) => v.steamId));
  const poIds = new Set(po.map((v) => v.steamId));
  const pridani = po.filter((v) => !predIds.has(v.steamId));
  const odebrani = pred.filter((v) => !poIds.has(v.steamId));
  if (pridani.length === 1 && odebrani.length === 0) return { text: `${jmeno(pridani[0]!.steamId)} přidán do sestavy`, cil: pridani[0]!.steamId };
  if (odebrani.length === 1 && pridani.length === 0) return { text: `${jmeno(odebrani[0]!.steamId)} vyřazen ze sestavy`, cil: null };
  if (odebrani.length > 0 && po.length === 0) return { text: "Sestava vyprázdněna", cil: null };
  if (pridani.length > 0 || odebrani.length > 0) return { text: "Sestava změněna", cil: null };

  for (const a of pred) {
    const b = po.find((x) => x.steamId === a.steamId)!;
    if (a.barva !== b.barva) return { text: `${jmeno(a.steamId)}: barva ${BARVA_NAZEV[a.barva]} → ${BARVA_NAZEV[b.barva]}`, cil: a.steamId };
    if (a.tym !== b.tym) return { text: `${jmeno(a.steamId)}: ${popisTymu(a.tym)} → ${popisTymu(b.tym)}`, cil: a.steamId };
    if ((a.civ ?? null) !== (b.civ ?? null)) return { text: `${jmeno(a.steamId)}: civilizace ${nazevCivilizace(a.civ ?? null)} → ${nazevCivilizace(b.civ ?? null)}`, cil: a.steamId };
  }
  const predPoradi = pred.map((v) => v.steamId).join(",");
  const poPoradi = po.map((v) => v.steamId).join(",");
  if (predPoradi !== poPoradi) {
    const presunuty = po.find((v, i) => pred[i]?.steamId !== v.steamId);
    return { text: "Pořadí slotů změněno", cil: presunuty?.steamId ?? null };
  }
  return { text: "Sestava beze změny", cil: null };
}

/** Popisky a formátování hodnot nastavení pro toast — stejné názvy jako v panelu. */
const POPISKY: Record<keyof NastaveniLobby, string> = {
  mapaId: "Location",
  velikost: "Map Size",
  rychlost: "Game Speed",
  populace: "Population",
  vitezstvi: "Victory",
  cheaty: "Allow Cheats",
  sadaCivilizaci: "Civilization Set",
  rezim: "Game Mode",
  aiObtiznost: "AI Difficulty",
  suroviny: "Resources",
  odkrytiMapy: "Reveal Map",
  pocatecniVek: "Starting Age",
  konecnyVek: "Ending Age",
  primeri: "Treaty Length",
  lockTeams: "Lock Teams",
  teamTogether: "Team Together",
  teamPositions: "Team Positions",
  sharedExploration: "Shared Exploration",
  lockSpeed: "Lock Speed",
  turbo: "Turbo Mode",
  fullTechTree: "Full Tech Tree",
  empireWars: "Empire Wars Mode",
  suddenDeath: "Sudden Death Mode",
  regicide: "Regicide Mode",
  antiquity: "Antiquity Mode",
  recordGame: "Record Game",
  // Pre-lobby (okno „Create Lobby“)
  lobbyTyp: "Lobby Type",
  viditelnost: "Visibility",
  maxHracu: "Players",
  coopKampan: "Co-Op Campaign",
  povolitDivaky: "Allow Spectators",
  skrytCivilizace: "Hide Civilizations",
  zpozdeniDivaku: "Spectator Delay",
  server: "Server",
  dataMod: "Data Mod",
};

const TABULKY: Partial<Record<keyof NastaveniLobby, Record<number, string>>> = {
  velikost: VELIKOSTI,
  rychlost: RYCHLOSTI,
  vitezstvi: VITEZSTVI,
  sadaCivilizaci: SADY_CIVILIZACI,
  rezim: REZIMY,
  aiObtiznost: AI_OBTIZNOSTI,
  suroviny: SUROVINY,
  odkrytiMapy: ODKRYTI_MAPY,
  pocatecniVek: POCATECNI_VEKY,
  konecnyVek: KONECNE_VEKY,
};

function hodnota(klic: keyof NastaveniLobby, v: unknown): string {
  if (v === null || v === undefined) return klic === "mapaId" ? "libovolná" : klic === "velikost" ? "podle počtu hráčů" : "–";
  if (typeof v === "boolean") return v ? "zapnuto" : "vypnuto";
  if (klic === "mapaId") return nazevMapy(v as number);
  if (klic === "primeri") return v === 0 ? "žádné" : `${v} min`;
  const tabulka = TABULKY[klic];
  return tabulka ? (tabulka[v as number] ?? String(v)) : String(v);
}

/** Věta o změně nastavení lobby (první změněný klíč) a klíč ke zvýraznění. */
export function popisZmenyNastaveni(pred: NastaveniLobby, po: NastaveniLobby): { text: string; cil: string | null } {
  const zmenene = (Object.keys(POPISKY) as Array<keyof NastaveniLobby>).filter((k) => (pred[k] ?? null) !== (po[k] ?? null));
  if (zmenene.length === 0) return { text: "Nastavení beze změny", cil: null };
  const k = zmenene[0]!;
  const dalsi = zmenene.length > 1 ? ` (+${zmenene.length - 1} dalších)` : "";
  return { text: `${POPISKY[k]}: ${hodnota(k, pred[k])} → ${hodnota(k, po[k])}${dalsi}`, cil: k };
}

/** Jak dlouho zvýraznění změny svítí (musí sedět s CSS animací .zmena). */
export const DOBA_ZVYRAZNENI_MS = 1600;

/** Rozsvítí prvek jako změněný; opakované volání animaci spustí znovu. */
export function blikni(el: Element | null | undefined): void {
  if (!(el instanceof HTMLElement)) return;
  el.classList.remove("zmena");
  void el.offsetWidth;
  el.classList.add("zmena");
  setTimeout(() => el.classList.remove("zmena"), DOBA_ZVYRAZNENI_MS);
}
