import { afterEach, expect, it, vi } from "vitest";
import {
  hlasitostAdmina,
  krivkaOmezeni,
  nastavHlasitostAdmina,
  nastavZesileniMikrofonu,
  PRESKOK_MS,
  spustPrehravacHlasu,
  TICHO_MS,
  UDALOST_HLAS,
  VYCHOZI_HLASITOST_ADMINA,
  VYCHOZI_ZESILENI,
  vytvorNahravani,
  ZASOBA_MS,
  zesileniMikrofonu,
  ZESILENI_MAX,
  ZESILENI_MIN,
} from "./hlas.js";

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

// Omezení zesíleného hlasu: do kolena nic nemění („150 %“ je opravdu 1,5×),
// nad ním se ohýbá a přes plný rozsah nepustí nic — ani čtyřnásobek.
it("křivka omezení je do kolena přímka a nikdy nepřekročí plný rozsah", () => {
  const k = krivkaOmezeni();
  const hodnota = (x: number) => k[Math.round(((x / (ZESILENI_MAX / 100) + 1) / 2) * (k.length - 1))]!;
  expect(hodnota(0)).toBe(0);
  expect(hodnota(0.25)).toBeCloseTo(0.25, 3);
  expect(hodnota(-0.5)).toBeCloseTo(-0.5, 3);
  expect(hodnota(1)).toBeLessThan(1);
  expect(hodnota(1)).toBeGreaterThan(0.8);
  expect(Math.max(...Array.from(k).map(Math.abs))).toBeLessThanOrEqual(1);
  for (let i = 1; i < k.length; i++) expect(k[i]!).toBeGreaterThanOrEqual(k[i - 1]!);
  expect(k[0]).toBeCloseTo(-k.at(-1)!, 6);
});

/** Náhrada Web Audia; `stav` říká, jestli prohlížeč kontextu dovolil běžet. */
function falesnyKontext(stav: "running" | "suspended") {
  const zisk = { gain: { value: 1 }, connect: vi.fn((cil: unknown) => cil) };
  const tvar = { curve: null as Float32Array | null, oversample: "none", connect: vi.fn((cil: unknown) => cil) };
  const zdroj = { connect: vi.fn((cil: unknown) => cil) };
  const kontext = {
    state: stav,
    destination: { id: "vystup" },
    createGain: () => zisk,
    createWaveShaper: () => tvar,
    createMediaElementSource: vi.fn(() => zdroj),
    // Bez gesta uživatele prohlížeč kontext nepustí a slib zůstane viset.
    resume: vi.fn(() => new Promise<void>(() => {})),
  };
  const Konstruktor = vi.fn(() => kontext);
  vi.stubGlobal("AudioContext", Konstruktor);
  return { zisk, tvar, zdroj, kontext, Konstruktor };
}

// Zesiluje se až při přehrávání (nahrávka přes Web Audio lupala, viz
// zesilPrehravani). Modul drží jeden kontext, proto čerstvý import.
it("zesilPrehravani při 100 % nic nezapojuje, nad 100 % vede prvek přes zisk a omezení", async () => {
  vi.resetModules();
  const { zesilPrehravani } = await import("./hlas.js");
  const w = falesnyKontext("running");
  const audio = {} as HTMLMediaElement;
  zesilPrehravani(audio, 100);
  expect(w.Konstruktor).not.toHaveBeenCalled();
  zesilPrehravani(audio, 300);
  expect(w.kontext.createMediaElementSource).toHaveBeenCalledWith(audio);
  // 3× rozložené na zisk 0,75 a křivku, která pokrývá čtyřnásobek rozsahu.
  expect(w.zisk.gain.value).toBeCloseTo(0.75, 6);
  expect(w.tvar.curve).toBeInstanceOf(Float32Array);
  expect(w.tvar.connect).toHaveBeenCalledWith(w.kontext.destination);
});

// Uspaný kontext by prvek umlčel úplně — to je horší než nezesílený hlas.
it("zesilPrehravani nechá prvek hrát přímo, dokud prohlížeč Web Audio nepustí", async () => {
  vi.resetModules();
  const { zesilPrehravani } = await import("./hlas.js");
  const w = falesnyKontext("suspended");
  zesilPrehravani({} as HTMLMediaElement, 300);
  await Promise.resolve();
  expect(w.kontext.resume).toHaveBeenCalled();
  expect(w.kontext.createMediaElementSource).not.toHaveBeenCalled();
});

/** Náhrada mikrofonu a MediaRecorderu: test si kousky „nahrává“ sám. */
function falesnyMikrofon() {
  const stopa = { stop: vi.fn() };
  const proud = { getTracks: () => [stopa] };
  const rekordery: { proud: unknown; volby: unknown; kousek: (text: string) => void; stop: () => void }[] = [];
  class Rekorder {
    static isTypeSupported = () => true;
    mimeType = "audio/webm;codecs=opus";
    state = "inactive";
    ondataavailable: ((e: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    constructor(
      readonly proud: unknown,
      readonly volby: unknown,
    ) {
      rekordery.push(this);
    }
    start() {
      this.state = "recording";
    }
    stop() {
      this.state = "inactive";
      this.onstop?.();
    }
    kousek(text: string) {
      // Blob v jsdom neumí arrayBuffer(); nahrávání z něj nic jiného nečte.
      this.ondataavailable?.({ data: { size: text.length, arrayBuffer: async () => new TextEncoder().encode(text).buffer } as unknown as Blob });
    }
  }
  vi.stubGlobal("MediaRecorder", Rekorder);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(proud) } });
  return { proud, stopa, rekordery };
}

it("nahrává přímo z mikrofonu a zesílení posílá jen jako údaj u kousku", async () => {
  const m = falesnyMikrofon();
  const w = falesnyKontext("running");
  nastavZesileniMikrofonu(250);
  const odesli = vi.fn().mockResolvedValue({ ok: true });
  const nahravani = vytvorNahravani(odesli);
  await nahravani.spust();
  // Žádné Web Audio v cestě nahrávky: rekordér dostal proud mikrofonu.
  expect(m.rekordery[0]!.proud).toBe(m.proud);
  expect(w.Konstruktor).not.toHaveBeenCalled();
  m.rekordery[0]!.kousek("a");
  nahravani.zastav();
  await vi.waitFor(() => expect(odesli).toHaveBeenCalledTimes(2));
  expect(odesli.mock.calls[0]![0]).toMatchObject({ poradi: 0, data: btoa("a"), zesileni: 250 });
  expect(odesli.mock.calls[1]![0]).toMatchObject({ poradi: 1, konec: true });
  expect(odesli.mock.calls[1]![0].sezeni).toBe(odesli.mock.calls[0]![0].sezeni);
  expect(m.stopa.stop).toHaveBeenCalled();
});

it("bez zesílení kousek žádný údaj o zesílení nenese", async () => {
  const m = falesnyMikrofon();
  const odesli = vi.fn().mockResolvedValue({ ok: true });
  const nahravani = vytvorNahravani(odesli);
  await nahravani.spust();
  m.rekordery[0]!.kousek("a");
  await vi.waitFor(() => expect(odesli).toHaveBeenCalledTimes(1));
  expect(odesli.mock.calls[0]![0]).not.toHaveProperty("zesileni");
  nahravani.zastav();
});

// Ztracený kousek je díra v řeči posluchačů: výpadek sítě se zkusí znovu,
// odmítnutí serverem (403, 413) ne — a mluvčí se dozví, že ho neslyší.
it("kousek, který neprošel sítí, pošle ještě jednou; odmítnutý ohlásí mluvčímu", async () => {
  const m = falesnyMikrofon();
  const odesli = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce({ ok: true }).mockRejectedValue(new Error("Tohle smí jen Rob."));
  const onChyba = vi.fn();
  const nahravani = vytvorNahravani(odesli, onChyba);
  await nahravani.spust();
  m.rekordery[0]!.kousek("a");
  await vi.waitFor(() => expect(odesli).toHaveBeenCalledTimes(2));
  expect(odesli.mock.calls[1]![0]).toEqual(odesli.mock.calls[0]![0]);
  expect(onChyba).not.toHaveBeenCalled();
  m.rekordery[0]!.kousek("b");
  m.rekordery[0]!.kousek("c");
  await vi.waitFor(() => expect(odesli).toHaveBeenCalledTimes(4));
  expect(onChyba).toHaveBeenCalledTimes(1);
  expect(onChyba).toHaveBeenCalledWith("Tohle smí jen Rob.");
  nahravani.zastav();
});

/**
 * Náhrada MediaSource a Audio pro živé přehrávání: jsdom je nemá. Každý
 * přilepený kousek přidá do zásoby tolik zvuku, kolik test řekne (první
 * kousek z Chrome nese ~240 ms, další po 300 ms).
 */
function falesnePrehravani(delkyKouskuS: number[], spust = spustPrehravacHlasu, navic: { zesileni?: number } = {}) {
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
  const odhlasit = spust("ja", false);
  const kousek = (poradi: number, konec = false) =>
    window.dispatchEvent(
      new CustomEvent(UDALOST_HLAS, { detail: { zapasId: 1, kdo: "rob", jmeno: "Rob", sezeni: "s1", poradi, konec, data: konec ? "" : btoa(String(poradi)), prijemci: ["ja"], mime: "audio/webm;codecs=opus", ...navic } }),
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

// Zesílení mluvčího přijde s kouskem a zesílí až přehrávání u posluchače.
it("zesílení z kousku vede přehrávání přes zisk; bez něj prvek hraje přímo", async () => {
  vi.resetModules();
  const hlas = await import("./hlas.js");
  const w = falesnyKontext("running");
  const bez = falesnePrehravani([0.24], hlas.spustPrehravacHlasu);
  bez.kousek(0);
  expect(w.kontext.createMediaElementSource).not.toHaveBeenCalled();
  bez.odhlasit();
  const zesilene = falesnePrehravani([0.24], hlas.spustPrehravacHlasu, { zesileni: 200 });
  zesilene.kousek(0);
  expect(w.kontext.createMediaElementSource).toHaveBeenCalledWith(zesilene.audio);
  expect(w.zisk.gain.value).toBeCloseTo(0.5, 6);
  zesilene.odhlasit();
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
