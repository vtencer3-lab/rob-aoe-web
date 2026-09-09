import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/events.js", () => ({
  getAktivniAkce: vi.fn(),
  withdraw: vi.fn(),
}));
vi.mock("./akceStav.js", () => ({ broadcastAkce: vi.fn() }));

import { getAktivniAkce, withdraw } from "../db/events.js";
import { ODCHOD_MS, sledujPritomnost, zapomenPritomnost } from "./pritomnost.js";

const HRAC = "76561198000000001";

beforeEach(() => {
  vi.useFakeTimers();
  zapomenPritomnost();
  vi.mocked(withdraw).mockReset();
  vi.mocked(getAktivniAkce).mockReset();
  vi.mocked(getAktivniAkce).mockResolvedValue({ id: 7 } as Awaited<ReturnType<typeof getAktivniAkce>>);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Doběhne odklad i příslib, který se v něm spustí. */
async function pockejNaOdchod(): Promise<void> {
  await vi.advanceTimersByTimeAsync(ODCHOD_MS + 1);
}

describe("odchod ze stránky", () => {
  it("po zavření poslední karty odhlásí z akce", async () => {
    const zavri = sledujPritomnost(HRAC);
    zavri();

    expect(withdraw).not.toHaveBeenCalled();
    await pockejNaOdchod();
    expect(withdraw).toHaveBeenCalledWith(7, HRAC);
  });

  // Obnovení stránky i krátký výpadek sítě spojení zavřou a hned otevřou
  // znovu. Kdyby odklad nešel zrušit, odhlásily by každého, kdo si dá F5.
  it("návrat před vypršením odkladu odhlášení zruší", async () => {
    const zavri = sledujPritomnost(HRAC);
    zavri();
    await vi.advanceTimersByTimeAsync(ODCHOD_MS / 2);

    sledujPritomnost(HRAC);
    await pockejNaOdchod();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it("zavření jedné ze dvou karet nedělá nic, zavření druhé odhlásí", async () => {
    const prvni = sledujPritomnost(HRAC);
    const druha = sledujPritomnost(HRAC);

    prvni();
    await pockejNaOdchod();
    expect(withdraw).not.toHaveBeenCalled();

    druha();
    await pockejNaOdchod();
    expect(withdraw).toHaveBeenCalledWith(7, HRAC);
  });

  // Úklid streamu se volá i vícekrát (z 'close' i z chybové větve). Kdyby se
  // druhé volání počítalo, sebralo by kartu, která je pořád otevřená.
  it("dvojí zavření téže karty se počítá jednou", async () => {
    const prvni = sledujPritomnost(HRAC);
    const druha = sledujPritomnost(HRAC);

    prvni();
    prvni();
    await pockejNaOdchod();
    expect(withdraw).not.toHaveBeenCalled();

    druha();
    await pockejNaOdchod();
    expect(withdraw).toHaveBeenCalledTimes(1);
  });

  it("bez běžící akce se neodhlašuje", async () => {
    vi.mocked(getAktivniAkce).mockResolvedValue(null);
    sledujPritomnost(HRAC)();

    await pockejNaOdchod();
    expect(withdraw).not.toHaveBeenCalled();
  });
});
