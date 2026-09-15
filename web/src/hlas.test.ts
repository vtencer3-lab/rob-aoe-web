import { afterEach, expect, it, vi } from "vitest";
import { hlasitostAdmina, nastavHlasitostAdmina, nastavZesileniMikrofonu, VYCHOZI_HLASITOST_ADMINA, VYCHOZI_ZESILENI, zesileniMikrofonu, zesilProud, ZESILENI_MAX, ZESILENI_MIN } from "./hlas.js";

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

// Hlasitost hlasu adminů je vlastní podíl, taky jen v prohlížeči.
it("hlasitost administrátora se ukládá a ořezává na 0–100", () => {
  expect(hlasitostAdmina()).toBe(VYCHOZI_HLASITOST_ADMINA);
  nastavHlasitostAdmina(40);
  expect(localStorage.getItem("hlas.hlasitost-admina")).toBe("40");
  expect(hlasitostAdmina()).toBe(40);
  nastavHlasitostAdmina(-5);
  expect(hlasitostAdmina()).toBe(0);
});

// Při 100 % se proud nechává být; nad 100 % jde přes zisk a limiter.
it("zesilProud vrací původní proud při 100 % a zesílený nad ním", () => {
  const proud = { id: "puvodni" } as unknown as MediaStream;
  expect(zesilProud(proud, 100).proud).toBe(proud);

  const zavreno = vi.fn().mockResolvedValue(undefined);
  const gain = { gain: { value: 1 }, connect: vi.fn((cil: unknown) => cil) };
  const tvar = { curve: null as Float32Array | null, oversample: "none", connect: vi.fn((cil: unknown) => cil) };
  const cil = { stream: { id: "zesileny" } };
  const zdroj = { connect: vi.fn((c: unknown) => c) };
  const probuzeno = vi.fn().mockResolvedValue(undefined);
  const nastaveni: unknown[] = [];
  vi.stubGlobal(
    "AudioContext",
    vi.fn((o: unknown) => {
      nastaveni.push(o);
      return {
        createGain: () => gain,
        createWaveShaper: () => tvar,
        createMediaStreamDestination: () => cil,
        createMediaStreamSource: () => zdroj,
        resume: probuzeno,
        close: zavreno,
      };
    }),
  );
  const sProudem = { getAudioTracks: () => [{ getSettings: () => ({ sampleRate: 48_000 }) }] } as unknown as MediaStream;
  const v = zesilProud(sProudem, 300);
  expect(v.proud).toBe(cil.stream);
  expect(gain.gain.value).toBe(3);
  // Kontext má frekvenci mikrofonu a probudí se; omezení je měkká křivka.
  expect(nastaveni[0]).toMatchObject({ sampleRate: 48_000 });
  expect(probuzeno).toHaveBeenCalled();
  expect(tvar.curve).toBeInstanceOf(Float32Array);
  expect(tvar.curve!.at(-1)).toBeCloseTo(1, 5);
  expect(Math.max(...Array.from(tvar.curve!).map(Math.abs))).toBeLessThanOrEqual(1);
  v.zavri();
  expect(zavreno).toHaveBeenCalled();
});
