import { nazevCivilizace } from "./civilizace.js";
import { nazevMapy } from "./mapy.js";
import { BARVA_NAZEV, type Barva, type Tym } from "./types.js";

export { MAPY, nazevMapy } from "./mapy.js";

/**
 * Očekávané nastavení lobby, které si režie nastaví u akce. Web ho porovnává
 * s tím, co host ve hře opravdu naklikal (viz zkontrolujLobby). Klíče a
 * hodnoty odpovídají tomu, co seznam lobby ze hry vydává — zmapováno naživo
 * 7. 9. 2026 (docs/analyza-automaticke-hledani-lobby.md §6).
 *
 * Hlavní část (mapa, velikost, rychlost, populace, victory, cheaty) se
 * ukazuje v první sekci kontroly; zbytek ve druhé „Další nastavení“. U
 * dalších nastavení znamená null „je to jedno“: kontrola hodnotu jen vypíše
 * a nikdy ji neoznačí za chybu.
 */
export interface NastaveniLobby {
  /** Id mapy ve hře (options[10]); null = nekontrolovat. */
  mapaId: number | null;
  /** Velikost mapy v dílcích (options[8]); null = podle počtu hráčů. */
  velikost: number | null;
  /** 1 Slow, 2 Normal, 3 Fast (options[41]). */
  rychlost: 1 | 2 | 3;
  /** Populační limit (options[28]). */
  populace: number;
  /** 1 Conquest, 9 Standard (options[81]). */
  vitezstvi: 1 | 9;
  /** Allow Cheats (options[1]). */
  cheaty: boolean;

  // --- další nastavení (null = je to jedno) ---
  /** Civilization Set (options[101]): 0 All, 1 Age of Empires II, 2 Chronicles. */
  sadaCivilizaci: number | null;
  /** Game Mode (options[5]): 0 Random Map, 2 Deathmatch, 3 Scenario. */
  rezim: number | null;
  /** AI Difficulty (options[61]): 3 Standard, 1 Hard. */
  aiObtiznost: number | null;
  /** Resources (options[37]): 0 Standard, 3 High. */
  suroviny: number | null;
  /** Reveal Map (options[82]): 0 Normal, 1 Explored, 2 All Visible. */
  odkrytiMapy: number | null;
  /** Starting Age (options[0]): 0 Standard, 3 Feudal, 6 Post-Imperial. */
  pocatecniVek: number | null;
  /** Ending Age (options[4]): 0 Standard, 4 Castle. */
  konecnyVek: number | null;
  /** Treaty Length v minutách (options[57]). */
  primeri: number | null;
  lockTeams: boolean | null;
  teamTogether: boolean | null;
  teamPositions: boolean | null;
  sharedExploration: boolean | null;
  lockSpeed: boolean | null;
  turbo: boolean | null;
  fullTechTree: boolean | null;
  empireWars: boolean | null;
  suddenDeath: boolean | null;
  regicide: boolean | null;
  antiquity: boolean | null;
  recordGame: boolean | null;
}

export const VYCHOZI_NASTAVENI: NastaveniLobby = {
  mapaId: 10875,
  velikost: null,
  rychlost: 2,
  populace: 200,
  vitezstvi: 1,
  cheaty: false,
  sadaCivilizaci: 1,
  rezim: 0,
  // Bez AI v lobby na obtížnosti nezáleží; Lock Teams si každý host řeší sám.
  aiObtiznost: null,
  suroviny: 0,
  odkrytiMapy: 0,
  pocatecniVek: 0,
  konecnyVek: 0,
  primeri: 0,
  lockTeams: null,
  teamTogether: true,
  teamPositions: false,
  sharedExploration: true,
  lockSpeed: true,
  turbo: false,
  fullTechTree: false,
  empireWars: false,
  suddenDeath: false,
  regicide: false,
  antiquity: false,
  recordGame: true,
};

export const VELIKOSTI: Record<number, string> = {
  120: "Tiny (2)",
  144: "Small (3)",
  168: "Medium (4)",
  200: "Normal (6)",
  220: "Large (8)",
  240: "Giant",
};

export const RYCHLOSTI: Record<number, string> = { 1: "Slow", 2: "Normal", 3: "Fast" };
export const VITEZSTVI: Record<number, string> = { 1: "Conquest", 9: "Standard" };
/**
 * Číselníky dalších nastavení. Naživo ověřené hodnoty (7. 9. 2026): sada
 * civilizací celá, režim 0/2/3, AI 3/1, suroviny 0/3, odkrytí 0/1/2, věky
 * 0/3/6 a 0/4. Zbytek je doplněný podle pořadí v herním jazykovém souboru a
 * podle historického číslování aoe2.net (stejný backend) — kdyby seděl
 * špatně, kontrola vypíše špatné jméno, ale porovnává pořád čísla.
 */
export const SADY_CIVILIZACI: Record<number, string> = { 0: "All", 1: "Age of Empires II", 2: "Chronicles" };
export const REZIMY: Record<number, string> = {
  0: "Random Map",
  2: "Deathmatch",
  3: "Scenario",
  4: "King of the Hill",
  5: "Wonder Race",
  6: "Defend the Wonder",
  7: "Turbo Random Map",
  8: "Capture the Relic",
  10: "Battle Royale",
};
export const AI_OBTIZNOSTI: Record<number, string> = { 4: "Easiest", 3: "Standard", 2: "Moderate", 1: "Hard", 0: "Hardest", 5: "Extreme" };
export const SUROVINY: Record<number, string> = { 0: "Standard", 1: "Low", 2: "Medium", 3: "High", 4: "Ultra High", 5: "Infinite" };
export const ODKRYTI_MAPY: Record<number, string> = { 0: "Normal", 1: "Explored", 2: "All Visible", 3: "No Fog" };
export const POCATECNI_VEKY: Record<number, string> = { 0: "Standard", 2: "Dark Age", 3: "Feudal Age", 4: "Castle Age", 5: "Imperial Age", 6: "Post-Imperial Age" };
export const KONECNE_VEKY: Record<number, string> = { 0: "Standard", 2: "Dark Age", 3: "Feudal Age", 4: "Castle Age", 5: "Imperial Age" };

/** Zaškrtávátka z Team Settings a Advanced Settings: klíč v nastavení, český popisek. */
export const ZASKRTAVATKA: ReadonlyArray<{
  klic: keyof Pick<NastaveniLobby, "lockTeams" | "teamTogether" | "teamPositions" | "sharedExploration" | "lockSpeed" | "turbo" | "fullTechTree" | "empireWars" | "suddenDeath" | "regicide" | "antiquity" | "recordGame">;
  popis: string;
}> = [
  { klic: "lockTeams", popis: "Lock Teams" },
  { klic: "teamTogether", popis: "Team Together" },
  { klic: "teamPositions", popis: "Team Positions" },
  { klic: "sharedExploration", popis: "Shared Exploration" },
  { klic: "lockSpeed", popis: "Lock Speed" },
  { klic: "turbo", popis: "Turbo Mode" },
  { klic: "fullTechTree", popis: "Full Tech Tree" },
  { klic: "empireWars", popis: "Empire Wars" },
  { klic: "suddenDeath", popis: "Sudden Death" },
  { klic: "regicide", popis: "Regicide" },
  { klic: "antiquity", popis: "Antiquity Mode" },
  { klic: "recordGame", popis: "Record Game" },
];

/**
 * Nejmenší velikost, do které se hráči vejdou, jak ji volí sama hra.
 *
 * Počítá se **barvami, ne hlavami**: hráči, kteří sdílejí barvu, sedí ve hře
 * na jednom slotu a mají jednu civilizaci, takže na mapě je to pořád jeden
 * hráč. Coop Kings ve třech na jedné barvě proti jednomu soupeři je tedy
 * mapa pro dva, ne pro čtyři.
 */
export function velikostProHrace(pocet: number): number {
  if (pocet <= 2) return 120;
  if (pocet <= 3) return 144;
  if (pocet <= 4) return 168;
  if (pocet <= 6) return 200;
  return 220;
}

export function doplnNastaveni(cast: Partial<NastaveniLobby> | null | undefined): NastaveniLobby {
  return { ...VYCHOZI_NASTAVENI, ...(cast ?? {}) };
}

/** Jeden hráč tak, jak sedí v lobby: barva a tým podle metadat slotu. */
export interface SlotLobby {
  steamId: string;
  /** null = random (ve hře výchozí). */
  barva: Barva | null;
  /** 0 = „–“, 1 až 4 tým, "?" = náhodný, null = nečitelné. */
  tym: Tym | "?" | null;
  /** Herní id civilizace; null = náhodná nebo nečitelná. */
  civ: number | null;
  pripraven: boolean;
}

/** Nastavení hry, jak ho seznam lobby vydává; co nešlo přečíst, je null (nebo chybí). */
export interface NastaveniZeHry {
  mapaId: number | null;
  velikost: number | null;
  rychlost: number | null;
  populace: number | null;
  vitezstvi: number | null;
  cheaty: boolean | null;
  sadaCivilizaci?: number | null;
  rezim?: number | null;
  aiObtiznost?: number | null;
  suroviny?: number | null;
  odkrytiMapy?: number | null;
  pocatecniVek?: number | null;
  konecnyVek?: number | null;
  primeri?: number | null;
  lockTeams?: boolean | null;
  teamTogether?: boolean | null;
  teamPositions?: boolean | null;
  sharedExploration?: boolean | null;
  lockSpeed?: boolean | null;
  turbo?: boolean | null;
  fullTechTree?: boolean | null;
  empireWars?: boolean | null;
  suddenDeath?: boolean | null;
  regicide?: boolean | null;
  antiquity?: boolean | null;
  recordGame?: boolean | null;
}

/** Co ze seznamu lobby ve hře opravdu čteme. */
export interface PoznatekLobby {
  lobbyId: string;
  hostSteamId: string | null;
  maHeslo: boolean;
  povolujeDivaky: boolean;
  sloty: SlotLobby[];
  nastaveni: NastaveniZeHry | null;
}

/**
 * Čtyři stavy řádku: „ok“ zelená, „spatne“ červená, „varovani“ žlutá
 * (neprošlo, ale hře to nebrání), „jedno“ šedá (Rob u toho nastavil „–“,
 * hodnota se jen vypíše). O fajfce rozhoduje jedině to, že není nic červené.
 */
export type StavKontroly = "ok" | "spatne" | "varovani" | "jedno";

export interface Kontrola {
  klic: string;
  stav: StavKontroly;
  text: string;
  /** Hlavní sekce (hráči, diváci, mapa…) nebo „Další nastavení“. */
  sekce: "hlavni" | "dalsi";
}

export interface KontrolaLobbyVysledek {
  nalezeno: boolean;
  kontroly: Kontrola[];
}

/** „Lobby v pořádku“ = nikde nic červeného. Upozornění a „je to jedno“ fajfku neberou. */
export function lobbyVPoradku(kontroly: Kontrola[]): boolean {
  return kontroly.every((k) => k.stav !== "spatne");
}

interface UcastnikProKontrolu {
  steamId: string;
  tym: Tym;
  barva: Barva;
  /** Předepsaná civilizace; null nebo chybí = libovolná, nekontroluje se. */
  civ?: number | null;
  alias?: string | null;
  steamName?: string | null;
}

function jmeno(u: UcastnikProKontrolu): string {
  return u.alias ?? u.steamName ?? u.steamId;
}

function popisTymu(t: Tym | "?" | null): string {
  if (t === null) return "?";
  if (t === "?") return "náhodný";
  return t === 0 ? "–" : `tým ${t}`;
}

const jm = (tabulka: Record<number, string>) => (v: number | null | undefined) =>
  v === null || v === undefined ? "?" : (tabulka[v] ?? String(v));

/**
 * Porovná lobby ve hře se zápasem a očekáváním. Každý řádek je jedna fajfka
 * nebo křížek s větou, kterou Rob přečte v přenosu bez přemýšlení. Hráči se
 * kontrolují po jednom: chybějící, navíc, barva, tým, civilizace.
 */
export function zkontrolujLobby(
  ucastnici: UcastnikProKontrolu[],
  ocekavane: NastaveniLobby,
  lobby: PoznatekLobby,
): Kontrola[] {
  const k: Kontrola[] = [];
  const hlavni = (klic: string, ok: boolean, text: string, varovani = false): void => {
    k.push({ klic, stav: ok ? "ok" : varovani ? "varovani" : "spatne", text, sekce: "hlavni" });
  };
  const vLobby = new Map(lobby.sloty.map((s) => [s.steamId, s]));
  const zapasu = new Set(ucastnici.map((u) => u.steamId));

  hlavni("divaci", lobby.povolujeDivaky, lobby.povolujeDivaky ? "Diváci povoleni" : "Diváci nejsou povoleni — zaškrtni Allow Spectators");
  // Heslo není povinné: bez něj se dá hrát, jen dovnitř může vlézt cizí člověk.
  hlavni("heslo", lobby.maHeslo, lobby.maHeslo ? "Heslo nastavené" : "Lobby nemá heslo — kdokoliv z lobby prohlížeče se může připojit", true);

  const chybi = ucastnici.filter((u) => !vLobby.has(u.steamId));
  const navic = lobby.sloty.filter((s) => !zapasu.has(s.steamId));
  hlavni(
    "hraci",
    chybi.length === 0 && navic.length === 0,
    chybi.length === 0 && navic.length === 0
      ? `Hráči: všech ${ucastnici.length} uvnitř`
      : [chybi.length > 0 ? `chybí ${chybi.map(jmeno).join(", ")}` : "", navic.length > 0 ? `navíc ${navic.length} cizí` : ""]
          .filter(Boolean)
          .join("; ")
          .replace(/^./, (c) => c.toUpperCase()),
  );

  // Týmová hra = některý tým z webu má víc než jednoho hráče. Jen tam záleží
  // na číslech: spoluhráči musí sdílet číslo týmu, soupeři mít jiné. Když
  // hraje každý sám za sebe (1v1, FFA), je jedno, co si nastaví — „–“, „?“
  // i číslo — jen dva soupeři nesmí mít stejné číslo, to by je hra spojila.
  const tymova = ucastnici.some((u) => u.tym !== 0 && ucastnici.filter((x) => x.tym === u.tym).length > 1);
  const cisloTymu = (t: SlotLobby["tym"]) => (typeof t === "number" && t >= 1 ? t : null);

  for (const u of ucastnici) {
    const s = vLobby.get(u.steamId);
    if (!s) continue;
    const barvaOk = s.barva === u.barva;
    hlavni(
      `barva:${u.steamId}`,
      barvaOk,
      barvaOk
        ? `${jmeno(u)}: ${BARVA_NAZEV[u.barva]}`
        : `${jmeno(u)} má ${s.barva === null ? "náhodnou barvu" : BARVA_NAZEV[s.barva]}, má mít ${BARVA_NAZEV[u.barva]}`,
    );
    if (u.civ !== undefined && u.civ !== null) {
      const civOk = s.civ === u.civ;
      hlavni(
        `civ:${u.steamId}`,
        civOk,
        civOk
          ? `${jmeno(u)}: ${nazevCivilizace(u.civ)}`
          : `${jmeno(u)} má ${s.civ === null ? "náhodnou civilizaci" : nazevCivilizace(s.civ)}, má mít ${nazevCivilizace(u.civ)}`,
      );
    }

    const ostatni = ucastnici.filter((x) => x.steamId !== u.steamId && vLobby.has(x.steamId));
    if (!tymova) {
      const stejny = ostatni.find((x) => cisloTymu(vLobby.get(x.steamId)!.tym) !== null && vLobby.get(x.steamId)!.tym === s.tym);
      hlavni(
        `tym:${u.steamId}`,
        !stejny,
        stejny ? `${jmeno(u)} a ${jmeno(stejny)} mají oba tým ${cisloTymu(s.tym)} — soupeři musí mít jiný` : `${jmeno(u)}: ${popisTymu(s.tym)}`,
      );
    } else {
      const moje = cisloTymu(s.tym);
      const spoluhrac = ostatni.find((x) => x.tym === u.tym);
      const souperStejny = ostatni.find((x) => x.tym !== u.tym && moje !== null && cisloTymu(vLobby.get(x.steamId)!.tym) === moje);
      const spoluhracJiny = ostatni.find((x) => x.tym === u.tym && cisloTymu(vLobby.get(x.steamId)!.tym) !== moje);
      let text: string | null = null;
      if (moje === null) text = `${jmeno(u)} má ${popisTymu(s.tym)}, v týmové hře musí mít číslo týmu${spoluhrac ? ` (stejné jako ${jmeno(spoluhrac)})` : ""}`;
      else if (spoluhracJiny) text = `${jmeno(u)} má tým ${moje}, ${jmeno(spoluhracJiny)} ze stejného týmu má ${popisTymu(vLobby.get(spoluhracJiny.steamId)!.tym)}`;
      else if (souperStejny) text = `${jmeno(u)} a soupeř ${jmeno(souperStejny)} mají oba tým ${moje}`;
      hlavni(`tym:${u.steamId}`, text === null, text ?? `${jmeno(u)}: tým ${moje}`);
    }
  }

  const n = lobby.nastaveni;
  if (!n) {
    hlavni("nastaveni", false, "Nastavení hry se nepodařilo přečíst");
    return k;
  }
  if (ocekavane.mapaId !== null) {
    const ok = n.mapaId === ocekavane.mapaId;
    hlavni("mapa", ok, ok ? `Mapa: ${nazevMapy(n.mapaId)}` : `Mapa: ${nazevMapy(n.mapaId)}, má být ${nazevMapy(ocekavane.mapaId)}`);
  }
  const velikost = ocekavane.velikost ?? velikostProHrace(new Set(ucastnici.map((u) => u.barva)).size);
  const jmVelikost = (v: number | null) => (v === null ? "?" : (VELIKOSTI[v] ?? `${v} dílců`));
  hlavni("velikost", n.velikost === velikost, n.velikost === velikost ? `Velikost: ${jmVelikost(n.velikost)}` : `Velikost: ${jmVelikost(n.velikost)}, má být ${jmVelikost(velikost)}`);
  hlavni("rychlost", n.rychlost === ocekavane.rychlost, n.rychlost === ocekavane.rychlost ? `Rychlost: ${jm(RYCHLOSTI)(n.rychlost)}` : `Rychlost: ${jm(RYCHLOSTI)(n.rychlost)}, má být ${jm(RYCHLOSTI)(ocekavane.rychlost)}`);
  hlavni("populace", n.populace === ocekavane.populace, n.populace === ocekavane.populace ? `Populace: ${n.populace}` : `Populace: ${n.populace ?? "?"}, má být ${ocekavane.populace}`);
  hlavni("vitezstvi", n.vitezstvi === ocekavane.vitezstvi, n.vitezstvi === ocekavane.vitezstvi ? `Victory: ${jm(VITEZSTVI)(n.vitezstvi)}` : `Victory: ${jm(VITEZSTVI)(n.vitezstvi)}, má být ${jm(VITEZSTVI)(ocekavane.vitezstvi)}`);
  hlavni("cheaty", n.cheaty === ocekavane.cheaty, n.cheaty === ocekavane.cheaty ? (n.cheaty ? "Cheaty povolené" : "Cheaty vypnuté") : n.cheaty ? "Cheaty jsou povolené, mají být vypnuté" : "Cheaty jsou vypnuté, mají být povolené");

  // --- Další nastavení: stejný tvar, jiná sekce. Očekávané null = „je to
  // jedno“, hodnota se jen vypíše. Co nešlo přečíst, je „?“ a křížek. ---
  const dalsi = (klic: string, popis: string, tabulka: Record<number, string>, ve: number | null | undefined, ma: number | null): void => {
    const stav: StavKontroly = ma === null ? "jedno" : ve === ma ? "ok" : "spatne";
    const text = stav === "spatne" ? `${popis}: ${jm(tabulka)(ve)}, má být ${jm(tabulka)(ma)}` : `${popis}: ${jm(tabulka)(ve)}`;
    k.push({ klic, stav, text, sekce: "dalsi" });
  };
  dalsi("sadaCivilizaci", "Civilization Set", SADY_CIVILIZACI, n.sadaCivilizaci, ocekavane.sadaCivilizaci);
  dalsi("rezim", "Game Mode", REZIMY, n.rezim, ocekavane.rezim);
  dalsi("aiObtiznost", "AI Difficulty", AI_OBTIZNOSTI, n.aiObtiznost, ocekavane.aiObtiznost);
  dalsi("suroviny", "Resources", SUROVINY, n.suroviny, ocekavane.suroviny);
  dalsi("odkrytiMapy", "Reveal Map", ODKRYTI_MAPY, n.odkrytiMapy, ocekavane.odkrytiMapy);
  dalsi("pocatecniVek", "Starting Age", POCATECNI_VEKY, n.pocatecniVek, ocekavane.pocatecniVek);
  dalsi("konecnyVek", "Ending Age", KONECNE_VEKY, n.konecnyVek, ocekavane.konecnyVek);
  {
    const ma = ocekavane.primeri;
    const text = (v: number | null | undefined) => (v === null || v === undefined ? "?" : v === 0 ? "žádné" : `${v} min`);
    const stav: StavKontroly = ma === null ? "jedno" : n.primeri === ma ? "ok" : "spatne";
    k.push({ klic: "primeri", stav, text: stav === "spatne" ? `Treaty Length: ${text(n.primeri)}, má být ${text(ma)}` : `Treaty Length: ${text(n.primeri)}`, sekce: "dalsi" });
  }
  for (const { klic, popis } of ZASKRTAVATKA) {
    const ve = n[klic];
    const ma = ocekavane[klic];
    const zap = (v: boolean | null | undefined) => (v === null || v === undefined ? "?" : v ? "zapnuto" : "vypnuto");
    const stav: StavKontroly = ma === null ? "jedno" : ve === ma ? "ok" : "spatne";
    k.push({ klic, stav, text: stav === "spatne" ? `${popis}: ${zap(ve)}, má být ${zap(ma)}` : `${popis}: ${zap(ve)}`, sekce: "dalsi" });
  }
  return k;
}
