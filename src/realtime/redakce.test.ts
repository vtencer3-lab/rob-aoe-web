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
  ucastnici: [
    { steamId: HRAC, alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "x", alias: "Pepa", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
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

  // Specifikace §7: „nachystany | Rob složil sestavu, nikdo to ještě nevidí.“
  // Plán s tím byl v rozporu (createZapas rovnou broadcastuje), specifikace je
  // závazná, takže vyhrává ona.
  it("cizí divák nachystaný zápas vůbec nedostane", () => {
    const nachystany: AkceStavPayload = {
      ...stav,
      zapasy: [{ ...zapas, stav: "nachystany" }],
    };
    expect(redigujProDivaka(nachystany, { steamId: CIZI, jeAdmin: false }).zapasy).toHaveLength(0);
  });

  it("ani účastník nachystaný zápas nedostane — nevidí ho nikdo než Rob", () => {
    const nachystany: AkceStavPayload = {
      ...stav,
      zapasy: [{ ...zapas, stav: "nachystany" }],
    };
    expect(redigujProDivaka(nachystany, { steamId: HRAC, jeAdmin: false }).zapasy).toHaveLength(0);
    expect(redigujProDivaka(nachystany, { steamId: null, jeAdmin: false }).zapasy).toHaveLength(0);
  });

  it("Rob nachystaný zápas vidí — je to jeho skládací pohled", () => {
    const nachystany: AkceStavPayload = {
      ...stav,
      zapasy: [{ ...zapas, stav: "nachystany" }],
    };
    const videny = redigujProDivaka(nachystany, { steamId: "rob", jeAdmin: true }).zapasy;
    expect(videny).toHaveLength(1);
    expect(videny[0]!.stav).toBe("nachystany");
    expect(videny[0]!.heslo).toBe("k7rm2xq9");
  });

  it("skrytí nachystaného zápasu neskryje ostatní zápasy téže akce", () => {
    const dva: AkceStavPayload = {
      ...stav,
      zapasy: [{ ...zapas, id: 9, stav: "nachystany" }, zapas],
    };
    const videny = redigujProDivaka(dva, { steamId: HRAC, jeAdmin: false }).zapasy;
    expect(videny).toHaveLength(1);
    expect(videny[0]!.id).toBe(1);
  });

  it("původní stav se nezmění", () => {
    redigujProDivaka(stav, { steamId: CIZI, jeAdmin: false });
    expect(stav.zapasy[0]!.heslo).toBe("k7rm2xq9");
  });

  it("v jednom payloadu se každý zápas posuzuje zvlášť — ne podle prvního", () => {
    const druhyZapas: ZapasView = {
      ...zapas,
      id: 2,
      poradi: 2,
      nazevLobby: "ROB-02",
      heslo: "jinehesl1",
      lobbyId: "999999999",
      joinUri: "aoe2de://0/999999999",
      spectatorUri: "aoe2de://1/999999999",
      ucastnici: [
        { steamId: CIZI, alias: "Jiny", steamName: null, tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
        { steamId: "y", alias: "Franta", steamName: null, tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
      ],
    };
    const dvaZapasy: AkceStavPayload = { ...stav, zapasy: [zapas, druhyZapas] };

    // HRAC hraje v prvním zápase, ale ve druhém je jen cizí divák — kdyby se
    // úroveň zaslepení počítala jednou za celý payload místo zápas od zápasu,
    // tenhle test by to odhalil.
    const videny = redigujProDivaka(dvaZapasy, { steamId: HRAC, jeAdmin: false });
    expect(videny.zapasy[0]!.heslo).toBe("k7rm2xq9");
    expect(videny.zapasy[0]!.lobbyId).toBe("234230181");
    expect(videny.zapasy[1]!.heslo).toBe("");
    expect(videny.zapasy[1]!.lobbyId).toBeNull();
    expect(videny.zapasy[1]!.joinUri).toBeNull();
    expect(videny.zapasy[1]!.spectatorUri).toBeNull();
  });
});
