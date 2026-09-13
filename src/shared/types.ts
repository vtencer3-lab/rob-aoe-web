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

/**
 * Táž barva ve čtvrtém pádě: „má mít modrou“, ne „má mít modrá“. Skloňovat
 * strojově nemá cenu — barev je osm a všechny se vejdou sem.
 */
export const BARVA_KOHO_CO: Record<Barva, string> = {
  1: "modrou",
  2: "červenou",
  3: "zelenou",
  4: "žlutou",
  5: "tyrkysovou",
  6: "fialovou",
  7: "šedou",
  8: "oranžovou",
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

/**
 * Co Steam řekl o vlastnictví hry: `ma` (je v knihovně), `nema` (veřejný
 * profil, hra v knihovně chybí), `soukromy` (knihovna je skrytá, nejde ověřit).
 */
export type SteamVlastnictvi = "ma" | "nema" | "soukromy";

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
  /** Vlastnictví hry podle Steamu; null = ještě nezjištěno (nebo bez klíče). */
  steamHra?: SteamVlastnictvi | null;
  posledniZapas: string | null;
  statyStazenyV: string | null;
  statyChyba: string | null;
  /** Všechny žebříčky pro kartu se statistikami; chybí ve starších snímcích. */
  zebricky?: ZebricekRadek[] | null;
  /**
   * Dokdy platí přihláška do akce (ISO). Po vypršení hráč v tabulce ztmavne
   * a propadne na konec — viz `shared/aktivita.ts`. Vyplňuje se jen v seznamu
   * přihlášených; jinde (a ve starších snímcích stavu) chybí.
   */
  aktivniDo?: string | null;
  /** Kdy admina naposledy svolal zvonkem (ISO); změna = zazvonit. Jen v seznamu přihlášených. */
  svolanV?: string | null;
  /** Jméno admina, který zazvonil naposledy (okno „X tě shání!“). */
  svolalJmeno?: string | null;
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
  /** Lhůta aktivity v minutách (2–120); chybí ve starších snímcích = 15. */
  lhutaAktivityMinut?: number;
  /**
   * Jméno, které dostane příští založená lobby (ROB-NN). Odvozené z pořadí,
   * ne tajné — okno Pre-Lobby ho ukazuje, aby ho host opsal do hry.
   */
  pristiNazevLobby?: string;
  /**
   * Heslo připravené pro příští lobby. Tajemství jako heslo hotového zápasu:
   * mimo adminy se zaslepuje (realtime/redakce.ts).
   */
  pristiHeslo?: string;
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
  /** Dohraný zápas zavřený křížkem: na stránce se neukazuje (v debug módu zašedlý). */
  zavreny?: boolean;
  ucastnici: UcastnikView[];
  /** Chat zápasu (posledních 100); vidí jen účastníci a admini, ostatním ho redakce vyprázdní. */
  zpravy?: ZpravaView[];
  /** Nastavení lobby tohohle zápasu (obtisk akce při založení, dál vlastní); klíče jako u akce. */
  nastaveni?: Record<string, unknown>;
}

/** Zpráva v chatu zápasu. Jméno, barva a tým jsou aktuální, ne z doby odeslání. */
export interface ZpravaView {
  id: number;
  steamId: string;
  jmeno: string;
  jeAdmin: boolean;
  /** Barva a tým z účasti v zápase; admin, který v něm nehraje, má null. */
  barva: Barva | null;
  tym: Tym | null;
  text: string;
  /** ISO čas odeslání. */
  poslano: string;
  /** Autor ji po odeslání přepsal (šipka nahoru); ukazuje se „(editováno)“. */
  upraveno?: boolean;
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
