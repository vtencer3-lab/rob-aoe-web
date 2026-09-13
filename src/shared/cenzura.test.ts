import { describe, expect, it } from "vitest";
import { cenzuruj, jeZakazane } from "./cenzura.js";

describe("cenzura chatu", () => {
  it("zakázané slovo schová hvězdičkami bez ohledu na velikost a diakritiku", () => {
    expect(jeZakazane("buzerant")).toBe(true);
    expect(jeZakazane("BUZERANT")).toBe(true);
    expect(cenzuruj("ty buzerante jeden")).toBe("ty ********* jeden");
    expect(cenzuruj("Buzerant!")).toBe("********!");
  });

  it("neškodný text vrátí beze změny, i jako tentýž řetězec", () => {
    const text = "jdu do lobby, heslo je 1234";
    expect(cenzuruj(text)).toBe(text);
  });

  it("víceslovnou frázi schová celou, slovo uvnitř jiného slova nechá", () => {
    expect(cenzuruj("no sieg   heil dneska")).toBe("no ****   **** dneska");
    expect(cenzuruj("Heil Hitler")).toBe("**** ******");
    expect(cenzuruj("siegfried")).toBe("siegfried");
  });
});

it("negroid je zakázaný ve všech pádech", () => {
  for (const s of ["negroid", "Negroida", "negroidům", "negroidech", "negroidy"]) expect(jeZakazane(s)).toBe(true);
});

it("odvozeniny od negroid schová celé", () => {
  expect(cenzuruj("negroidovy vtipy")).toBe("********** vtipy");
  expect(jeZakazane("Negroidní")).toBe(true);
});
