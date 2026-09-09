import { describe, expect, it } from "vitest";
import { prectiNastaveniLobby } from "./kontrolaLobby.js";

// Co panel nabídne, musí server přijmout. Do 9. 9. 2026 tu Victory znalo jen
// Conquest a Standard, takže Time Limit, Score a Last Man Standing tiše
// propadly — panel je poslal, server je zahodil a přes SSE se vrátila stará
// hodnota, takže se výběr sám přepnul zpátky.
describe("prectiNastaveniLobby", () => {
  it("přijme všechny druhy vítězství, které hra zná", () => {
    for (const v of [1, 7, 8, 9, 11]) {
      expect(prectiNastaveniLobby({ vitezstvi: v })).toEqual({ vitezstvi: v });
    }
  });

  it("vymyšlené vítězství nepustí", () => {
    expect(prectiNastaveniLobby({ vitezstvi: 5, populace: 200 })).toEqual({ populace: 200 });
  });

  it("populaci a příměří bere jen z herní nabídky", () => {
    expect(prectiNastaveniLobby({ populace: 225 })).toEqual({ populace: 225 });
    expect(prectiNastaveniLobby({ populace: 210, primeri: 90 })).toEqual({ primeri: 90 });
    expect(prectiNastaveniLobby({ populace: 200, primeri: 7 })).toEqual({ populace: 200 });
  });

  it("Extreme (−1) u AI obtížnosti projde", () => {
    expect(prectiNastaveniLobby({ aiObtiznost: -1 })).toEqual({ aiObtiznost: -1 });
  });
});
