import { describe, expect, it, vi } from "vitest";
import inzeraty from "./fixtures/worldsedge-advertisements.json" with { type: "json" };
import robova from "./fixtures/worldsedge-lobby-robdiesalot.json" with { type: "json" };
import { deflateSync } from "node:zlib";
import { fetchAdvertisements, parseAdvertisements, parseSloty, prelozHrace } from "./worldsEdgeLobby.js";

describe("parseAdvertisements", () => {
  it("převede inzerát na číslo lobby a profily hosta a členů", () => {
    const [prvni] = parseAdvertisements(inzeraty);
    expect(prvni).toMatchObject({
      lobbyId: "504953429",
      hostProfilId: 101,
      nazev: "Jouki in Rage's Game",
      maHeslo: false,
      povolujeDivaky: true,
      clenoveProfily: [101],
    });
  });

  it("po překladu na hráče webu vyjde host a členové podle Steam ID", () => {
    const mapa = new Map([[101, "76561198014056480"]]);
    const [prvni] = prelozHrace(parseAdvertisements(inzeraty), mapa);
    expect(prvni).toMatchObject({
      hostHracId: "76561198014056480",
      clenoveHraci: ["76561198014056480"],
    });
  });

  it("členy bez záznamu na webu a nesmyslné prvky přeskočí", () => {
    const surove = parseAdvertisements(inzeraty);
    const rob03 = surove.find((l) => l.nazev === "ROB-03");
    expect(rob03).toMatchObject({
      lobbyId: "504951828",
      hostProfilId: 202,
      maHeslo: true,
      povolujeDivaky: false,
      // 999 nemá na webu protějšek, ale parser (hermetický) ho stejně vrátí —
      // odfiltruje ho až prelozHrace.
      clenoveProfily: [202, 203, 999],
    });
    const mapa = new Map([
      [202, "76561198000000072"],
      [203, "76561198000000073"],
    ]);
    const [prelozeny] = prelozHrace([rob03!], mapa);
    expect(prelozeny).toMatchObject({
      hostHracId: "76561198000000072",
      clenoveHraci: ["76561198000000072", "76561198000000073"],
    });
  });

  it("host z Xboxu už se nezahazuje — parser vrací číslo profilu", () => {
    // Dřív dostal null: filtr bral jen /steam/. Microsoft hráč tím byl v lobby
    // neviditelný, i když se na web přihlásil.
    const xbox = parseAdvertisements(inzeraty).find((l) => l.nazev === "xbox host");
    expect(xbox).toMatchObject({ lobbyId: "504951802" });
    expect(xbox?.hostProfilId).toBeTypeOf("number");
    expect(xbox?.clenoveProfily.length).toBeGreaterThan(0);
  });

  it("překlad na hráče webu platí pro obě platformy stejně", () => {
    const surove = parseAdvertisements(inzeraty);
    const xbox = surove.find((l) => l.nazev === "xbox host")!;
    const mapa = new Map([[xbox.hostProfilId!, "xbox:2535412345678901"]]);
    const prelozene = prelozHrace(surove, mapa);
    expect(prelozene.find((l) => l.nazev === "xbox host")).toMatchObject({
      hostHracId: "xbox:2535412345678901",
      clenoveHraci: ["xbox:2535412345678901"],
    });
  });

  it("profil, který na webu není, zůstane nerozpoznaný, ne vymyšlený", () => {
    const prelozene = prelozHrace(parseAdvertisements(inzeraty), new Map());
    expect(prelozene.every((l) => l.hostHracId === null)).toBe(true);
    expect(prelozene.every((l) => l.clenoveHraci.length === 0)).toBe(true);
  });

  it("inzerát bez id a nesmysly vynechá, celkem zbydou tři", () => {
    expect(parseAdvertisements(inzeraty)).toHaveLength(3);
  });

  it("nesmyslná odpověď vrátí prázdný seznam", () => {
    expect(parseAdvertisements(null)).toEqual([]);
    expect(parseAdvertisements({})).toEqual([]);
    expect(parseAdvertisements({ matches: "ne", avatars: null })).toEqual([]);
  });

  it("neplatná slotinfo a options nevyhodí, jen zůstanou prázdné", () => {
    const [l] = parseAdvertisements(inzeraty);
    expect(l!.slotyProfily).toEqual([]);
    expect(l!.nastaveni).toBeNull();
  });
});

// Skutečný snímek lobby „RobDiesALot“ ze 7. 9. 2026: Trokner modrá + tým 1,
// Jouki červená + „–“, Black Forest, Medium, Normal, populace 150, Victory
// Standard, cheaty zapnuté, bez hesla, diváci ano. Hodnoty odpovídají tomu,
// co bylo ve hře nastavené v okamžiku snímku.
describe("parseAdvertisements — sloty a nastavení", () => {
  const [lobby] = parseAdvertisements(robova);
  const mapa = new Map([
    [20087158, "76561198014710095"],
    [15260548, "76561198014056480"],
  ]);
  const [prelozena] = prelozHrace([lobby!], mapa);

  it("rozbalí sloty: barvu z ScenarioPlayerIndex, tým z Team", () => {
    expect(prelozena!.sloty).toEqual([
      { hracId: "76561198014710095", barva: 1, tym: 1, civ: null, pripraven: true },
      { hracId: "76561198014056480", barva: 2, tym: 0, civ: null, pripraven: true },
    ]);
  });

  it("rozbalí nastavení hry podle zmapovaných klíčů", () => {
    expect(lobby!.nastaveni).toEqual({
      mapaId: 10878,
      velikost: 168,
      rychlost: 2,
      populace: 150,
      vitezstvi: 9,
      cheaty: true,
      sadaCivilizaci: 1,
      rezim: 0,
      aiObtiznost: 3,
      suroviny: 0,
      odkrytiMapy: 0,
      pocatecniVek: 0,
      konecnyVek: 0,
      primeri: 0,
      lockTeams: true,
      teamTogether: true,
      teamPositions: false,
      sharedExploration: true,
      lockSpeed: true,
      turbo: false,
      fullTechTree: false,
      // Hide Civilizations z options[85] (ve fixtuře 0 = vypnuto).
      skrytCivilizace: false,
      empireWars: false,
      suddenDeath: false,
      regicide: false,
      antiquity: false,
      recordGame: true,
    });
    expect(prelozena!).toMatchObject({ lobbyId: "504987862", maHeslo: false, povolujeDivaky: true, hostHracId: "76561198014710095" });
  });
});

describe("fetchAdvertisements", () => {
  it("volá findAdvertisements a odpověď rozparsuje", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(inzeraty), { status: 200 }));
    const seznam = await fetchAdvertisements(fetchImpl as unknown as typeof fetch);
    expect(seznam).toHaveLength(3);
    expect(String(fetchImpl.mock.calls[0]![0])).toContain("/advertisement/findAdvertisements?title=age2&start=0");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  // Endpoint dává nejvýš 100 lobby na stránku; když je jich sto, je za nimi
  // další stránka. Vaše lobby na ní klidně může být — 7. 9. 2026 se to stalo.
  it("při plné stránce stáhne i další a stejné id nezdvojí", async () => {
    const plna = { matches: Array.from({ length: 100 }, (_, i) => ({ id: 1000 + i, host_profile_id: 0, description: "x", matchmembers: [] })), avatars: [] };
    const zbytek = { matches: [{ id: 1099, host_profile_id: 0, description: "dup", matchmembers: [] }, { id: 2000, host_profile_id: 0, description: "posledni", matchmembers: [] }], avatars: [] };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(plna), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(zbytek), { status: 200 }));
    const seznam = await fetchAdvertisements(fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain("start=100");
    expect(seznam).toHaveLength(101);
  });

  it("neúspěšná odpověď vyhodí chybu se stavovým kódem", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchAdvertisements(fetchImpl as unknown as typeof fetch)).rejects.toThrow(/503/);
  });
});

// Vzorek z živé lobby (9. 9. 2026): host, dvě AI a pět prázdných slotů.
// AI má stejně jako prázdný slot profileInfo.id = -1, ale status 2 a
// vyplněná metadata; prázdný slot má status 1 a metadata prázdná.
const SLOTY_S_AI = [
  { "profileInfo.id": 15260548, isReady: 1, status: 0, metaData: "IkJBRUFBQUF4QWdBQUFERTRBUUFBQURBS0FBQUFOREk1TkRrMk56STVOUk1BQUFCVFkyVnVZWEpwYjFCc1lYbGxja2x1WkdWNENnQUFBRFF5T1RRNU5qY3lPVFVFQUFBQVZHVmhiUUVBQUFBMiI=" },
  { "profileInfo.id": -1, isReady: 0, status: 2, metaData: "IkJBRUFBQUF4QlFBQUFEWTFOVE0zQVFBQUFEQUtBQUFBTkRJNU5EazJOekk1TlJNQUFBQlRZMlZ1WVhKcGIxQnNZWGxsY2tsdVpHVjRDZ0FBQURReU9UUTVOamN5T1RVRUFBQUFWR1ZoYlFFQUFBQTIi" },
  { "profileInfo.id": -1, isReady: 0, status: 2, metaData: "IkJBRUFBQUF4QlFBQUFEWTFOVE0zQVFBQUFEQUtBQUFBTkRJNU5EazJOekk1TlJNQUFBQlRZMlZ1WVhKcGIxQnNZWGxsY2tsdVpHVjRDZ0FBQURReU9UUTVOamN5T1RVRUFBQUFWR1ZoYlFFQUFBQTIi" },
  { "profileInfo.id": -1, isReady: 0, status: 1, metaData: "IkFBPT0i" },
];

function zabalSloty(sloty: unknown[]): string {
  return deflateSync(Buffer.from(`8,${JSON.stringify(sloty)}`)).toString("base64");
}

describe("parseSloty s AI", () => {
  it("AI pozná podle stavu slotu a vrátí ji zvlášť od lidí", () => {
    const { lide, ai } = parseSloty(zabalSloty(SLOTY_S_AI));

    expect(lide.map((s) => s.profilId)).toEqual([15260548]);
    expect(ai).toHaveLength(2);
  });

  it("AI má čitelnou barvu a tým jako člověk", () => {
    const sAi = [
      { "profileInfo.id": -1, isReady: 0, status: 2, metaData: "IkJBRUFBQUF4QlFBQUFEWTFOVE0zQVFBQUFEQUtBQUFBTkRJNU5EazJOekk1TlJNQUFBQlRZMlZ1WVhKcGIxQnNZWGxsY2tsdVpHVjRDZ0FBQURReU9UUTVOamN5T1RVRUFBQUFWR1ZoYlFFQUFBQTIi" },
    ];
    const { ai } = parseSloty(zabalSloty(sAi));
    // Ve vzorku měla AI náhodnou barvu (ScenarioPlayerIndex −1) a tým „?“.
    expect(ai[0]).toMatchObject({ barva: null, tym: "?" });
  });

  it("prázdný slot není ani člověk, ani AI", () => {
    const prazdne = [{ "profileInfo.id": -1, isReady: 0, status: 1, metaData: "IkFBPT0i" }];
    const { lide, ai } = parseSloty(zabalSloty(prazdne));
    expect(lide).toHaveLength(0);
    expect(ai).toHaveLength(0);
  });
});

// Nastavení z okna zakládání lobby („pre-lobby“) hra neposílá v options, ale
// přímo v inzerátu: zpoždění diváků, strop hráčů, heslo pro diváky a region.
describe("pre-lobby z inzerátu", () => {
  it("přečte zpoždění diváků, strop hráčů, heslo diváků a region", () => {
    const [lobby] = parseAdvertisements({
      matches: [
        {
          id: 1,
          description: "ROB-01",
          passwordprotected: 1,
          isobservable: 1,
          observerdelay: 180,
          observermax: 512,
          maxplayers: 8,
          matchtype_id: 0,
          visible: 1,
          hasobserverpassword: 1,
          relayserver_region: "westeurope",
          matchmembers: [],
        },
      ],
      avatars: [],
    });
    // maxplayers je vždycky 8; bez slotinfo se počet slotů nedá zjistit.
    expect(lobby!.preLobby).toEqual({
      lobbyTyp: 0,
      viditelnost: 1,
      maxHracu: null,
      zpozdeniDivakuSekund: 180,
      server: "westeurope",
    });
  });

  it("co inzerát nenese, zůstane null", () => {
    const [lobby] = parseAdvertisements({ matches: [{ id: 1, matchmembers: [] }], avatars: [] });
    expect(lobby!.preLobby).toEqual({ lobbyTyp: null, viditelnost: null, maxHracu: null, zpozdeniDivakuSekund: null, server: null });
  });
});

// „Players“ z okna zakládání se v inzerátu nepozná: maxplayers je vždycky 8,
// tedy kapacita hry. Skutečný počet slotů říká až slotinfo — zavřené sloty
// mají status 1, otevřené 0 (i když v nich nikdo nesedí) a AI 2.
describe("počet slotů lobby", () => {
  const slot = (status: number, id = -1, meta = "IkFBPT0i") => ({ "profileInfo.id": id, isReady: 0, status, metaData: meta });

  it("spočítá otevřené sloty, zavřené vynechá", () => {
    const dva = [slot(0, 15260548, SLOTY_S_AI[0]!.metaData), slot(0), slot(1), slot(1), slot(1), slot(1), slot(1), slot(1)];
    const [lobby] = parseAdvertisements({
      matches: [{ id: 1, maxplayers: 8, matchmembers: [], slotinfo: zabalSloty(dva) }],
      avatars: [],
    });
    expect(lobby!.preLobby!.maxHracu).toBe(2);
  });

  it("AI se do počtu slotů počítá", () => {
    const ctyri = [slot(0, 15260548, SLOTY_S_AI[0]!.metaData), slot(2, -1, SLOTY_S_AI[1]!.metaData), slot(2, -1, SLOTY_S_AI[1]!.metaData), slot(0), slot(1), slot(1), slot(1), slot(1)];
    const [lobby] = parseAdvertisements({
      matches: [{ id: 1, maxplayers: 8, matchmembers: [], slotinfo: zabalSloty(ctyri) }],
      avatars: [],
    });
    expect(lobby!.preLobby!.maxHracu).toBe(4);
  });

  it("bez slotinfo zůstane počet neznámý", () => {
    const [lobby] = parseAdvertisements({ matches: [{ id: 1, maxplayers: 8, matchmembers: [] }], avatars: [] });
    expect(lobby!.preLobby!.maxHracu).toBeNull();
  });
});
