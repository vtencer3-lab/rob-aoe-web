import { describe, expect, it } from "vitest";
import { assertTransition, canTransition, PrechodChyba } from "./stateMachine.js";

describe("canTransition", () => {
  it("dovolí každý přechod mezi třemi stavy", () => {
    expect(canTransition("bezi", "dohrano")).toBe(true);
    expect(canTransition("bezi", "zruseny")).toBe(true);
    expect(canTransition("zruseny", "bezi")).toBe(true);
  });

  // Rob dostane jen tři tlačítka, ale překliknuté „Vyhrál tým 1“ musí jít
  // vrátit — jinak by mu jeden chybný klik ukončil zápas nadobro.
  it("dovolí vrátit dohraný zápas zpátky do běhu", () => {
    expect(canTransition("dohrano", "bezi")).toBe(true);
  });

  it("přechod na sebe sama odmítne", () => {
    expect(canTransition("bezi", "bezi")).toBe(false);
    expect(canTransition("dohrano", "dohrano")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("mlčí u povoleného přechodu", () => {
    expect(() => assertTransition("bezi", "dohrano")).not.toThrow();
  });

  // Typ rozhoduje o stavovém kódu: routy z něj dělají 409, ne 500.
  it("vyhazuje PrechodChybu, ne holou Error", () => {
    expect(() => assertTransition("bezi", "bezi")).toThrow(PrechodChyba);
  });

  // Nejčastější spouštěč naživo: Rob dvakrát klikne na totéž tlačítko. Hláška
  // musí říct, že se nic nestalo, ne strašit přechodem.
  it("u druhého kliknutí na totéž řekne, že zápas v tom stavu už je", () => {
    expect(() => assertTransition("dohrano", "dohrano")).toThrow(/už ve stavu „dohrano“ je/);
  });
});
