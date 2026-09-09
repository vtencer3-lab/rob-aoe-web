import { describe, expect, it } from "vitest";
import { AI_OBTIZNOSTI, doplnNastaveni, type PoznatekLobby as _PL, type PreLobbyZeHry, lobbyVPoradku, ODKRYTI_MAPY, REZIM_EMPIRE_WARS, REZIMY, SUROVINY, velikostProHrace, VELIKOSTI, VITEZSTVI, VYCHOZI_NASTAVENI, zkontrolujLobby, type PoznatekLobby } from "./lobbyKontrola.js";
import { nazevMapy } from "./mapy.js";
import type { Barva, Tym } from "./types.js";

const HOST = "76561198014710095";
const JA = "76561198014056480";

const u = (steamId: string, tym: Tym, barva: Barva, alias: string) => ({ steamId, tym, barva, alias });

/** Nastavení ze hry přesně podle výchozího očekávání (velikost pro dva). */
const podleOcekavani = { ...VYCHOZI_NASTAVENI, velikost: 120 };

function lobby(cast: Partial<PoznatekLobby> = {}): PoznatekLobby {
  return {
    lobbyId: "504987862",
    hostSteamId: HOST,
    maHeslo: true,
    povolujeDivaky: true,
    sloty: [
      { steamId: HOST, barva: 1, tym: 1, civ: null, pripraven: true },
      { steamId: JA, barva: 2, tym: 0, civ: null, pripraven: true },
    ],
    nastaveni: podleOcekavani,
    ...cast,
  };
}

const sestava = [u(HOST, 1, 1, "Trokner"), u(JA, 0, 2, "Jouki")];
const ocekavane = doplnNastaveni(null);

describe("zkontrolujLobby", () => {
  it("lobby přesně podle zápasu projde celá; hlavní sekce před dalším nastavením", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby());
    expect(k.every((x) => x.stav === "ok" || x.stav === "jedno")).toBe(true);
    // „Je to jedno“ zůstala ve výchozím stavu jen AI obtížnost; Lock Teams se
    // od 9. 9. 2026 vyžaduje zapnutý (sestavu skládá Rob, v lobby se s ní nehýbe).
    // Pre-lobby: bez údajů ze hry se nekontroluje nic z okna zakládání.
    expect(k.filter((x) => x.stav === "jedno").map((x) => x.klic)).toEqual([
      "aiObtiznost", "lobbyTyp", "viditelnost", "maxHracu", "skrytCivilizace", "zpozdeniDivaku", "server",
    ]);
    expect(k.filter((x) => x.sekce === "hlavni").map((x) => x.klic)).toEqual([
      "hraci", `barva:${HOST}`, `tym:${HOST}`, `barva:${JA}`, `tym:${JA}`,
      "mapa", "velikost", "rychlost", "populace", "vitezstvi", "cheaty",
    ]);
    expect(k.filter((x) => x.sekce === "dalsi").map((x) => x.klic)).toEqual([
      "sadaCivilizaci", "rezim", "aiObtiznost", "suroviny", "odkrytiMapy", "pocatecniVek", "konecnyVek", "primeri",
      "lockTeams", "teamTogether", "teamPositions", "sharedExploration", "lockSpeed", "turbo", "fullTechTree",
      "empireWars", "suddenDeath", "regicide", "antiquity", "recordGame",
    ]);
    expect(lobbyVPoradku(k)).toBe(true);
  });

  it("chybějící a cizí hráče pojmenuje", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: null, pripraven: true }, { steamId: "cizi", barva: 3, tym: 0, civ: null, pripraven: false }] }));
    const hraci = k.find((x) => x.klic === "hraci")!;
    expect(hraci.stav).toBe("spatne");
    expect(hraci.text).toBe("Chybí Jouki; navíc 1 cizí");
    // Kdo v lobby není, nemá řádky barvy a týmu.
    expect(k.some((x) => x.klic === `barva:${JA}`)).toBe(false);
    expect(lobbyVPoradku(k)).toBe(false);
  });

  // Seznam lobby ze hry vydává jen sloty se Steam účtem, takže AI v datech
  // není vidět vůbec. Kontrola ji proto nesmí počítat mezi chybějící — jen
  // řekne, kolik jich ověřit nejde.
  // Od 9. 9. 2026 hra AI ve slotech prozradí (status 2), takže se dá ověřit
  // jako člověk: kolik jich sedí uvnitř, jakou mají barvu a tým. Rozlišit je
  // mezi sebou nejde — nemají id — takže se párují podle barvy.
  it("AI v lobby spáruje podle barvy a hlásí ji jako hráče", () => {
    const sAi = [...sestava, u("ai:1", 2, 3, "AI")];
    const k = zkontrolujLobby(sAi, ocekavane, lobby({ aiSloty: [{ barva: 3, tym: 3, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === "hraci")).toMatchObject({ stav: "ok", text: "Hráči: všichni 3 uvnitř (1 AI)" });
    expect(k.find((x) => x.klic === "barva:ai:1")).toMatchObject({ stav: "ok", text: "AI: zelená" });
  });

  it("chybějící AI pozná stejně jako chybějícího člověka", () => {
    const sAi = [...sestava, u("ai:1", 2, 3, "AI")];
    const k = zkontrolujLobby(sAi, ocekavane, lobby({ aiSloty: [] }));
    expect(k.find((x) => x.klic === "hraci")).toMatchObject({ stav: "spatne", text: "Chybí AI" });
  });

  it("AI navíc v lobby je taky chyba", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ aiSloty: [{ barva: 3, tym: 3, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === "hraci")).toMatchObject({ stav: "spatne", text: "Navíc 1 AI" });
  });

  it("špatná barva AI se pojmenuje jako u člověka", () => {
    const sAi = [...sestava, u("ai:1", 2, 3, "AI")];
    const k = zkontrolujLobby(sAi, ocekavane, lobby({ aiSloty: [{ barva: null, tym: 3, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === "barva:ai:1")!.text).toBe("AI má náhodnou barvu, má mít zelená");
  });

  it("bez AI zůstává hlášení o hráčích beze změny", () => {
    const hraci = zkontrolujLobby(sestava, ocekavane, lobby()).find((x) => x.klic === "hraci")!;
    expect(hraci.text).toBe("Hráči: všech 2 uvnitř");
  });

  it("špatná barva říká, co má být; v 1v1 tým nevadí, dokud není stejný jako soupeřův", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: null, tym: "?", civ: null, pripraven: true }, { steamId: JA, barva: 4, tym: 2, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === `barva:${HOST}`)!.text).toBe("Trokner má náhodnou barvu, má mít modrá");
    expect(k.find((x) => x.klic === `barva:${JA}`)!.text).toBe("Jouki má žlutá, má mít červená");
    expect(k.find((x) => x.klic === `tym:${HOST}`)).toMatchObject({ stav: "ok", text: "Trokner: náhodný" });
    expect(k.find((x) => x.klic === `tym:${JA}`)).toMatchObject({ stav: "ok", text: "Jouki: tým 2" });
  });

  it("v 1v1 je chyba jen stejné číslo týmu u obou", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: null, pripraven: true }, { steamId: JA, barva: 2, tym: 1, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === `tym:${HOST}`)).toMatchObject({ stav: "spatne", text: /Trokner a Jouki mají oba tým 1/ });
    expect(k.find((x) => x.klic === `tym:${JA}`)!.stav).toBe("spatne");
  });

  it("v týmové hře musí spoluhráči sdílet číslo týmu a soupeři mít jiné", () => {
    const dvaNaDva = [u(HOST, 1, 1, "Trokner"), u("b", 1, 1, "Pepa"), u(JA, 2, 2, "Jouki"), u("d", 2, 2, "Lukas")];
    const sloty = (t: Array<import("./lobbyKontrola.js").SlotLobby["tym"]>) =>
      [HOST, "b", JA, "d"].map((steamId, i) => ({ steamId, barva: (i < 2 ? 1 : 2) as Barva, tym: t[i]!, civ: null, pripraven: true }));
    const ok = zkontrolujLobby(dvaNaDva, ocekavane, lobby({ sloty: sloty([3, 3, 4, 4]) }));
    expect(ok.filter((x) => x.klic.startsWith("tym:")).every((x) => x.stav === "ok")).toBe(true);

    const spatne = zkontrolujLobby(dvaNaDva, ocekavane, lobby({ sloty: sloty([1, 0, 1, 2]) }));
    const t = Object.fromEntries(spatne.map((x) => [x.klic, x.text]));
    expect(t[`tym:b`]).toBe("Pepa má –, v týmové hře musí mít číslo týmu (stejné jako Trokner)");
    expect(t[`tym:${HOST}`]).toBe("Trokner má tým 1, Pepa ze stejného týmu má –");
    expect(t[`tym:${JA}`]).toBe("Jouki má tým 1, Lukas ze stejného týmu má tým 2");
  });

  it("předepsaná civilizace se porovná, libovolná se přeskočí", () => {
    const s2 = [{ ...sestava[0]!, civ: 18 }, sestava[1]!];
    const k = zkontrolujLobby(s2, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: 2, pripraven: true }, { steamId: JA, barva: 2, tym: 0, civ: null, pripraven: true }] }));
    expect(k.find((x) => x.klic === `civ:${HOST}`)).toMatchObject({ stav: "spatne", text: "Trokner má Franks, má mít Koreans" });
    expect(k.some((x) => x.klic === `civ:${JA}`)).toBe(false);
    const ok = zkontrolujLobby(s2, ocekavane, lobby({ sloty: [{ steamId: HOST, barva: 1, tym: 1, civ: 18, pripraven: true }] }));
    expect(ok.find((x) => x.klic === `civ:${HOST}`)).toMatchObject({ stav: "ok", text: "Trokner: Koreans" });
  });

  // Heslo není povinné: bez něj se hrát dá, jen do lobby může vlézt někdo
  // cizí. Je to upozornění, ne chyba — „lobby v pořádku“ na něm nestojí.
  it("zakázaní diváci jsou chyba, chybějící heslo jen upozornění", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ povolujeDivaky: false, maHeslo: false }));
    expect(k.find((x) => x.klic === "povolitDivaky")).toMatchObject({ stav: "spatne", text: /Allow Spectators/ });
    expect(k.find((x) => x.klic === "heslo")).toMatchObject({ stav: "varovani", sekce: "prelobby" });
    expect(lobbyVPoradku(k)).toBe(false);
    const jenBezHesla = zkontrolujLobby(sestava, ocekavane, lobby({ maHeslo: false }));
    expect(lobbyVPoradku(jenBezHesla)).toBe(true);
  });

  it("nastavení hry porovná s očekáváním a pojmenuje hodnoty", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: { ...podleOcekavani, mapaId: 10878, velikost: 168, rychlost: 3, populace: 150, vitezstvi: 9, cheaty: true } }));
    const t = Object.fromEntries(k.map((x) => [x.klic, x.text]));
    expect(t["mapa"]).toBe("Mapa: Black Forest, má být Arabia");
    expect(t["velikost"]).toBe("Velikost: Medium (4), má být Tiny (2)");
    expect(t["rychlost"]).toBe("Rychlost: Fast, má být Normal");
    expect(t["populace"]).toBe("Populace: 150, má být 200");
    expect(t["vitezstvi"]).toBe("Victory: Standard, má být Conquest");
    expect(t["cheaty"]).toBe("Cheaty jsou povolené, mají být vypnuté");
  });

  // Další nastavení se hlásí ve své sekci; červená tam fajfku bere stejně
  // jako v hlavní. Co Rob nastaví na „–“, je „je to jedno“: vypíše se šedě
  // a nikdy není chyba.
  it("další nastavení porovná ve vlastní sekci; „–“ je jedno, červená bere fajfku", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ lockTeams: true, primeri: null }), lobby({ nastaveni: { ...podleOcekavani, sadaCivilizaci: 2, aiObtiznost: 1, primeri: 15, lockTeams: false, teamPositions: null } }));
    const t = Object.fromEntries(k.map((x) => [x.klic, x]));
    expect(t["sadaCivilizaci"]).toMatchObject({ stav: "spatne", sekce: "dalsi", text: "Civilization Set: Chronicles, má být Age of Empires II" });
    expect(t["aiObtiznost"]).toMatchObject({ stav: "jedno", text: "AI Difficulty: Hard" });
    expect(t["primeri"]).toMatchObject({ stav: "jedno", text: "Treaty Length: 15 min" });
    expect(t["lockTeams"]).toMatchObject({ stav: "spatne", text: "Lock Teams: vypnuto, má být zapnuto" });
    expect(t["teamPositions"]).toMatchObject({ stav: "spatne", text: "Team Positions: ?, má být vypnuto" });
    expect(t["recordGame"]).toMatchObject({ stav: "ok", text: "Record Game: zapnuto" });
    expect(lobbyVPoradku(k)).toBe(false);

    const jenJedno = zkontrolujLobby(sestava, doplnNastaveni({ sadaCivilizaci: null }), lobby({ nastaveni: { ...podleOcekavani, sadaCivilizaci: 2 } }));
    expect(jenJedno.find((x) => x.klic === "sadaCivilizaci")).toMatchObject({ stav: "jedno", text: "Civilization Set: Chronicles" });
    expect(lobbyVPoradku(jenJedno)).toBe(true);
  });

  it("mapa null = nekontroluje se, velikost null = podle počtu hráčů", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ mapaId: null }), lobby({ nastaveni: { ...podleOcekavani, mapaId: 301112 } }));
    expect(k.some((x) => x.klic === "mapa")).toBe(false);
    expect(k.find((x) => x.klic === "velikost")!.stav).toBe("ok");
  });

  // Hráči na jedné barvě sedí ve hře na jednom slotu, takže na mapě je to
  // jeden hráč. Čtyři lidé ve dvou barvách proto potřebují mapu pro dva
  // (120 dílců), ne pro čtyři.
  it("velikost mapy počítá barvy, ne hlavy", () => {
    const coop = [
      u(HOST, 1, 1, "Trokner"),
      u("76561198000000001", 1, 1, "Kolega"),
      u(JA, 2, 2, "Jouki"),
      u("76561198000000002", 2, 2, "Soupeř"),
    ];
    const sloty = coop.map((c) => ({ steamId: c.steamId, barva: c.barva, tym: c.tym, civ: null, pripraven: true }));
    const k = zkontrolujLobby(coop, ocekavane, lobby({ sloty, nastaveni: { ...VYCHOZI_NASTAVENI, velikost: 120 } }));
    expect(k.find((x) => x.klic === "velikost")!.stav).toBe("ok");

    const vetsi = zkontrolujLobby(coop, ocekavane, lobby({ sloty, nastaveni: { ...VYCHOZI_NASTAVENI, velikost: 168 } }));
    expect(vetsi.find((x) => x.klic === "velikost")!.stav).toBe("spatne");
  });

  it("nečitelné nastavení je jeden křížek místo pádu", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({ nastaveni: null }));
    expect(k.at(-1)).toMatchObject({ klic: "nastaveni", stav: "spatne", sekce: "hlavni" });
    expect(lobbyVPoradku(k)).toBe(false);
  });
});

describe("pomocné tabulky", () => {
  it("velikost podle počtu hráčů kopíruje hru", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(velikostProHrace)).toEqual([120, 120, 144, 168, 200, 200, 220, 220]);
  });

  it("mapy zná jménem, neznámé číslem", () => {
    expect(nazevMapy(10875)).toBe("Arabia");
    expect(nazevMapy(10901)).toBe("Nomad");
    expect(nazevMapy(301112)).toBe("Earth");
    expect(nazevMapy(1)).toBe("mapa č. 1");
    expect(nazevMapy(null)).toBe("libovolná");
  });
});

// Čísla režimů byla převzatá z aoe2.net a od čtyřky výš seděla o jedna vedle:
// „Capture the Relic“ posílalo 8, což je ve hře Turbo Random Map. Ověřeno
// 9. 9. 2026 proti definici herního Control API (aoe2control) i proti
// živému seznamu lobby, kde běžely režimy 1 a 13, které tabulka neznala.
describe("REZIMY", () => {
  it("čísla sedí s herním OptionsGameMode", () => {
    expect(REZIMY[0]).toBe("Random Map");
    expect(REZIMY[1]).toBe("Regicide");
    expect(REZIMY[2]).toBe("Death Match");
    expect(REZIMY[3]).toBe("Scenario");
    expect(REZIMY[5]).toBe("King of the Hill");
    expect(REZIMY[6]).toBe("Wonder Race");
    expect(REZIMY[7]).toBe("Defend the Wonder");
    expect(REZIMY[8]).toBe("Turbo Random Map");
    expect(REZIMY[10]).toBe("Capture the Relic");
    expect(REZIMY[11]).toBe("Sudden Death");
    expect(REZIMY[12]).toBe("Battle Royale");
    expect(REZIMY[REZIM_EMPIRE_WARS]).toBe("Empire Wars");
  });

  it("Empire Wars je režim 13", () => {
    expect(REZIM_EMPIRE_WARS).toBe(13);
  });
});

// Zbylé číselníky proti témuž zdroji (herní Control API, 9. 9. 2026).
describe("číselníky nastavení", () => {
  it("Extreme je u AI obtížnosti −1, ne 5", () => {
    expect(AI_OBTIZNOSTI[-1]).toBe("Extreme");
    expect(AI_OBTIZNOSTI[5]).toBeUndefined();
    expect(AI_OBTIZNOSTI[0]).toBe("Hardest");
    expect(AI_OBTIZNOSTI[4]).toBe("Easiest");
  });

  it("velikosti mapy znají i Ludicrous", () => {
    expect(VELIKOSTI[240]).toBe("Giant");
    expect(VELIKOSTI[480]).toBe("Ludicrous");
  });

  it("odkrytí mapy má jen tři stupně — No Fog hra nezná", () => {
    expect(Object.keys(ODKRYTI_MAPY)).toEqual(["0", "1", "2"]);
  });

  it("vítězství zná i Time Limit, Score a Last Man Standing", () => {
    expect(VITEZSTVI[1]).toBe("Conquest");
    expect(VITEZSTVI[9]).toBe("Standard");
    expect(VITEZSTVI[7]).toBe("Time Limit");
    expect(VITEZSTVI[8]).toBe("Score");
    expect(VITEZSTVI[11]).toBe("Last Man Standing");
  });

  it("suroviny znají i Random", () => {
    expect(SUROVINY[6]).toBe("Random");
  });
});

// Pre-lobby: okno „Create Lobby“. Heslo a diváci sem patří taky — nastavují
// se při zakládání lobby, ne v herním panelu.
describe("kontrola pre-lobby", () => {
  const preLobby = (cast: Partial<PreLobbyZeHry> = {}): PreLobbyZeHry => ({
    lobbyTyp: 0,
    viditelnost: 1,
    maxHracu: 8,
    zpozdeniDivakuSekund: 0,
    server: "westeurope",
    ...cast,
  });
  const sHrou = (cast: Partial<PreLobbyZeHry> = {}, dalsi: Partial<PoznatekLobby> = {}) =>
    lobby({ preLobby: preLobby(cast), ...dalsi });

  it("heslo a diváci se přesunuli z hlavní sekce do pre-lobby", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni(null), sHrou());
    expect(k.filter((x) => x.sekce === "hlavni").map((x) => x.klic)).not.toContain("heslo");
    expect(k.filter((x) => x.sekce === "prelobby").map((x) => x.klic)).toContain("heslo");
    expect(k.filter((x) => x.sekce === "prelobby").map((x) => x.klic)).toContain("povolitDivaky");
  });

  it("výchozí Unranked lobby bez zpoždění projde", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni(null), sHrou());
    expect(k.filter((x) => x.sekce === "prelobby" && x.stav === "spatne")).toHaveLength(0);
  });

  it("jiný typ lobby než nastavený je chyba", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni(null), sHrou({ lobbyTyp: 1 }));
    expect(k.find((x) => x.klic === "lobbyTyp")).toMatchObject({
      stav: "spatne",
      text: "Lobby Type: Ranked 1v1 Death Match, má být Unranked",
    });
  });

  // Zpoždění diváků hře nevadí, jen kazí vysílání — proto žlutá, ne červená.
  it("zpoždění diváků je jen upozornění", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni(null), sHrou({ zpozdeniDivakuSekund: 180 }));
    expect(k.find((x) => x.klic === "zpozdeniDivaku")).toMatchObject({
      stav: "varovani",
      text: "Spectator Delay: 3 Minutes, má být None",
    });
  });

  it("sekundy ze hry se počítají na minuty z nabídky", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ zpozdeniDivaku: 3 }), sHrou({ zpozdeniDivakuSekund: 180 }));
    expect(k.find((x) => x.klic === "zpozdeniDivaku")).toMatchObject({ stav: "ok" });
  });

  it("server „Default“ se ověřit nedá, hra hlásí skutečný region", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ server: "Default" }), sHrou({ server: "ukwest" }));
    expect(k.find((x) => x.klic === "server")).toMatchObject({ stav: "jedno", text: "Server: ukwest (Default se ověřit nedá)" });
  });

  it("konkrétní server porovná", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ server: "westeurope" }), sHrou({ server: "ukwest" }));
    expect(k.find((x) => x.klic === "server")).toMatchObject({ stav: "spatne", text: "Server: ukwest, má být westeurope" });
  });

  it("skryté civilizace bere z nastavení hry", () => {
    const k = zkontrolujLobby(sestava, doplnNastaveni({ skrytCivilizace: false }), lobby({ preLobby: preLobby(), nastaveni: { ...podleOcekavani, skrytCivilizace: true } }));
    expect(k.find((x) => x.klic === "skrytCivilizace")).toMatchObject({ stav: "spatne", text: "Hide Civilizations: zapnuto, má být vypnuto" });
  });
});

// V 1v1 je barva kosmetika: týmy nejsou, na mapě se dva hráči nespletou.
// Rob kvůli ní nemá mít červený řádek, který by zápas držel — stačí žlutá.
describe("barvy v 1v1", () => {
  it("špatná barva je jen upozornění", () => {
    const k = zkontrolujLobby(sestava, ocekavane, lobby({
      sloty: [
        { steamId: HOST, barva: 5, tym: 1, civ: null, pripraven: true },
        { steamId: JA, barva: 2, tym: 0, civ: null, pripraven: true },
      ],
    }));
    expect(k.find((x) => x.klic === `barva:${HOST}`)).toMatchObject({ stav: "varovani" });
    expect(lobbyVPoradku(k)).toBe(true);
  });

  // Ve víc než dvou už barvu potřebujeme: podle ní se poznává, kdo je kdo.
  it("ve větším zápase zůstává barva chybou", () => {
    const ctyri = [u(HOST, 1, 1, "Trokner"), u(JA, 1, 2, "Jouki"), u("A", 2, 3, "A"), u("B", 2, 4, "B")];
    const k = zkontrolujLobby(ctyri, ocekavane, lobby({
      sloty: [
        { steamId: HOST, barva: 5, tym: 1, civ: null, pripraven: true },
        { steamId: JA, barva: 2, tym: 1, civ: null, pripraven: true },
        { steamId: "A", barva: 3, tym: 2, civ: null, pripraven: true },
        { steamId: "B", barva: 4, tym: 2, civ: null, pripraven: true },
      ],
    }));
    expect(k.find((x) => x.klic === `barva:${HOST}`)).toMatchObject({ stav: "spatne" });
  });
});
