import { describe, expect, it, vi } from "vitest";
import type { InzeratSProfily } from "../external/worldsEdgeLobby.js";
import { hraciZInzeratu } from "./seznamLobby.js";

/** Nejmenší inzerát, který `profilyVInzeratech` projde: host, člen a slot. */
function inzerat(host: number, clenove: number[], sloty: number[] = []): InzeratSProfily {
  return {
    lobbyId: "1",
    hostProfilId: host,
    nazev: "x",
    maHeslo: false,
    povolujeDivaky: true,
    clenoveProfily: clenove,
    slotyProfily: sloty.map((profilId) => ({
      profilId,
      barva: null,
      tym: null,
      civ: null,
      pripraven: false,
    })),
    aiSloty: [],
    pocetSlotu: null,
    preLobby: {
      lobbyTyp: null,
      viditelnost: null,
      maxHracu: null,
      zpozdeniDivakuSekund: null,
      server: null,
    },
    nastaveni: null,
  };
}

function zdroje(
  podleProfilu: Map<number, string>,
  podleSteamId: Map<string, string> = new Map(),
) {
  return {
    podleProfilu: vi.fn(async () => podleProfilu),
    podleSteamId: vi.fn(async () => podleSteamId),
  };
}

describe("hraciZInzeratu", () => {
  it("číslo profilu je hlavní cesta a pokrývá obě platformy", async () => {
    const z = zdroje(
      new Map([
        [101, "76561198014056480"],
        [303, "xbox:2535412345678901"],
      ]),
    );
    const mapa = await hraciZInzeratu([inzerat(101, [101, 303])], new Map(), z);
    expect(mapa.get(101)).toBe("76561198014056480");
    expect(mapa.get(303)).toBe("xbox:2535412345678901");
  });

  // Tohle je ta regrese, kvůli které záložní cesta vznikla. Do přechodu na
  // `profile_id` se každý Steam hráč překládal přímo z `avatars`, nezávisle
  // na databázi. Po něm visí rozpoznání na `player.we_profil_id`, které se
  // doplní až při obnově statistik — a ta se patnáct minut po té předchozí
  // přeskakuje. Hráč, který web zrovna používá, by byl uprostřed večera
  // čtvrt hodiny v lobby neviditelný; komu se dotaz na Worlds Edge nepovede
  // nikdy, byl by neviditelný natrvalo.
  it("bez we_profil_id hráče najde přes Steam ID z avatars", async () => {
    const z = zdroje(new Map(), new Map([["76561198014056480", "76561198014056480"]]));
    const mapa = await hraciZInzeratu(
      [inzerat(101, [101])],
      new Map([[101, "76561198014056480"]]),
      z,
    );
    expect(mapa.get(101)).toBe("76561198014056480");
  });

  it("záložní cesta funguje i pro hráče v slotech, nejen pro hosta", async () => {
    const z = zdroje(new Map(), new Map([["76561198000000072", "76561198000000072"]]));
    const mapa = await hraciZInzeratu(
      [inzerat(1, [], [202])],
      new Map([[202, "76561198000000072"]]),
      z,
    );
    expect(mapa.get(202)).toBe("76561198000000072");
  });

  it("hlavní cesta má přednost — číslo profilu platí pro obě platformy", async () => {
    // Kdyby si člověk někdy slil Steam a Microsoft identitu do jednoho účtu,
    // rozhoduje profil, ne to, co ke starému Steam ID kdysi patřilo.
    const z = zdroje(
      new Map([[101, "xbox:2535412345678901"]]),
      new Map([["76561198014056480", "76561198014056480"]]),
    );
    const mapa = await hraciZInzeratu(
      [inzerat(101, [101])],
      new Map([[101, "76561198014056480"]]),
      z,
    );
    expect(mapa.get(101)).toBe("xbox:2535412345678901");
  });

  it("na Steam ID se ptá jen u profilů, které hlavní cesta nepokryla", async () => {
    // Dotaz navíc běží nad každým načtením seznamu lobby (stovky profilů),
    // takže se nesmí ptát na to, co už je zodpovězené.
    const z = zdroje(new Map([[101, "76561198014056480"]]));
    await hraciZInzeratu(
      [inzerat(101, [101, 202])],
      new Map([
        [101, "76561198014056480"],
        [202, "76561198000000072"],
      ]),
      z,
    );
    expect(z.podleSteamId).toHaveBeenCalledWith(["76561198000000072"]);
  });

  it("bez nepokrytých profilů se na Steam ID neptá vůbec", async () => {
    const z = zdroje(new Map([[101, "76561198014056480"]]));
    await hraciZInzeratu([inzerat(101, [101])], new Map([[101, "76561198014056480"]]), z);
    expect(z.podleSteamId).toHaveBeenCalledWith([]);
  });

  it("profil, který nezná ani jedna cesta, zůstane nerozpoznaný", async () => {
    const z = zdroje(new Map());
    const mapa = await hraciZInzeratu([inzerat(999, [999])], new Map(), z);
    expect(mapa.has(999)).toBe(false);
  });

  it("Steam ID, které na webu nikdo nemá, nic nepřidá", async () => {
    const z = zdroje(new Map(), new Map());
    const mapa = await hraciZInzeratu(
      [inzerat(101, [101])],
      new Map([[101, "76561198999999999"]]),
      z,
    );
    expect(mapa.has(101)).toBe(false);
  });
});
