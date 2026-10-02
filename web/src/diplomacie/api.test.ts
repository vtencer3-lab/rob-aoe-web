import { afterEach, expect, it, vi } from "vitest";
import { diploApi } from "./api.js";

const odpoved = (telo: unknown, ok = true, status = 200) => ({ ok, status, json: () => Promise.resolve(telo) }) as unknown as Response;

function stubFetch(telo: unknown, ok = true, status = 200) {
  const f = vi.fn().mockResolvedValue(odpoved(telo, ok, status));
  vi.stubGlobal("fetch", f);
  return f;
}

afterEach(() => vi.unstubAllGlobals());

it("změna role jde PUT na routu zápasu a hráče s tělem změny", async () => {
  const f = stubFetch({ ok: true });
  await expect(diploApi.role(5, "76561198014056480", { role: "kat", cilHracId: "b" })).resolves.toEqual({ ok: true });
  expect(f).toHaveBeenCalledWith(
    "/api/diplo/zapas/5/role/76561198014056480",
    expect.objectContaining({ method: "PUT", body: JSON.stringify({ role: "kat", cilHracId: "b" }) }),
  );
});

it("los a rozeslání jdou bez těla, zpět a nástupce s tělem", async () => {
  const f = stubFetch({ ok: true });
  await diploApi.los(5);
  await diploApi.rozeslat(5);
  await diploApi.zpet(5, true);
  await diploApi.nastupce(5, "a");
  expect(f.mock.calls.map((c) => [c[0], (c[1] as RequestInit).body])).toEqual([
    ["/api/diplo/zapas/5/los", undefined],
    ["/api/diplo/zapas/5/rozeslat", undefined],
    ["/api/diplo/zapas/5/zpet", JSON.stringify({ potvrzeno: true })],
    ["/api/diplo/zapas/5/nastupce", JSON.stringify({ hracId: "a" })],
  ]);
  expect(f.mock.calls.every((c) => (c[1] as RequestInit).method === "POST")).toBe(true);
});

// Multipart bez nové závislosti: soubor jde syrově v těle, jméno a poznámka
// v hlavičkách (URL-kódované kvůli diakritice).
// Poznámku („Co je nového“) formulář nemá — hlavička x-poznamka nejde.
it("nahrání posílá soubor jako octet-stream a jméno v hlavičce, poznámku ne", async () => {
  const f = stubFetch({ id: 3, aktivni: true, chybaRozboru: null });
  const soubor = new File([new Uint8Array([1, 2, 3])], "Diplomacie v3.aoe2scenario");
  await expect(diploApi.nahrat(soubor)).resolves.toEqual({ id: 3, aktivni: true, chybaRozboru: null });
  const [url, init] = f.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("/api/diplo/scenar");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(soubor);
  expect(init.headers).toEqual({
    "content-type": "application/octet-stream",
    "x-jmeno-souboru": encodeURIComponent("Diplomacie v3.aoe2scenario"),
  });
});

it("chybu serveru přeloží na výjimku s jeho hláškou", async () => {
  stubFetch({ chyba: "Role už jsou rozeslané." }, false, 409);
  await expect(diploApi.los(5)).rejects.toThrow("Role už jsou rozeslané.");
});

it("adresy souboru a minimapy vedou na routy scénáře", () => {
  expect(diploApi.souborUrl("aktivni")).toBe("/api/diplo/scenar/aktivni/soubor");
  expect(diploApi.souborUrl(3)).toBe("/api/diplo/scenar/3/soubor");
  // Originál bez sondy (jen autor a admin) je táž adresa s ?original=1.
  expect(diploApi.souborUrl(3, true)).toBe("/api/diplo/scenar/3/soubor?original=1");
  expect(diploApi.minimapaUrl(3)).toBe("/api/diplo/scenar/3/minimapa.webp");
  expect(diploApi.minimapaUrl(3, "0123456789abcdef")).toBe("/api/diplo/scenar/3/minimapa.webp?v=0123456789abcdef");
});

it("přibalení sondy je POST bez těla na routu verze a vrací výsledek i s případnou chybou", async () => {
  const sonda = { cilu: 0, oznaceno: 0, chyba: "ValueError: x", zastarala: false, varovani: [] };
  const f = stubFetch({ ok: true, sonda });
  await expect(diploApi.pribalSondu(3)).resolves.toEqual({ ok: true, sonda });
  expect(f).toHaveBeenCalledWith("/api/diplo/scenar/3/sonda", { method: "POST" });
});
