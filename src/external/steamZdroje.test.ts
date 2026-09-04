import { describe, expect, it, vi } from "vitest";
import { steamZdroje } from "./steam.js";

describe("steamZdroje bez klíče", () => {
  it("se Steamu vůbec nezeptá", async () => {
    const fetchImpl = vi.fn();
    const zdroje = steamZdroje("", fetchImpl as unknown as typeof fetch);

    await zdroje.nactiProfil("76561198000000000");
    await zdroje.nactiHodiny("76561198000000000");

    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("vrátí undefined u hodin, takže se uložená hodnota nepřepíše", async () => {
    // null by znamenalo "profil je skrytý" a do databáze by se zapsalo.
    // Chybějící klíč znamená "nevíme", což je něco jiného.
    const zdroje = steamZdroje("");
    await expect(zdroje.nactiHodiny("76561198000000000")).resolves.toBeUndefined();
  });

  it("vrátí null u profilu, což se díky COALESCE v uložení nepřepíše", async () => {
    const zdroje = steamZdroje("");
    await expect(zdroje.nactiProfil("76561198000000000")).resolves.toBeNull();
  });

  it("nevyhodí výjimku, takže se do staty_chyba nic nezapíše", async () => {
    // S prázdným klíčem by dotaz na Steam skončil 403, fetchSteamProfile by
    // vyhodil a refreshPlayerStats by to zapsal jako chybu ke každému hráči.
    const zdroje = steamZdroje("");
    await expect(zdroje.nactiProfil("x")).resolves.not.toThrow;
    await expect(zdroje.nactiHodiny("x")).resolves.not.toThrow;
  });
});

describe("steamZdroje s klíčem", () => {
  function odpoved(telo: unknown): Response {
    return { ok: true, json: async () => telo } as unknown as Response;
  }

  it("pošle klíč do obou dotazů", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const text = String(url);
      return text.includes("GetPlayerSummaries")
        ? odpoved({ response: { players: [{ steamid: "42", personaname: "A", avatarfull: "u" }] } })
        : odpoved({ response: { games: [{ appid: 813780, playtime_forever: 120 }] } });
    });
    const zdroje = steamZdroje("TAJNY_KLIC", fetchImpl as unknown as typeof fetch);

    await expect(zdroje.nactiProfil("42")).resolves.toEqual({
      personaName: "A",
      avatarUrl: "u",
    });
    await expect(zdroje.nactiHodiny("42")).resolves.toBe(2);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [url] of fetchImpl.mock.calls) {
      expect(String(url)).toContain("key=TAJNY_KLIC");
    }
  });
});
