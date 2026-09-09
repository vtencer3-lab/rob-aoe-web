import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlayerView, SestavaVstup } from "../../src/shared/types.js";
import { useSkladani } from "./skladani.js";

const hrac = (steamId: string): PlayerView => ({
  steamId,
  alias: steamId.toUpperCase(),
  steamName: null,
  avatarUrl: null,
  country: null,
  elo1v1: null,
  eloNejvyssi: null,
  odehranoHer: null,
  steamHodiny: null,
  posledniZapas: null,
  statyStazenyV: null,
  statyChyba: null,
});
const prihlaseni = [hrac("a"), hrac("b"), hrac("c")];
const ids = (s: ReturnType<typeof useSkladani>) => s.vybrani.map((v) => v.vstup.steamId);

// Sdílená sestava: pravda je na serveru. Vlastní kliknutí se ukáže hned,
// odejde po krátkém odkladu jako jeden požadavek a jakmile ji server vrátí
// přes SSE, lokální kopie končí. Cizí změna se převezme, když tu nic nečeká.
it("sdílenou sestavu ukazuje ze serveru, vlastní změny posílá sloučené", async () => {
  const odesli = vi.fn().mockResolvedValue({});
  let hodnota: SestavaVstup[] = [{ steamId: "a", tym: 1, barva: 1, civ: null }];
  const { result, rerender } = renderHook(() => useSkladani(prihlaseni, { hodnota, odesli }));
  expect(ids(result.current)).toEqual(["a"]);

  act(() => result.current.vyber("b"));
  act(() => result.current.vyber("c"));
  expect(ids(result.current)).toEqual(["a", "b", "c"]);
  expect(odesli).not.toHaveBeenCalled();
  await waitFor(() => expect(odesli).toHaveBeenCalledTimes(1));
  expect(odesli.mock.calls[0]![0].map((v: SestavaVstup) => v.steamId)).toEqual(["a", "b", "c"]);

  // Server to vrátí — lokální kopie se pustí, ukazuje se serverová (stejná).
  hodnota = odesli.mock.calls[0]![0] as SestavaVstup[];
  rerender();
  expect(ids(result.current)).toEqual(["a", "b", "c"]);

  // Druhý admin někoho vyhodil: přijde ze serveru a převezme se.
  hodnota = [{ steamId: "a", tym: 1, barva: 1, civ: null }];
  rerender();
  expect(ids(result.current)).toEqual(["a"]);
});

it("bez sdílení drží sestavu jen v prohlížeči (jako dřív)", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  act(() => result.current.vyber("b"));
  expect(ids(result.current)).toEqual(["b"]);
  expect(result.current.nevybrani.map((h) => h.steamId)).toEqual(["a", "c"]);
});

// Zpět nesmí vrátit hráče, který se mezitím odhlásil: nastavCelou ho vynechá
// i v tom, co odchází na server.
it("nastavCelou vynechá hráče, kteří už nejsou přihlášení", async () => {
  const odesli = vi.fn().mockResolvedValue({});
  const { result } = renderHook(() => useSkladani([hrac("a")], { hodnota: [], odesli }));
  act(() => result.current.nastavCelou([{ steamId: "a", tym: 1, barva: 1, civ: null }, { steamId: "zmizely", tym: 2, barva: 2, civ: null }]));
  expect(ids(result.current)).toEqual(["a"]);
  await waitFor(() => expect(odesli).toHaveBeenCalledTimes(1));
  expect(odesli.mock.calls[0]![0]).toEqual([{ steamId: "a", tym: 1, barva: 1, civ: null }]);
});

// AI se do akce nehlásí, takže v seznamu přihlášených nikdy není. Filtr „kdo
// se odhlásil, ze sestavy vypadne“ ji přesto musí nechat být.
it("AI v sestavě zůstane, i když v přihlášených není", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));

  act(() => result.current.pridejAi());
  expect(ids(result.current)).toEqual(["ai:1"]);

  act(() => result.current.vyber("a"));
  expect(ids(result.current)).toEqual(["ai:1", "a"]);
});

it("další AI dostane volné id, dokud je v lobby místo", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  act(() => result.current.pridejAi());
  act(() => result.current.pridejAi());
  expect(ids(result.current)).toEqual(["ai:1", "ai:2"]);
  // Odebráním se id uvolní a příště se použije znovu.
  act(() => result.current.odeber("ai:1"));
  act(() => result.current.pridejAi());
  expect(ids(result.current)).toEqual(["ai:2", "ai:1"]);
});

it("odebraná AI nepadá mezi nevybrané — tam patří jen lidi", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  act(() => result.current.pridejAi());
  act(() => result.current.odeber("ai:1"));
  expect(result.current.nevybrani.map((h) => h.steamId)).toEqual(["a", "b", "c"]);
});

// Osm slotů je strop lobby; devátý klik už nesmí nic přidat.
it("víc než osm účastníků nepustí", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  for (let i = 0; i < 9; i++) act(() => result.current.pridejAi());
  expect(ids(result.current)).toHaveLength(7);
  act(() => result.current.vyber("a"));
  expect(ids(result.current)).toHaveLength(8);
});
