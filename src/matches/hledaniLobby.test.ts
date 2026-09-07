import { describe, expect, it, vi } from "vitest";
import type { LobbyInzerat } from "../external/worldsEdgeLobby.js";
import { najdiLobby, SeznamLobby } from "./hledaniLobby.js";

const HOST = "76561198000000001";
const HRAC = "76561198000000002";
const CIZI = "76561198000000009";

function lobby(cast: Partial<LobbyInzerat> & { lobbyId: string }): LobbyInzerat {
  return {
    hostSteamId: null,
    nazev: "",
    maHeslo: false,
    povolujeDivaky: false,
    clenoveSteamIds: [],
    ...cast,
  };
}

const ucastnici = [
  { steamId: HOST, jeHost: true },
  { steamId: HRAC, jeHost: false },
];

describe("najdiLobby", () => {
  it("nejdřív bere lobby, kterou host zápasu hostuje", () => {
    const seznam = [
      lobby({ lobbyId: "1", hostSteamId: CIZI, clenoveSteamIds: [CIZI, HOST] }),
      lobby({ lobbyId: "2", hostSteamId: HOST, clenoveSteamIds: [HOST] }),
    ];
    expect(najdiLobby(ucastnici, seznam)).toMatchObject({
      lobby: { lobbyId: "2" },
      duvod: "host_hostuje",
    });
  });

  it("když host jen sedí v cizí lobby, vezme ji s odpovídajícím důvodem", () => {
    const seznam = [lobby({ lobbyId: "1", hostSteamId: CIZI, clenoveSteamIds: [CIZI, HOST] })];
    expect(najdiLobby(ucastnici, seznam)?.duvod).toBe("host_sedi");
  });

  it("jiný účastník, který hostuje, má přednost před účastníkem, který jen sedí", () => {
    const seznam = [
      lobby({ lobbyId: "1", hostSteamId: CIZI, clenoveSteamIds: [CIZI, HRAC] }),
      lobby({ lobbyId: "2", hostSteamId: HRAC, clenoveSteamIds: [HRAC] }),
    ];
    expect(najdiLobby(ucastnici, seznam)).toMatchObject({
      lobby: { lobbyId: "2" },
      duvod: "ucastnik_hostuje",
    });
  });

  it("účastník sedící v cizí lobby je poslední záchrana", () => {
    const seznam = [lobby({ lobbyId: "1", hostSteamId: CIZI, clenoveSteamIds: [CIZI, HRAC] })];
    expect(najdiLobby(ucastnici, seznam)?.duvod).toBe("ucastnik_sedi");
  });

  it("název lobby nerozhoduje — cizí lobby s naším názvem se nebere", () => {
    const seznam = [lobby({ lobbyId: "1", hostSteamId: CIZI, nazev: "ROB-01", clenoveSteamIds: [CIZI] })];
    expect(najdiLobby(ucastnici, seznam)).toBeNull();
  });

  it("bez hosta v zápase hledá jen podle účastníků", () => {
    const seznam = [lobby({ lobbyId: "1", hostSteamId: HRAC })];
    expect(najdiLobby([{ steamId: HRAC, jeHost: false }], seznam)?.duvod).toBe("ucastnik_hostuje");
  });
});

describe("SeznamLobby", () => {
  it("v rámci TTL se ptá jen jednou, po vypršení znovu", async () => {
    let ted = 1_000;
    const nacti = vi.fn().mockResolvedValue([lobby({ lobbyId: "1" })]);
    const seznam = new SeznamLobby(nacti, 5_000, () => ted);

    await seznam.aktualni();
    await seznam.aktualni();
    expect(nacti).toHaveBeenCalledTimes(1);

    ted += 5_001;
    await seznam.aktualni();
    expect(nacti).toHaveBeenCalledTimes(2);
  });

  it("souběžná volání sdílejí jeden probíhající dotaz", async () => {
    let uvolni!: (v: LobbyInzerat[]) => void;
    const nacti = vi.fn(() => new Promise<LobbyInzerat[]>((r) => (uvolni = r)));
    const seznam = new SeznamLobby(nacti, 5_000, () => 0);

    const a = seznam.aktualni();
    const b = seznam.aktualni();
    uvolni([lobby({ lobbyId: "7" })]);
    expect(await a).toEqual(await b);
    expect(nacti).toHaveBeenCalledTimes(1);
  });

  it("chyba stahování se nezacachuje — další volání to zkusí znovu", async () => {
    const nacti = vi
      .fn()
      .mockRejectedValueOnce(new Error("výpadek"))
      .mockResolvedValueOnce([lobby({ lobbyId: "1" })]);
    const seznam = new SeznamLobby(nacti, 5_000, () => 0);

    await expect(seznam.aktualni()).rejects.toThrow(/výpadek/);
    expect(await seznam.aktualni()).toHaveLength(1);
  });
});
