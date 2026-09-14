import { afterEach, expect, it, vi } from "vitest";
import { naZablokovaniZvuku, prehraj } from "./zvuk.js";

afterEach(() => {
  vi.restoreAllMocks();
});

// Prohlížeč bez gesta zvuk nepustí (NotAllowedError): 13. 9. 2026 spícímu
// hráči vyskočilo okno svolání, ale poplach se neozval. Zvuk se odloží a
// přehraje při prvním kliknutí; kdo poslouchá, dozví se obojí.
it("zadržený zvuk se přehraje při prvním kliknutí a posluchač se dozví o zadržení", async () => {
  const chyba = Object.assign(new Error("play() failed"), { name: "NotAllowedError" });
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(chyba).mockResolvedValue(undefined);
  const stavy: boolean[] = [];
  const odhlasit = naZablokovaniZvuku((z) => stavy.push(z));
  prehraj("poplach.mp3", 50);
  await Promise.resolve();
  await Promise.resolve();
  expect(stavy).toEqual([true]);
  window.dispatchEvent(new Event("pointerdown"));
  expect(play).toHaveBeenCalledTimes(2);
  expect(stavy).toEqual([true, false]);
  odhlasit();
});

it("jiná chyba přehrávání se jen spolkne", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValueOnce(new Error("AbortError"));
  const stavy: boolean[] = [];
  const odhlasit = naZablokovaniZvuku((z) => stavy.push(z));
  prehraj("zvon.mp3");
  await Promise.resolve();
  await Promise.resolve();
  expect(stavy).toEqual([]);
  odhlasit();
});
