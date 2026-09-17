import { describe, expect, it } from "vitest";
import { KONTAKT_SMAZANI, pravniStrankaZCesty } from "./pravniCesty.js";

// Traefik na jouki.cz odřeže `/aoe`, `/aoe/dev` nebo `/aoe/experimental` dřív,
// než požadavek dorazí na server (viz src/config.ts: zakladniCesta) — ale
// prohlížeč v adresním řádku pořád drží celou cestu i s tímhle základem.
// Proto se základ testuje jako druhý parametr, ne přes import.meta.env.
describe("pravniStrankaZCesty", () => {
  it("pozná podmínky a soukromí bez základu (lokální vývoj)", () => {
    expect(pravniStrankaZCesty("/podminky", "")).toBe("podminky");
    expect(pravniStrankaZCesty("/soukromi", "")).toBe("soukromi");
  });

  it("hlavní aplikace nemá žádnou právní stránku", () => {
    expect(pravniStrankaZCesty("/", "")).toBeNull();
    expect(pravniStrankaZCesty("/neco-jineho", "")).toBeNull();
    expect(pravniStrankaZCesty("", "")).toBeNull();
  });

  // Lidi si adresu kopírují i s koncovým lomítkem — nejlevnější způsob, jak
  // stránku rozbít, je nechat tohle netestované.
  it("snáší koncové lomítko", () => {
    expect(pravniStrankaZCesty("/podminky/", "")).toBe("podminky");
    expect(pravniStrankaZCesty("/soukromi/", "")).toBe("soukromi");
  });

  it("funguje pod základem /aoe, /aoe/dev i /aoe/experimental", () => {
    expect(pravniStrankaZCesty("/aoe/podminky", "/aoe")).toBe("podminky");
    expect(pravniStrankaZCesty("/aoe/dev/podminky", "/aoe/dev")).toBe("podminky");
    expect(pravniStrankaZCesty("/aoe/dev/podminky/", "/aoe/dev")).toBe("podminky");
    expect(pravniStrankaZCesty("/aoe/experimental/soukromi", "/aoe/experimental")).toBe("soukromi");
  });

  it("cizí cesta pod základem nesedí na žádnou právní stránku", () => {
    expect(pravniStrankaZCesty("/aoe/dev/jina-cesta", "/aoe/dev")).toBeNull();
    expect(pravniStrankaZCesty("/aoe/dev", "/aoe/dev")).toBeNull();
    expect(pravniStrankaZCesty("/aoe/dev/", "/aoe/dev")).toBeNull();
  });
});

// Adresa se píše na dvou stránkách z jedné konstanty; tenhle test je jediné
// místo, kde je napsaná ručně. Překlep v ní znamená, že žádost o smazání
// nikam nedojde a nikdo se to nedozví.
it("kontakt na smazání účtu je adresa, kterou provozovatel čte", () => {
  expect(KONTAKT_SMAZANI).toBe("m.joukal+aoekomunitky@gmail.com");
});
