import type { ZebricekRadek } from "./zebricky.js";

/** Osm barev hráčů přesně v pořadí, v jakém je nabízí hra. */
export type Barva = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export const BARVY: readonly Barva[] = [1, 2, 3, 4, 5, 6, 7, 8];

export const BARVA_NAZEV: Record<Barva, string> = {
  1: "modrá",
  2: "červená",
  3: "zelená",
  4: "žlutá",
  5: "tyrkysová",
  6: "fialová",
  7: "šedá",
  8: "oranžová",
};

/** Tým jako ve hře: 0 je „–“ (bez týmu, hráč sám za sebe), 1 až 4 týmy. */
export type Tym = 0 | 1 | 2 | 3 | 4;
export const TYMY: readonly Tym[] = [0, 1, 2, 3, 4];

/** Jeden řádek sestavy, jak ho Rob naklikal: kdo, jaký tým, jaká barva. Pořadí pole = pořadí slotů v lobby. */
export interface SestavaVstup {
  steamId: string;
  tym: Tym;
  barva: Barva;
  /** Herní id civilizace (civilizace.ts); null nebo chybí = libovolná. */
  civ?: number | null;
}

export interface Seat extends SestavaVstup {
  civ: number | null;
  jeHost: boolean;
  poradi: number;
}

export interface PlayerView {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  avatarUrl: string | null;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  steamHodiny: number | null;
  posledniZapas: string | null;
  statyStazenyV: string | null;
  statyChyba: string | null;
  /** Všechny žebříčky pro kartu se statistikami; chybí ve starších snímcích. */
  zebricky?: ZebricekRadek[] | null;
}

export interface AkceView {
  id: number;
  nazev: string;
  stav: string;
  /** Očekávané nastavení lobby pro kontrolu; chybějící klíče = výchozí (lobbyKontrola.ts). Mění se živě. */
  nastaveniLobby?: Record<string, unknown>;
  /** Snímek nastavení uložený tlačítkem „Uložit nastavení lobby“; null = nic. */
  ulozeneNastaveniLobby?: Record<string, unknown> | null;
  /** Rozpracovaná sestava zápasu, sdílená všemi adminy; pořadí = sloty. */
  skladani?: SestavaVstup[];
}

export interface UcastnikView {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  tym: Tym;
  barva: Barva;
  /** Předepsaná civilizace (herní id), null = libovolná. */
  civ: number | null;
  /** 1v1 ELO ze žebříčku; chybí ve starších snímcích a testech. */
  elo1v1?: number | null;
  jeHost: boolean;
  /** Slot v lobby, od nuly; v tomhle pořadí Rob hráče naklikal. */
  poradi: number;
  kliknulPripojit: string | null;
}

/**
 * Kdo vyhrál: tým (1 až 4), nebo jeden hráč, když hrál sám za sebe („–“).
 * Strany zápasu vznikají ze sestavy, viz strany.ts.
 */
export type Vitez = { tym: Tym } | { steamId: string };

/** Lobby ještě stojí (sedí se v ní), nebo už hra běží. Null = nevíme. */
export type FazeLobby = "lobby" | "hraje_se";

export interface ZapasView {
  id: number;
  poradi: number;
  stav: string;
  nazevLobby: string;
  heslo: string;
  lobbyId: string | null;
  joinUri: string | null;
  spectatorUri: string | null;
  /** Odvozeno ze seznamu otevřených lobby ve hře (sledovaniLobby.ts). */
  fazeLobby?: FazeLobby | null;
  vitez: Vitez | null;
  ucastnici: UcastnikView[];
}

export interface AkceStavPayload {
  akce: AkceView | null;
  prihlaseni: PlayerView[];
  zapasy: ZapasView[];
}

/**
 * Odpověď na „Vyhledat hru“: web se podíval do seznamu otevřených lobby a
 * buď svoji našel (a rovnou uložil její číslo), nebo tam ještě není.
 * `maHeslo` a `povolujeDivaky` jsou kontrola pro hosta: bez diváků se Rob
 * dovnitř nedostane, bez hesla dovnitř vleze kdokoliv.
 */
export interface HledaniLobbyVysledek {
  nalezeno: boolean;
  lobbyId: string | null;
  nazev: string | null;
  maHeslo: boolean | null;
  povolujeDivaky: boolean | null;
}
