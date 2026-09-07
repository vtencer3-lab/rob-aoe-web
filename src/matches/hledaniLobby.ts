import type { LobbyInzerat } from "../external/worldsEdgeLobby.js";

/**
 * Jak jsme lobby poznali. Název ani heslo nejsou podmínkou — hosté si je
 * často nastaví jinak, než web předepsal. Rozhoduje Steam ID lidí v lobby.
 * Pořadí od nejjistějšího: host zápasu ji hostuje, host v ní sedí, hostuje ji
 * jiný účastník zápasu, sedí v ní jiný účastník.
 */
export type DuvodShody = "host_hostuje" | "host_sedi" | "ucastnik_hostuje" | "ucastnik_sedi";

export interface NalezenaLobby {
  lobby: LobbyInzerat;
  duvod: DuvodShody;
}

interface Ucastnik {
  steamId: string;
  jeHost: boolean;
}

export function najdiLobby(ucastnici: Ucastnik[], inzeraty: LobbyInzerat[]): NalezenaLobby | null {
  const host = ucastnici.find((u) => u.jeHost)?.steamId ?? null;
  const vsichni = new Set(ucastnici.map((u) => u.steamId));

  const pravidla: Array<[DuvodShody, (l: LobbyInzerat) => boolean]> = [
    ["host_hostuje", (l) => host !== null && l.hostSteamId === host],
    ["host_sedi", (l) => host !== null && l.clenoveSteamIds.includes(host)],
    ["ucastnik_hostuje", (l) => l.hostSteamId !== null && vsichni.has(l.hostSteamId)],
    ["ucastnik_sedi", (l) => l.clenoveSteamIds.some((s) => vsichni.has(s))],
  ];
  for (const [duvod, sedi] of pravidla) {
    const lobby = inzeraty.find(sedi);
    if (lobby) return { lobby, duvod };
  }
  return null;
}

/**
 * Seznam je jeden pro všechny zápasy a stahuje se celý (kolem 100 kB), takže
 * když na tlačítko klikne šest lidí naráz, nemá smysl se ptát šestkrát.
 * Krátká cache to slije do jednoho dotazu; po jejím vypršení se ptá znovu,
 * aby nově založená lobby nečekala na nic déle než pár vteřin.
 */
export class SeznamLobby {
  #nacti: () => Promise<LobbyInzerat[]>;
  #ttlMs: number;
  #ted: () => number;
  #platiDo = 0;
  #data: LobbyInzerat[] = [];
  #probiha: Promise<LobbyInzerat[]> | null = null;

  constructor(nacti: () => Promise<LobbyInzerat[]>, ttlMs = 2_000, ted: () => number = Date.now) {
    this.#nacti = nacti;
    this.#ttlMs = ttlMs;
    this.#ted = ted;
  }

  async aktualni(): Promise<LobbyInzerat[]> {
    if (this.#ted() < this.#platiDo) return this.#data;
    if (this.#probiha) return this.#probiha;
    this.#probiha = this.#nacti()
      .then((data) => {
        this.#data = data;
        this.#platiDo = this.#ted() + this.#ttlMs;
        return data;
      })
      .finally(() => {
        this.#probiha = null;
      });
    return this.#probiha;
  }
}
