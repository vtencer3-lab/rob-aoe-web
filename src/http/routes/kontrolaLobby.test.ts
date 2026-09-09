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

// Pre-lobby: nastavení z okna zakládání lobby. Stejná pravidla jako u zbytku
// — null znamená „je to jedno“, nesmysl neprojde.
describe("pre-lobby v nastavení", () => {
  it("vezme zpoždění, strop hráčů, heslo diváků i region", () => {
    expect(
      prectiNastaveniLobby({ zpozdeniDivaku: 180, maxHracu: 8, hesloDivaku: true, region: "westeurope" }),
    ).toEqual({ zpozdeniDivaku: 180, maxHracu: 8, hesloDivaku: true, region: "westeurope" });
  });

  it("„je to jedno“ projde u všech čtyř", () => {
    expect(prectiNastaveniLobby({ zpozdeniDivaku: null, maxHracu: null, hesloDivaku: null, region: null })).toEqual({
      zpozdeniDivaku: null,
      maxHracu: null,
      hesloDivaku: null,
      region: null,
    });
  });

  it("nesmyslné hodnoty nepustí", () => {
    expect(prectiNastaveniLobby({ maxHracu: 99, populace: 200 })).toEqual({ populace: 200 });
    expect(prectiNastaveniLobby({ zpozdeniDivaku: -5, populace: 200 })).toEqual({ populace: 200 });
    expect(prectiNastaveniLobby({ region: "x".repeat(200), populace: 200 })).toEqual({ populace: 200 });
  });
});
