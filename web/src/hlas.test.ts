import { afterEach, expect, it, vi } from "vitest";
import { PRESKOK_MS, spustPrehravacHlasu, TICHO_MS, UDALOST_HLAS, ZASOBA_MS, hlasitostAdmina, nastavHlasitostAdmina, nastavZesileniMikrofonu, VYCHOZI_HLASITOST_ADMINA, VYCHOZI_ZESILENI, zesileniMikrofonu, zesilProud, ZESILENI_MAX, ZESILENI_MIN } from "./hlas.js";

afterEach(() => {
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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

// Hlas jde ven naplno bez ohledu na Master Volume (uživatel 16. 9. 2026):
// ať se nemusí zesilovat vstup a ubírat z kvality.
it("hlas admina hraje na svou hlasitost, ne na podíl z Master Volume", () => {
  localStorage.setItem("zvuk.hlasitost", "30");
  const hlasitosti: number[] = [];
  vi.stubGlobal(
    "Audio",
    vi.fn(function () {
      return {
        set volume(v: number) {
          hlasitosti.push(v);
        },
        play: () => Promise.resolve(),
        addEventListener: () => {},
      };
    }),
  );
  const odhlasit = spustPrehravacHlasu("ja", true);
  const kousek = { zapasId: 1, kdo: "rob", jmeno: "Rob", sezeni: "s1", poradi: 0, konec: true, data: "AAAA", prijemci: ["ja"] };
  window.dispatchEvent(new CustomEvent(UDALOST_HLAS, { detail: kousek }));
  expect(hlasitosti).toEqual([1]);
  odhlasit();
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

/**
 * Náhrada MediaSource a Audio pro živé přehrávání: jsdom je nemá. Každý
 * přilepený kousek přidá do zásoby tolik zvuku, kolik test řekne (první
 * kousek z Chrome nese ~240 ms, další po 300 ms).
 */
function falesnePrehravani(delkyKouskuS: number[]) {
  const posluchaciAudia = new Map<string, () => void>();
  const prilepeno: string[] = [];
  const audio = {
    volume: 1,
    currentTime: 0,
    src: "",
    konecZasoby: 0,
    play: vi.fn(() => Promise.resolve()),
    pause: vi.fn(),
    addEventListener: (typ: string, cb: () => void) => void posluchaciAudia.set(typ, cb),
    buffered: {
      get length() {
        return audio.konecZasoby > 0 ? 1 : 0;
      },
      end: () => audio.konecZasoby,
    },
  };
  const posluchaciBufferu = new Map<string, () => void>();
  const buffer = {
    updating: false,
    mode: "segments",
    addEventListener: (typ: string, cb: () => void) => void posluchaciBufferu.set(typ, cb),
    appendBuffer: (kousek: Uint8Array) => {
      prilepeno.push(String.fromCharCode(...kousek));
      audio.konecZasoby += delkyKouskuS[prilepeno.length - 1] ?? 0.3;
      posluchaciBufferu.get("updateend")?.();
    },
  };
  const zdroj = {
    readyState: "open",
    addSourceBuffer: () => buffer,
    endOfStream: vi.fn(() => {
      zdroj.readyState = "ended";
    }),
    // Skutečný zdroj se otevře, až ho prvek převezme; tady hned.
    addEventListener: (typ: string, cb: () => void) => {
      if (typ === "sourceopen") cb();
    },
  };
  vi.stubGlobal("Audio", vi.fn(() => audio));
  vi.stubGlobal("MediaSource", Object.assign(vi.fn(() => zdroj), { isTypeSupported: () => true }));
  // jsdom adresy objektů neumí; přehrávač ji jen předá prvku.
  URL.createObjectURL ??= () => "";
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:hlas");
  const odhlasit = spustPrehravacHlasu("ja", false);
  const kousek = (poradi: number, konec = false) =>
    window.dispatchEvent(
      new CustomEvent(UDALOST_HLAS, { detail: { zapasId: 1, kdo: "rob", jmeno: "Rob", sezeni: "s1", poradi, konec, data: konec ? "" : btoa(String(poradi)), prijemci: ["ja"], mime: "audio/webm;codecs=opus" } }),
    );
  return { audio, buffer, zdroj, prilepeno, kousek, odhlasit, udalostAudia: (typ: string) => posluchaciAudia.get(typ)?.() };
}

// Příčina lupání z 2. 10. 2026: hrálo se hned s prvním kouskem (240 ms),
// další dorazil až za 300 ms a prohlížeč přehrávání na třetinu vteřiny
// zastavil. Teď se čeká na zásobu.
it("s prvním kouskem se ještě nehraje, až se zásobou", () => {
  const p = falesnePrehravani([0.24, 0.3, 0.3]);
  p.kousek(0);
  expect(p.prilepeno).toEqual(["0"]);
  expect(p.audio.play).not.toHaveBeenCalled();
  p.kousek(1);
  expect(p.audio.konecZasoby * 1000).toBeGreaterThanOrEqual(ZASOBA_MS);
  expect(p.audio.play).toHaveBeenCalledTimes(1);
  p.kousek(2);
  expect(p.audio.play).toHaveBeenCalledTimes(1);
  expect(p.buffer.mode).toBe("sequence");
  p.odhlasit();
});

it("krátká promluva se přehraje, jakmile přijde značka konce", () => {
  const p = falesnePrehravani([0.24]);
  p.kousek(0);
  expect(p.audio.play).not.toHaveBeenCalled();
  p.kousek(1, true);
  expect(p.zdroj.endOfStream).toHaveBeenCalledTimes(1);
  expect(p.audio.play).toHaveBeenCalledTimes(1);
  p.odhlasit();
});

it("po zádrhelu se zásoba sbírá znovu celá, ne od prvního dalšího kousku", () => {
  const p = falesnePrehravani([0.24, 0.3, 0.3, 0.3]);
  p.kousek(0);
  p.kousek(1);
  expect(p.audio.play).toHaveBeenCalledTimes(1);
  // Síť se zadrhla: dohrálo se až na konec zásoby.
  p.audio.currentTime = p.audio.konecZasoby;
  p.udalostAudia("waiting");
  expect(p.audio.pause).toHaveBeenCalledTimes(1);
  p.kousek(2);
  expect(p.audio.play).toHaveBeenCalledTimes(1);
  p.kousek(3);
  expect(p.audio.play).toHaveBeenCalledTimes(2);
  p.odhlasit();
});

it("přeházené kousky lepí v pořadí a ztracený po chvíli přeskočí", () => {
  vi.useFakeTimers();
  try {
    const p = falesnePrehravani([0.24, 0.3, 0.3, 0.3]);
    p.kousek(1);
    p.kousek(0);
    expect(p.prilepeno).toEqual(["0", "1"]);
    // Kousek 2 se ztratil (POST neprošel); 3 a 4 čekají, pak jdou dál.
    p.kousek(3);
    p.kousek(4);
    expect(p.prilepeno).toEqual(["0", "1"]);
    vi.advanceTimersByTime(PRESKOK_MS);
    expect(p.prilepeno).toEqual(["0", "1", "3", "4"]);
    // Opozdilec už se nevrací — hrálo by se pozpátku.
    p.kousek(2);
    expect(p.prilepeno).toEqual(["0", "1", "3", "4"]);
    p.odhlasit();
  } finally {
    vi.useRealTimers();
  }
});

it("sezení, kterému se ztratila značka konce, se po tichu uzavře samo", () => {
  vi.useFakeTimers();
  try {
    const p = falesnePrehravani([0.24]);
    p.kousek(0);
    expect(p.zdroj.endOfStream).not.toHaveBeenCalled();
    vi.advanceTimersByTime(TICHO_MS);
    expect(p.zdroj.endOfStream).toHaveBeenCalledTimes(1);
    expect(p.audio.play).toHaveBeenCalledTimes(1);
    p.odhlasit();
  } finally {
    vi.useRealTimers();
  }
});
