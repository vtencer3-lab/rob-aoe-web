import type { FastifyInstance } from "fastify";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closePool, getPool } from "../db/pool.js";
import { getPlayer } from "../db/players.js";
import { buildServer, vychoziPoPrihlaseni } from "../http/server.js";

const IDENTITA = {
  xuid: "2535412345678901",
  gamertag: "Jouki in Rage",
  uhs: "123",
  token: "xsts",
};

// Routy se registrují jen s config.maMicrosoft (viz server.ts) — bez těchhle
// dvou proměnných by 404ovaly bez ohledu na to, co je implementované. Stubuje
// se na úrovni testu, ne modulu, aby test „bez registrace" níže mohl mít obě
// proměnné vypnuté; afterEach je po každém testu odstubuje, ať se nepřenesou
// do dalšího (stejný vzor jako devRoutes.db.test.ts a jeho zapniDvere()).
function zapniMicrosoft(): void {
  vi.stubEnv("MS_CLIENT_ID", "test-client-id");
  vi.stubEnv("MS_CLIENT_SECRET", "test-client-secret");
}

function server(deps: {
  vymenKod?: (kod: string, verifier: string) => Promise<string>;
  ziskejIdentitu?: (accessToken: string) => Promise<typeof IDENTITA>;
} = {}) {
  zapniMicrosoft();
  return buildServer({
    vymenKod: deps.vymenKod ?? (async () => "ms-token"),
    ziskejIdentitu: deps.ziskejIdentitu ?? (async () => IDENTITA),
    poPrihlaseni: async () => {},
  });
}

/** Projde celou přihlašovací cestou a vrátí odpověď z návratové routy. */
async function prihlas(app: FastifyInstance) {
  const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
  const cookie = decodeURIComponent(
    String(start.headers["set-cookie"]).match(/ms_stav=([^;]+)/)![1]!,
  );
  const stav = cookie.split("|")[0]!;
  return app.inject({
    method: "GET",
    url: `/api/auth/microsoft/return?code=k&state=${stav}`,
    cookies: { ms_stav: cookie },
  });
}

beforeEach(async () => {
  await getPool().query("TRUNCATE player CASCADE");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await closePool();
});

it("bez MS_CLIENT_ID a MS_CLIENT_SECRET se Microsoft routy vůbec nezaregistrují", async () => {
  // Přesný precedens: devRoutes.db.test.ts "bez DEV_PRISTUP se zkušební
  // dveře vůbec nezaregistrují". Kdyby v server.ts zmizel `if
  // (config.maMicrosoft) registerMicrosoftRoutes(...)`, tenhle test to
  // odhalí — bez něj by 404 hlídalo jen čtení kódu, ne běžící sada.
  vi.stubEnv("MS_CLIENT_ID", undefined);
  vi.stubEnv("MS_CLIENT_SECRET", undefined);
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: async () => {},
  });

  const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
  expect(start.statusCode).toBe(404);

  const navrat = await app.inject({
    method: "GET",
    url: "/api/auth/microsoft/return?code=k&state=cokoliv",
  });
  expect(navrat.statusCode).toBe(404);
  await app.close();
});

describe("GET /api/auth/microsoft", () => {
  it("přesměruje na Microsoft a uloží state do cookie", async () => {
    const app = server();
    const res = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
    expect(res.statusCode).toBe(302);
    expect(res.headers["location"]).toContain("login.microsoftonline.com");
    expect(String(res.headers["set-cookie"])).toContain("ms_stav");
    await app.close();
  });
});

describe("GET /api/auth/microsoft/return", () => {
  it("bez shody state nepřihlásí, nikam se neptá a smaže cookie", async () => {
    // Bez téhle kontroly stačí útočníkovi podstrčit vlastní kód a přihlásí
    // oběť do svého účtu.
    const vymenKod = vi.fn(async () => "ms-token");
    const app = server({ vymenKod });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/microsoft/return?code=k&state=cizi",
      cookies: { ms_stav: "nase|overovatel" },
    });
    expect(res.statusCode).toBe(401);
    expect(vymenKod).not.toHaveBeenCalled();
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });

  it("úplně bez cookie odmítne a nikam se neptá", async () => {
    const vymenKod = vi.fn(async () => "ms-token");
    const app = server({ vymenKod });
    const res = await app.inject({
      method: "GET",
      url: "/api/auth/microsoft/return?code=k&state=cokoliv",
    });
    expect(res.statusCode).toBe(401);
    expect(vymenKod).not.toHaveBeenCalled();
    await app.close();
  });

  it("bez kódu v návratu odmítne, nikam se neptá a smaže cookie", async () => {
    const vymenKod = vi.fn(async () => "ms-token");
    const app = server({ vymenKod });
    const start = await app.inject({ method: "GET", url: "/api/auth/microsoft" });
    const stav = String(start.headers["set-cookie"]).match(/ms_stav=([^;]+)/)![1]!;
    const res = await app.inject({
      method: "GET",
      url: `/api/auth/microsoft/return?state=${decodeURIComponent(stav).split("|")[0]}`,
      cookies: { ms_stav: decodeURIComponent(stav) },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().chyba).toContain("kód");
    expect(vymenKod).not.toHaveBeenCalled();
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });

  it("založí hráče s klíčem xbox:<xuid> a vrátí sezení", async () => {
    const app = server();
    const res = await prihlas(app);
    expect(res.statusCode).toBe(302);
    const hrac = await getPlayer("xbox:2535412345678901");
    expect(hrac).toMatchObject({
      platforma: "xbox",
      xboxXuid: "2535412345678901",
      xboxGamertag: "Jouki in Rage",
      platformaJmeno: "Jouki in Rage",
      steamId: null,
    });
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });

  it("chyba z Xboxu se ukáže česky, ne jako kód, a cookie se smaže", async () => {
    const app = server({
      ziskejIdentitu: async () => {
        throw new Error("Tenhle Microsoft účet nemá Xbox profil.");
      },
    });
    const res = await prihlas(app);
    expect(res.statusCode).toBe(401);
    expect(res.json().chyba).toContain("Xbox profil");
    expect(res.cookies.find((c) => c.name === "ms_stav")?.value).toBe("");
    await app.close();
  });
});

const ZEBRICEK_XBOX = {
  alias: "Jouki in Rage",
  country: "cz",
  elo1v1: 1200,
  eloNejvyssi: 1250,
  odehranoHer: 40,
  posledniZapas: new Date(0),
  zebricky: [],
  profil: "/xboxlive/D3B6B94FC53483297CEEA5A85933D3129D8A5B36",
  profilId: 6458213,
};

it("po přihlášení doplní avatar, vlastnictví hry a herní profil", async () => {
  zapniMicrosoft();
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: async () => "https://images-eds.xboxlive.com/x",
      vlastnictvi: async () => "ma" as const,
      zebricek: async () => ZEBRICEK_XBOX,
    }),
  });
  await prihlas(app);
  // poPrihlaseni visí mimo přihlašovací cestu, takže se musí počkat na jeho
  // doběhnutí — jinak by test měřil stav, který ještě nenastal.
  await vi.waitFor(async () => {
    expect((await getPlayer("xbox:2535412345678901"))?.weProfilId).toBe(6458213);
  });
  expect(await getPlayer("xbox:2535412345678901")).toMatchObject({
    avatarUrl: "https://images-eds.xboxlive.com/x",
    hraVlastnictvi: "ma",
    weProfil: "/xboxlive/D3B6B94FC53483297CEEA5A85933D3129D8A5B36",
    elo1v1: 1200,
  });
  await app.close();
});

it("selhání kteréhokoliv doplňku nechá hráče přihlášeného", async () => {
  zapniMicrosoft();
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: async () => {
        throw new Error("Xbox profil odpověděl 500");
      },
      vlastnictvi: async () => {
        throw new Error("titlehub 500");
      },
      zebricek: async () => {
        throw new Error("Worlds Edge 500");
      },
    }),
  });
  const res = await prihlas(app);
  expect(res.statusCode).toBe(302);
  await vi.waitFor(async () => {
    expect((await getPlayer("xbox:2535412345678901"))?.statyChyba).toContain("Worlds Edge");
  });
  await app.close();
});

it("hráč, kterému se herní profil nenajde, zůstane plnohodnotný, jen bez ELO", async () => {
  // Worlds Edge tu neselhal (nevyhodil), jen nikoho pod tímhle gamertagem
  // nenašel — běžný stav u každého, kdo se přihlásí dřív, než vůbec spustí
  // hru. To není chyba, takže se nesmí objevit ve `staty_chyba`.
  zapniMicrosoft();
  const app = buildServer({
    vymenKod: async () => "ms-token",
    ziskejIdentitu: async () => IDENTITA,
    poPrihlaseni: vychoziPoPrihlaseni({
      gamerpic: async () => "https://images-eds.xboxlive.com/x",
      vlastnictvi: async () => "ma" as const,
      zebricek: async () => null,
    }),
  });
  const res = await prihlas(app);
  expect(res.statusCode).toBe(302);
  // hraVlastnictvi nezávisí na žebříčku, takže jde použít jako nezávislý
  // signál, že poPrihlaseni doběhlo (avatarUrl by fungoval taky, ale tenhle
  // se neváže na tu část odpovědi, kterou test primárně zkoumá).
  await vi.waitFor(async () => {
    expect((await getPlayer("xbox:2535412345678901"))?.hraVlastnictvi).toBe("ma");
  });
  expect(await getPlayer("xbox:2535412345678901")).toMatchObject({
    platformaJmeno: "Jouki in Rage",
    elo1v1: null,
    statyChyba: null,
  });
  await app.close();
});
