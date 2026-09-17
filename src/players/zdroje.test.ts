import { describe, expect, it, vi } from "vitest";
import { zdrojeProHrace } from "./zdroje.js";

const ZAKLAD = {
  alias: null, platformaJmeno: null, avatarUrl: null, country: null,
  elo1v1: null, eloNejvyssi: null, odehranoHer: null, posledniZapas: null,
  steamHodiny: null, hraVlastnictvi: null, hraHranoV: null, statyStazenyV: null,
  statyChyba: null, zebricky: null, jeAdmin: false, steamId: null,
  xboxXuid: null, xboxGamertag: null, weProfil: null, weProfilId: null,
};

describe("zdrojeProHrace", () => {
  it("Microsoft hráč bez profilu se hledá podle gamertagu", async () => {
    const podleAliasu = vi.fn().mockResolvedValue(null);
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "xbox:1", platforma: "xbox", xboxGamertag: "Jouki in Rage" },
      "",
      { podleAliasu, podleProfilu: vi.fn(), podleSteamu: vi.fn() },
    );
    await zdroje.nactiZebricek("xbox:1");
    expect(podleAliasu).toHaveBeenCalledWith("Jouki in Rage");
  });

  it("Microsoft hráč s profilem se hledá podle čísla profilu, ne aliasu", async () => {
    // Alias si hráč může ve hře změnit, profil je stálý.
    const podleProfilu = vi.fn().mockResolvedValue(null);
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "xbox:1", platforma: "xbox", xboxGamertag: "X", weProfilId: 6458213 },
      "",
      { podleAliasu: vi.fn(), podleProfilu, podleSteamu: vi.fn() },
    );
    await zdroje.nactiZebricek("xbox:1");
    expect(podleProfilu).toHaveBeenCalledWith(6458213);
  });

  it("Microsoft hráč se Steamu neptá vůbec", async () => {
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "xbox:1", platforma: "xbox", xboxGamertag: "X" },
      "klic",
      { podleAliasu: vi.fn(), podleProfilu: vi.fn(), podleSteamu: vi.fn() },
    );
    expect(await zdroje.nactiProfil("xbox:1")).toBeNull();
    // undefined, ne null: hodnoty v databázi se nesmí přepsat.
    expect(await zdroje.nactiHru("xbox:1")).toBeUndefined();
  });

  it("Steam hráč se dál ptá podle Steam ID", async () => {
    const podleSteamu = vi.fn().mockResolvedValue(null);
    const zdroje = zdrojeProHrace(
      { ...ZAKLAD, hracId: "76561198014056480", platforma: "steam", steamId: "76561198014056480" },
      "",
      { podleAliasu: vi.fn(), podleProfilu: vi.fn(), podleSteamu },
    );
    await zdroje.nactiZebricek("76561198014056480");
    expect(podleSteamu).toHaveBeenCalledWith("76561198014056480");
  });
});
