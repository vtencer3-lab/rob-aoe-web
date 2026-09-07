export type Format = "1v1" | "coop_kings_2v2";
export type Tym = 1 | 2;
export type Barva = 1 | 2;

export const BARVA_NAZEV: Record<Barva, string> = {
  1: "modrá",
  2: "červená",
};

export interface Seat {
  steamId: string;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
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
}

export interface AkceView {
  id: number;
  nazev: string;
  stav: string;
}

export interface UcastnikView {
  steamId: string;
  alias: string | null;
  steamName: string | null;
  tym: Tym;
  barva: Barva;
  jeHost: boolean;
  kliknulPripojit: string | null;
}

export interface ZapasView {
  id: number;
  poradi: number;
  format: Format;
  stav: string;
  nazevLobby: string;
  heslo: string;
  lobbyId: string | null;
  joinUri: string | null;
  spectatorUri: string | null;
  viteznyTym: Tym | null;
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
