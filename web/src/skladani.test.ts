import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { PlayerView, SestavaVstup } from "../../src/shared/types.js";
import { useSkladani, vychoziVstup } from "./skladani.js";

const hrac = (hracId: string): PlayerView => ({
  hracId,
  alias: hracId.toUpperCase(),
  platformaJmeno: null,
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
const ids = (s: ReturnType<typeof useSkladani>) => s.vybrani.map((v) => v.vstup.hracId);

// Sdílená sestava: pravda je na serveru. Vlastní kliknutí se ukáže hned,
// odejde po krátkém odkladu jako jeden požadavek a jakmile ji server vrátí
// přes SSE, lokální kopie končí. Cizí změna se převezme, když tu nic nečeká.
it("sdílenou sestavu ukazuje ze serveru, vlastní změny posílá sloučené", async () => {
  const odesli = vi.fn().mockResolvedValue({});
  let hodnota: SestavaVstup[] = [{ hracId: "a", tym: 1, barva: 1, civ: null }];
  const { result, rerender } = renderHook(() => useSkladani(prihlaseni, { hodnota, odesli }));
  expect(ids(result.current)).toEqual(["a"]);

  act(() => result.current.vyber("b"));
  act(() => result.current.vyber("c"));
  expect(ids(result.current)).toEqual(["a", "b", "c"]);
  expect(odesli).not.toHaveBeenCalled();
  await waitFor(() => expect(odesli).toHaveBeenCalledTimes(1));
  expect(odesli.mock.calls[0]![0].map((v: SestavaVstup) => v.hracId)).toEqual(["a", "b", "c"]);

  // Server to vrátí — lokální kopie se pustí, ukazuje se serverová (stejná).
  hodnota = odesli.mock.calls[0]![0] as SestavaVstup[];
  rerender();
  expect(ids(result.current)).toEqual(["a", "b", "c"]);

  // Druhý admin někoho vyhodil: přijde ze serveru a převezme se.
  hodnota = [{ hracId: "a", tym: 1, barva: 1, civ: null }];
  rerender();
  expect(ids(result.current)).toEqual(["a"]);
});

it("bez sdílení drží sestavu jen v prohlížeči (jako dřív)", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  act(() => result.current.vyber("b"));
  expect(ids(result.current)).toEqual(["b"]);
  expect(result.current.nevybrani.map((h) => h.hracId)).toEqual(["a", "c"]);
});

// Zpět nesmí vrátit hráče, který se mezitím odhlásil: nastavCelou ho vynechá
// i v tom, co odchází na server.
it("nastavCelou vynechá hráče, kteří už nejsou přihlášení", async () => {
  const odesli = vi.fn().mockResolvedValue({});
  const { result } = renderHook(() => useSkladani([hrac("a")], { hodnota: [], odesli }));
  act(() => result.current.nastavCelou([{ hracId: "a", tym: 1, barva: 1, civ: null }, { hracId: "zmizely", tym: 2, barva: 2, civ: null }]));
  expect(ids(result.current)).toEqual(["a"]);
  await waitFor(() => expect(odesli).toHaveBeenCalledTimes(1));
  expect(odesli.mock.calls[0]![0]).toEqual([{ hracId: "a", tym: 1, barva: 1, civ: null }]);
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
  expect(result.current.nevybrani.map((h) => h.hracId)).toEqual(["a", "b", "c"]);
});

// Bez módu se chová jako dřív (1v1/2v2 střídá týmy); v Diplomacii hraje
// každý sám za sebe, takže nový hráč dostane „–“ — jinak by „Vytvořit zápas“
// nesvítilo, dokud admin nepřepne tým všem osmi.
it("vychoziVstup: bez módu střídá týmy 1 a 2, v Diplomacii dává 0", () => {
  const prvni = vychoziVstup("a", []);
  expect(prvni.tym).toBe(1);
  expect(vychoziVstup("b", [prvni]).tym).toBe(2);
  expect(vychoziVstup("a", [], "diplomacie").tym).toBe(0);
  expect(vychoziVstup("b", [prvni], "diplomacie").tym).toBe(0);
});

it("v Diplomacii dostane vybraný hráč i AI tým „–“", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni, undefined, "diplomacie"));
  act(() => result.current.vyber("a"));
  act(() => result.current.pridejAi());
  expect(result.current.vybrani.map((v) => v.vstup.tym)).toEqual([0, 0]);
});

// Osm slotů je strop lobby; devátý klik už nesmí nic přidat.
it("víc než osm účastníků nepustí", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  for (let i = 0; i < 9; i++) act(() => result.current.pridejAi());
  expect(ids(result.current)).toHaveLength(7);
  act(() => result.current.vyber("a"));
  expect(ids(result.current)).toHaveLength(8);
});

// „Zamíchat barvy“ jde přes pravidla módu (shared/rezimy.ts): v Diplomacii
// zůstává GM na šedé a ostatní dostanou různé barvy mimo šedou. Je to
// uživatelská změna — odchází na server a hlásí se do historie kroků.
it("zamíchání barev v Diplomacii nechá GM na šedé, odešle se a ohlásí", async () => {
  const odesli = vi.fn().mockResolvedValue({});
  const naZmenu = vi.fn();
  const hodnota: SestavaVstup[] = [
    { hracId: "a", tym: 0, barva: 7, civ: null },
    { hracId: "b", tym: 0, barva: 1, civ: null },
    { hracId: "c", tym: 0, barva: 2, civ: null },
  ];
  const { result } = renderHook(() => useSkladani(prihlaseni, { hodnota, odesli, naZmenu }, "diplomacie"));
  act(() => result.current.zamichejBarvy());
  const po = result.current.vybrani.map((v) => v.vstup);
  expect(po.map((v) => v.hracId)).toEqual(["a", "b", "c"]);
  expect(po[0]!.barva).toBe(7);
  expect(po.slice(1).map((v) => v.barva)).not.toContain(7);
  expect(new Set(po.map((v) => v.barva)).size).toBe(3);
  expect(po.slice(1).map((v) => v.barva)).not.toEqual([1, 2]);
  expect(po.every((v) => v.tym === 0 && v.civ === null)).toBe(true);
  expect(naZmenu).toHaveBeenCalledWith(hodnota, po);
  await waitFor(() => expect(odesli).toHaveBeenCalledWith(po));
});

it("zamíchání barev s jedním vybraným nic neudělá", () => {
  const { result } = renderHook(() => useSkladani(prihlaseni));
  act(() => result.current.vyber("a"));
  const pred = result.current.vybrani.map((v) => v.vstup);
  act(() => result.current.zamichejBarvy());
  expect(result.current.vybrani.map((v) => v.vstup)).toEqual(pred);
});
