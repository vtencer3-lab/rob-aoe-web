import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyInzerat } from "../external/worldsEdgeLobby.js";
import { fazeLobbyPro, NEPRITOMNOSTI_PRO_HRAJE_SE, ponechJenFaze } from "../realtime/fazeLobby.js";
import type { AkceStavPayload, ZapasView } from "../shared/types.js";
import { zkontrolujFazeLobby } from "./sledovaniLobby.js";

function zapas(cast: Partial<ZapasView>): ZapasView {
  return {
    id: 1,
    poradi: 1,
    stav: "bezi",
    nazevLobby: "ROB-01",
    heslo: "x",
    lobbyId: "504953429",
    joinUri: "aoe2de://0/504953429",
    spectatorUri: "aoe2de://1/504953429",
    vitez: null,
    ucastnici: [],
    ...cast,
  };
}

function stavS(...zapasy: ZapasView[]): AkceStavPayload {
  return { akce: { id: 1, nazev: "večer", stav: "bezi" }, prihlaseni: [], zapasy };
}

function inzerat(lobbyId: string): LobbyInzerat {
  return { lobbyId, hostSteamId: null, nazev: "", maHeslo: false, povolujeDivaky: false, clenoveSteamIds: [], sloty: [], nastaveni: null };
}

beforeEach(() => {
  ponechJenFaze([]);
});

describe("zkontrolujFazeLobby", () => {
  it("lobby v seznamu = „lobby“; „hraje_se“ až po několika nepřítomnostech za sebou, každá změna rozešle stav", async () => {
    const broadcast = vi.fn().mockResolvedValue(undefined);
    const inzeraty = vi.fn().mockResolvedValueOnce([inzerat("504953429")]).mockResolvedValue([]);
    const deps = { nactiStav: async () => stavS(zapas({})), nactiInzeraty: inzeraty, broadcast };

    expect(await zkontrolujFazeLobby(deps)).toBe(true);
    expect(fazeLobbyPro("504953429")).toBe("lobby");
    for (let i = 1; i < NEPRITOMNOSTI_PRO_HRAJE_SE; i++) {
      expect(await zkontrolujFazeLobby(deps)).toBe(false);
      expect(fazeLobbyPro("504953429")).toBe("lobby");
    }
    expect(await zkontrolujFazeLobby(deps)).toBe(true);
    expect(fazeLobbyPro("504953429")).toBe("hraje_se");
    expect(broadcast).toHaveBeenCalledTimes(2);
  });

  // 7. 9. 2026: seznam ze hry lobby na jedno stažení vynechal a Spectate
  // ukázal „Hraje se“, zatímco se v lobby pořád sedělo. Jedno vynechání
  // nesmí nic přepnout a návrat do seznamu počítadlo nuluje.
  it("jedno vynechání v seznamu fázi nemění a návrat nuluje počítadlo", async () => {
    const broadcast = vi.fn().mockResolvedValue(undefined);
    const inzeraty = vi.fn().mockResolvedValue([inzerat("504953429")]);
    const deps = { nactiStav: async () => stavS(zapas({})), nactiInzeraty: inzeraty, broadcast };
    await zkontrolujFazeLobby(deps);
    for (let kolo = 0; kolo < 3; kolo++) {
      inzeraty.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await zkontrolujFazeLobby(deps);
      await zkontrolujFazeLobby(deps);
      await zkontrolujFazeLobby(deps);
      expect(fazeLobbyPro("504953429")).toBe("lobby");
    }
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("neznámá lobby mimo seznam nedostane „hraje_se“ hned, ale taky až po čase", async () => {
    const deps = { nactiStav: async () => stavS(zapas({})), nactiInzeraty: async () => [], broadcast: vi.fn().mockResolvedValue(undefined) };
    await zkontrolujFazeLobby(deps);
    expect(fazeLobbyPro("504953429")).toBeNull();
    for (let i = 1; i < NEPRITOMNOSTI_PRO_HRAJE_SE; i++) await zkontrolujFazeLobby(deps);
    expect(fazeLobbyPro("504953429")).toBe("hraje_se");
  });

  it("beze změny nerozesílá nic", async () => {
    const broadcast = vi.fn().mockResolvedValue(undefined);
    const deps = {
      nactiStav: async () => stavS(zapas({})),
      nactiInzeraty: async () => [inzerat("504953429")],
      broadcast,
    };
    await zkontrolujFazeLobby(deps);
    expect(await zkontrolujFazeLobby(deps)).toBe(false);
    expect(broadcast).toHaveBeenCalledTimes(1);
  });

  it("bez běžícího zápasu s lobby se seznam vůbec nestahuje", async () => {
    const inzeraty = vi.fn();
    const deps = {
      nactiStav: async () => stavS(zapas({ lobbyId: null, joinUri: null, spectatorUri: null }), zapas({ id: 2, stav: "dohrano" })),
      nactiInzeraty: inzeraty,
      broadcast: vi.fn(),
    };
    expect(await zkontrolujFazeLobby(deps)).toBe(false);
    expect(inzeraty).not.toHaveBeenCalled();
  });

  it("výpadek seznamu fázi nemění", async () => {
    const deps = {
      nactiStav: async () => stavS(zapas({})),
      nactiInzeraty: vi.fn().mockResolvedValueOnce([inzerat("504953429")]).mockRejectedValueOnce(new Error("výpadek")),
      broadcast: vi.fn().mockResolvedValue(undefined),
    };
    await zkontrolujFazeLobby(deps);
    expect(await zkontrolujFazeLobby(deps)).toBe(false);
    expect(fazeLobbyPro("504953429")).toBe("lobby");
  });

  it("dohraný zápas ze sledování vypadne a jeho fáze se zapomene", async () => {
    const deps = {
      nactiStav: vi
        .fn()
        .mockResolvedValueOnce(stavS(zapas({})))
        .mockResolvedValueOnce(stavS(zapas({ stav: "dohrano" }))),
      nactiInzeraty: async () => [inzerat("504953429")],
      broadcast: vi.fn().mockResolvedValue(undefined),
    };
    await zkontrolujFazeLobby(deps);
    await zkontrolujFazeLobby(deps);
    expect(fazeLobbyPro("504953429")).toBeNull();
  });
});
