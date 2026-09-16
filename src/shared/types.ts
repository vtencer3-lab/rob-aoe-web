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
  hracId: string;
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
 * Jestli hráč hru na svém účtu má: `ma`, `nema` (účet je vidět, hra tam není),
 * `soukromy` (knihovna na Steamu nebo herní historie na Xboxu je skrytá,
 * takže to ověřit nejde).
 */
export type Vlastnictvi = "ma" | "nema" | "soukromy";

export interface PlayerView {
  hracId: string;
  alias: string | null;
  platformaJmeno: string | null;
  avatarUrl: string | null;
  country: string | null;
  elo1v1: number | null;
  eloNejvyssi: number | null;
  odehranoHer: number | null;
  steamHodiny: number | null;
  /** Vlastnictví hry; null = ještě nezjištěno (nebo bez klíče k dané platformě). */
  hraVlastnictvi?: Vlastnictvi | null;
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

/**
 * Redakce podle diváka (`redigujProDivaka`) je vedená na úrovni zápasu
 * (`heslo`, `lobbyId`, `joinUri`, `spectatorUri`, `zpravy`), ne jednotlivých
 * účastníků — pole tady dole vidí úplně každý divák. Kdo sem přidá něco
 * citlivého, musí napřed rozšířit `redigujProDivaka` v `realtime/redakce.ts`.
 */
export interface UcastnikView {
  hracId: string;
  alias: string | null;
  platformaJmeno: string | null;
  tym: Tym;
  barva: Barva;
  /** Předepsaná civilizace (herní id), null = libovolná. */
  civ: number | null;
  /** 1v1 ELO ze žebříčku; chybí ve starších snímcích a testech. */
  elo1v1?: number | null;
  /** Platforma přihlášení; chybí ve starších snímcích a testech (výchozí = Steam). */
  platforma?: "steam" | "xbox";
  jeHost: boolean;
  /** Slot v lobby, od nuly; v tomhle pořadí Rob hráče naklikal. */
  poradi: number;
  kliknulPripojit: string | null;
}

/**
 * Kdo vyhrál: tým (1 až 4), nebo jeden hráč, když hrál sám za sebe („–“).
 * Strany zápasu vznikají ze sestavy, viz strany.ts.
 */
export type Vitez = { tym: Tym } | { hracId: string };

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
  hracId: string;
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
  /** Odpověď na jinou zprávu (migrace 026): náhled původní; null = bez odpovědi nebo původní smazaná. */
  odpovedNa?: { id: number; jmeno: string; text: string } | null;
}

/**
 * Kousek hlasu admina (push-to-talk): jde streamem jako událost `hlas`,
 * mimo stav. `sezeni` odděluje jednotlivá mluvení, `poradi` drží pořadí
 * kousků, `konec` uzavírá sezení. `prijemci` = účastníci zápasu (server podle
 * nich rozhoduje, komu kousek pošle; admini ho dostanou vždy).
 */
export interface HlasUdalost {
  zapasId: number;
  kdo: string;
  jmeno: string;
  sezeni: string;
  poradi: number;
  konec: boolean;
  /** base64 kousku nahrávky; u značky konce prázdné. */
  data: string;
  /** MIME nahrávky, třeba `audio/webm;codecs=opus`. */
  mime?: string;
  prijemci: string[];
}

export interface AkceStavPayload {
  akce: AkceView | null;
  prihlaseni: PlayerView[];
  zapasy: ZapasView[];
  /** Lhůta aktivity v minutách (2–120), globální nastavení webu (migrace 024); chybí ve starších snímcích = 15. */
  lhutaAktivityMinut?: number;
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
