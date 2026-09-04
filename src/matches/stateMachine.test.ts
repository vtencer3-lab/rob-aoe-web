import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./stateMachine.js";

describe("host", () => {
  it("smí otevřít lobby a spustit hru", () => {
    expect(canTransition("vyhlaseny", "lobby_otevrena", "host")).toBe(true);
    expect(canTransition("lobby_otevrena", "hraje_se", "host")).toBe(true);
  });

  it("nesmí vyhlásit zápas, zapsat výsledek ani zrušit", () => {
    expect(canTransition("nachystany", "vyhlaseny", "host")).toBe(false);
    expect(canTransition("hraje_se", "dohrano", "host")).toBe(false);
    expect(canTransition("vyhlaseny", "zruseny", "host")).toBe(false);
  });

  it("nesmí přeskakovat kroky", () => {
    expect(canTransition("vyhlaseny", "hraje_se", "host")).toBe(false);
  });
});

describe("admin", () => {
  it("smí libovolný přechod včetně vrácení zpět", () => {
    expect(canTransition("nachystany", "hraje_se", "admin")).toBe(true);
    expect(canTransition("hraje_se", "vyhlaseny", "admin")).toBe(true);
    expect(canTransition("dohrano", "hraje_se", "admin")).toBe(true);
    expect(canTransition("lobby_otevrena", "zruseny", "admin")).toBe(true);
  });

  it("nesmí přejít do téhož stavu", () => {
    expect(canTransition("hraje_se", "hraje_se", "admin")).toBe(false);
  });
});

describe("assertTransition", () => {
  it("mlčí u povoleného přechodu", () => {
    expect(() => assertTransition("vyhlaseny", "lobby_otevrena", "host")).not.toThrow();
  });

  it("u zakázaného vysvětlí co a proč", () => {
    expect(() => assertTransition("hraje_se", "dohrano", "host")).toThrow(
      /host nesmí přejít z „hraje_se“ do „dohrano“/,
    );
  });
});
