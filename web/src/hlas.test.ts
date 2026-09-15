import { afterEach, expect, it, vi } from "vitest";
import { nastavZesileniMikrofonu, VYCHOZI_ZESILENI, zesileniMikrofonu, zesilProud, ZESILENI_MAX, ZESILENI_MIN } from "./hlas.js";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
});

// Zesílení mikrofonu se pamatuje v prohlížeči a drží se v mezích 100–400 %.
it("zesílení mikrofonu se ukládá a ořezává na povolený rozsah", () => {
  expect(zesileniMikrofonu()).toBe(VYCHOZI_ZESILENI);
  nastavZesileniMikrofonu(250);
  expect(localStorage.getItem("hlas.zesileni-mikrofonu")).toBe("250");
  expect(zesileniMikrofonu()).toBe(250);
  nastavZesileniMikrofonu(1000);
  expect(zesileniMikrofonu()).toBe(ZESILENI_MAX);
  nastavZesileniMikrofonu(0);
  expect(zesileniMikrofonu()).toBe(ZESILENI_MIN);
});

// Při 100 % se proud nechává být; nad 100 % jde přes zisk a limiter.
it("zesilProud vrací původní proud při 100 % a zesílený nad ním", () => {
  const proud = { id: "puvodni" } as unknown as MediaStream;
  expect(zesilProud(proud, 100).proud).toBe(proud);

  const zavreno = vi.fn().mockResolvedValue(undefined);
  const gain = { gain: { value: 1 }, connect: vi.fn((cil: unknown) => cil) };
  const limiter = { threshold: { value: 0 }, knee: { value: 0 }, ratio: { value: 0 }, attack: { value: 0 }, release: { value: 0 }, connect: vi.fn((cil: unknown) => cil) };
  const cil = { stream: { id: "zesileny" } };
  const zdroj = { connect: vi.fn((c: unknown) => c) };
  vi.stubGlobal(
    "AudioContext",
    vi.fn(() => ({
      createGain: () => gain,
      createDynamicsCompressor: () => limiter,
      createMediaStreamDestination: () => cil,
      createMediaStreamSource: () => zdroj,
      close: zavreno,
    })),
  );
  const v = zesilProud(proud, 300);
  expect(v.proud).toBe(cil.stream);
  expect(gain.gain.value).toBe(3);
  expect(limiter.ratio.value).toBe(20);
  v.zavri();
  expect(zavreno).toHaveBeenCalled();
});
