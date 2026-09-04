import { describe, expect, it } from "vitest";
import type { AkceStavPayload, ZapasView } from "../shared/types.js";
import { redigujProDivaka } from "./redakce.js";

const HRAC = "76561198000000060";
const CIZI = "76561198000000061";

const zapas: ZapasView = {
  id: 1,
  poradi: 1,
  format: "1v1",
  stav: "lobby_otevrena",
  nazevLobby: "ROB-01",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: "aoe2de://1/234230181",
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: HRAC, alias: "TenceR", tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "x", alias: "Pepa", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

const stav: AkceStavPayload = {
  akce: { id: 1, nazev: "večer", stav: "bezi" },
  prihlaseni: [],
  zapasy: [zapas],
};

describe("redigujProDivaka", () => {
  it("účastník vidí heslo i odkaz na připojení", () => {
    const videny = redigujProDivaka(stav, { steamId: HRAC, jeAdmin: false }).zapasy[0]!;
    expect(videny.heslo).toBe("k7rm2xq9");
    expect(videny.joinUri).toBe("aoe2de://0/234230181");
    expect(videny.lobbyId).toBe("234230181");
  });

  it("Rob vidí navíc divácký odkaz", () => {
    const videny = redigujProDivaka(stav, { steamId: "rob", jeAdmin: true }).zapasy[0]!;
    expect(videny.spectatorUri).toBe("aoe2de://1/234230181");
    expect(videny.heslo).toBe("k7rm2xq9");
  });

  it("účastník divácký odkaz nedostane", () => {
    const videny = redigujProDivaka(stav, { steamId: HRAC, jeAdmin: false }).zapasy[0]!;
    expect(videny.spectatorUri).toBeNull();
  });

  it("cizí divák nevidí heslo, číslo lobby ani žádný odkaz", () => {
    const videny = redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false }).zapasy[0]!;
    expect(videny.heslo).toBe("");
    expect(videny.lobbyId).toBeNull();
    expect(videny.joinUri).toBeNull();
    expect(videny.spectatorUri).toBeNull();
  });

  it("nepřihlášený je taky cizí", () => {
    const videny = redigujProDivaka(stav, { steamId: null, jeAdmin: false }).zapasy[0]!;
    expect(videny.heslo).toBe("");
  });

  it("cizí divák pořád vidí, kdo proti komu hraje a v jakém je to stavu", () => {
    const videny = redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false }).zapasy[0]!;
    expect(videny.nazevLobby).toBe("ROB-01");
    expect(videny.stav).toBe("lobby_otevrena");
    expect(videny.ucastnici).toHaveLength(2);
  });

  it("původní stav se nezmění", () => {
    redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false });
    expect(stav.zapasy[0]!.heslo).toBe("k7rm2xq9");
  });
});
