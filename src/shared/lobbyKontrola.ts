import { nazevMapy } from "./mapy.js";
import { BARVA_NAZEV, type Barva, type Tym } from "./types.js";

export { MAPY, nazevMapy } from "./mapy.js";

/**
 * Očekávané nastavení lobby, které si režie nastaví u akce. Web ho porovnává
 * s tím, co host ve hře opravdu naklikal (viz zkontrolujLobby). Klíče a
 * hodnoty odpovídají tomu, co seznam lobby ze hry vydává — zmapováno naživo
 * 7. 9. 2026 (docs/analyza-automaticke-hledani-lobby.md).
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
}

export const VYCHOZI_NASTAVENI: NastaveniLobby = {
  mapaId: 10875,
  velikost: null,
  rychlost: 2,
  populace: 200,
  vitezstvi: 1,
  cheaty: false,
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

/** Nejmenší velikost, do které se hráči vejdou, jak ji volí sama hra. */
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
  pripraven: boolean;
}

/** Co ze seznamu lobby ve hře opravdu čteme. */
export interface PoznatekLobby {
  lobbyId: string;
  hostSteamId: string | null;
  maHeslo: boolean;
  povolujeDivaky: boolean;
  sloty: SlotLobby[];
  /** Nastavení hry, pokud šlo rozbalit. */
  nastaveni: {
    mapaId: number | null;
    velikost: number | null;
    rychlost: number | null;
    populace: number | null;
    vitezstvi: number | null;
    cheaty: boolean | null;
  } | null;
}

export interface Kontrola {
  klic: string;
  ok: boolean;
  text: string;
}

export interface KontrolaLobbyVysledek {
  nalezeno: boolean;
  kontroly: Kontrola[];
}

interface UcastnikProKontrolu {
  steamId: string;
  tym: Tym;
  barva: Barva;
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

/**
 * Porovná lobby ve hře se zápasem a očekáváním. Každý řádek je jedna fajfka
 * nebo křížek s větou, kterou Rob přečte v přenosu bez přemýšlení. Hráči se
 * kontrolují po jednom: chybějící, navíc, barva, tým.
 */
export function zkontrolujLobby(
  ucastnici: UcastnikProKontrolu[],
  ocekavane: NastaveniLobby,
  lobby: PoznatekLobby,
): Kontrola[] {
  const k: Kontrola[] = [];
  const vLobby = new Map(lobby.sloty.map((s) => [s.steamId, s]));
  const zapasu = new Set(ucastnici.map((u) => u.steamId));

  k.push({ klic: "divaci", ok: lobby.povolujeDivaky, text: lobby.povolujeDivaky ? "Diváci povoleni" : "Diváci nejsou povoleni — zaškrtni Allow Spectators" });
  k.push({ klic: "heslo", ok: lobby.maHeslo, text: lobby.maHeslo ? "Heslo nastavené" : "Lobby nemá heslo" });

  const chybi = ucastnici.filter((u) => !vLobby.has(u.steamId));
  const navic = lobby.sloty.filter((s) => !zapasu.has(s.steamId));
  k.push({
    klic: "hraci",
    ok: chybi.length === 0 && navic.length === 0,
    text:
      chybi.length === 0 && navic.length === 0
        ? `Hráči: všech ${ucastnici.length} uvnitř`
        : [
            chybi.length > 0 ? `chybí ${chybi.map(jmeno).join(", ")}` : "",
            navic.length > 0 ? `navíc ${navic.length} cizí` : "",
          ]
            .filter(Boolean)
            .join("; ")
            .replace(/^./, (c) => c.toUpperCase()),
  });

  for (const u of ucastnici) {
    const s = vLobby.get(u.steamId);
    if (!s) continue;
    const barvaOk = s.barva === u.barva;
    k.push({
      klic: `barva:${u.steamId}`,
      ok: barvaOk,
      text: barvaOk
        ? `${jmeno(u)}: ${BARVA_NAZEV[u.barva]}`
        : `${jmeno(u)} má ${s.barva === null ? "náhodnou barvu" : BARVA_NAZEV[s.barva]}, má mít ${BARVA_NAZEV[u.barva]}`,
    });
    const tymOk = s.tym === u.tym;
    k.push({
      klic: `tym:${u.steamId}`,
      ok: tymOk,
      text: tymOk ? `${jmeno(u)}: ${popisTymu(u.tym)}` : `${jmeno(u)} má ${popisTymu(s.tym)}, má mít ${popisTymu(u.tym)}`,
    });
  }

  const n = lobby.nastaveni;
  if (!n) {
    k.push({ klic: "nastaveni", ok: false, text: "Nastavení hry se nepodařilo přečíst" });
    return k;
  }
  if (ocekavane.mapaId !== null) {
    const ok = n.mapaId === ocekavane.mapaId;
    k.push({ klic: "mapa", ok, text: ok ? `Mapa: ${nazevMapy(n.mapaId)}` : `Mapa: ${nazevMapy(n.mapaId)}, má být ${nazevMapy(ocekavane.mapaId)}` });
  }
  const velikost = ocekavane.velikost ?? velikostProHrace(ucastnici.length);
  {
    const ok = n.velikost === velikost;
    const jm = (v: number | null) => (v === null ? "?" : (VELIKOSTI[v] ?? `${v} dílců`));
    k.push({ klic: "velikost", ok, text: ok ? `Velikost: ${jm(n.velikost)}` : `Velikost: ${jm(n.velikost)}, má být ${jm(velikost)}` });
  }
  {
    const ok = n.rychlost === ocekavane.rychlost;
    const jm = (v: number | null) => (v === null ? "?" : (RYCHLOSTI[v] ?? String(v)));
    k.push({ klic: "rychlost", ok, text: ok ? `Rychlost: ${jm(n.rychlost)}` : `Rychlost: ${jm(n.rychlost)}, má být ${jm(ocekavane.rychlost)}` });
  }
  {
    const ok = n.populace === ocekavane.populace;
    k.push({ klic: "populace", ok, text: ok ? `Populace: ${n.populace}` : `Populace: ${n.populace ?? "?"}, má být ${ocekavane.populace}` });
  }
  {
    const ok = n.vitezstvi === ocekavane.vitezstvi;
    const jm = (v: number | null) => (v === null ? "?" : (VITEZSTVI[v] ?? String(v)));
    k.push({ klic: "vitezstvi", ok, text: ok ? `Victory: ${jm(n.vitezstvi)}` : `Victory: ${jm(n.vitezstvi)}, má být ${jm(ocekavane.vitezstvi)}` });
  }
  {
    const ok = n.cheaty === ocekavane.cheaty;
    k.push({ klic: "cheaty", ok, text: ok ? (n.cheaty ? "Cheaty povolené" : "Cheaty vypnuté") : n.cheaty ? "Cheaty jsou povolené, mají být vypnuté" : "Cheaty jsou vypnuté, mají být povolené" });
  }
  return k;
}
