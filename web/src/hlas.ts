import type { HlasUdalost } from "../../src/shared/types.js";
import { hlasitost } from "./zvuk.js";

/** Událost okna, kterou stream předává kousky hlasu (detail = HlasUdalost). */
export const UDALOST_HLAS = "aoe:hlas";
/** Kolik ms nahrávky jde v jednom kousku; menší = menší zpoždění, víc požadavků. */
export const KOUSEK_MS = 250;
/** Preferovaný formát nahrávky; co prohlížeč neumí, nahradí výchozím. */
export const MIME_HLASU = "audio/webm;codecs=opus";
const KLIC_ZTLUMIT_ADMINY = "hlas.ztlumit-adminy";
const KLIC_HLASITOST_ADMINA = "hlas.hlasitost-admina";
const KLIC_ZESILENI = "hlas.zesileni-mikrofonu";
/**
 * Hlasitost hlasu administrátorů, 0–100; výchozí 100 = naplno.
 *
 * Schválně **mimo Master Volume** (uživatel 16. 9. 2026): výstup má jít na
 * maximum, ať se nemusí zesilovat vstup z mikrofonu — zesílení na vstupu
 * ukrajuje z kvality, i s měkkým omezením. Master Volume tedy hlas neztlumí;
 * kdo chce kolegu ztišit, ubere tímhle posuvníkem, nebo ho umlčí úplně.
 */
export const VYCHOZI_HLASITOST_ADMINA = 100;

export function hlasitostAdmina(): number {
  try {
    const ulozeno = localStorage.getItem(KLIC_HLASITOST_ADMINA);
    const cislo = ulozeno === null ? NaN : Number(ulozeno);
    return Number.isFinite(cislo) ? Math.min(100, Math.max(0, cislo)) : VYCHOZI_HLASITOST_ADMINA;
  } catch {
    return VYCHOZI_HLASITOST_ADMINA;
  }
}

export function nastavHlasitostAdmina(procent: number): void {
  try {
    localStorage.setItem(KLIC_HLASITOST_ADMINA, String(Math.min(100, Math.max(0, Math.round(procent)))));
  } catch {
    // Bez úložiště platí do obnovení stránky jen výchozí.
  }
}
/** Zesílení mikrofonu v procentech: 100 = bez zásahu, 400 = čtyřnásobek. */
export const ZESILENI_MIN = 100;
export const ZESILENI_MAX = 400;
export const VYCHOZI_ZESILENI = 100;

export function zesileniMikrofonu(): number {
  try {
    const ulozeno = localStorage.getItem(KLIC_ZESILENI);
    const cislo = ulozeno === null ? NaN : Number(ulozeno);
    return Number.isFinite(cislo) ? Math.min(ZESILENI_MAX, Math.max(ZESILENI_MIN, cislo)) : VYCHOZI_ZESILENI;
  } catch {
    return VYCHOZI_ZESILENI;
  }
}

export function nastavZesileniMikrofonu(procent: number): void {
  try {
    localStorage.setItem(KLIC_ZESILENI, String(Math.min(ZESILENI_MAX, Math.max(ZESILENI_MIN, Math.round(procent)))));
  } catch {
    // Bez úložiště platí do obnovení stránky jen výchozí.
  }
}

/**
 * Měkké omezení (tanh): nad prahem se křivka plynule ohýbá a nikdy nepřeteče
 * přes 1. Kompresor (`DynamicsCompressor`) tady dřív lupal — má náběh (attack),
 * takže první milisekundy hlasité slabiky projdou nezkrácené a useknou se
 * natvrdo (uživatel 16. 9. 2026: „po tom zesílení ten zvuk lupe“). Tvar
 * křivky nemá náběh, ohne každý vzorek hned.
 */
function krivkaOmezeni(delka = 2048): Float32Array<ArrayBuffer> {
  const k = new Float32Array(new ArrayBuffer(delka * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < delka; i++) {
    const x = (i / (delka - 1)) * 2 - 1;
    // tanh se strmostí 1,6: do ±0,5 skoro rovné, dál plynule saturuje.
    k[i] = Math.tanh(x * 1.6) / Math.tanh(1.6);
  }
  return k;
}

/**
 * Proud z mikrofonu zesílený podle nastavení (uživatel 15. 9. 2026: „možnost
 * boostnout svůj mikrofon“). Web Audio: zdroj → zisk → měkké omezení →
 * výstupní proud. Vrací i zavření kontextu; při 100 % nebo bez Web Audia se
 * vrací původní proud a zavírat není co.
 *
 * Kontext se zakládá se vzorkovací frekvencí mikrofonu: s jinou by prohlížeč
 * musel převzorkovávat a na hranicích bloků to cvakalo. Zároveň se hned
 * probouzí (`resume`) — uspaný kontext posílá do nahrávky ticho a mezery.
 */
export function zesilProud(proud: MediaStream, procent: number): { proud: MediaStream; zavri: () => void } {
  const Kontext = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (procent <= 100 || !Kontext) return { proud, zavri: () => {} };
  const stopa = proud.getAudioTracks()[0];
  const sampleRate = stopa?.getSettings?.().sampleRate;
  const kontext = sampleRate ? new Kontext({ sampleRate, latencyHint: "interactive" }) : new Kontext({ latencyHint: "interactive" });
  void kontext.resume?.().catch(() => {});
  const zisk = kontext.createGain();
  zisk.gain.value = procent / 100;
  const omezeni = kontext.createWaveShaper();
  omezeni.curve = krivkaOmezeni();
  omezeni.oversample = "4x";
  const cil = kontext.createMediaStreamDestination();
  kontext.createMediaStreamSource(proud).connect(zisk).connect(omezeni).connect(cil);
  return {
    proud: cil.stream,
    zavri: () => {
      void kontext.close().catch(() => {});
    },
  };
}

/**
 * Zkouška mikrofonu (uživatel 16. 9. 2026, ať jde zesílení nastavit bez
 * druhého člověka): pár vteřin se nahraje přesně tím řetězcem, kterým jde
 * push-to-talk, a vrátí se adresa nahrávky k přehrání. Volající ji po
 * přehrání uvolní (`URL.revokeObjectURL`).
 */
export async function nahrajZkousku(procent: number, ms = 3_000): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Tenhle prohlížeč nahrávání z mikrofonu neumí.");
  }
  const proud = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
  const zesileni = zesilProud(proud, procent);
  const mime = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(MIME_HLASU) ? MIME_HLASU : undefined;
  const rekorder = mime ? new MediaRecorder(zesileni.proud, { mimeType: mime, audioBitsPerSecond: 64_000 }) : new MediaRecorder(zesileni.proud);
  const kusy: Blob[] = [];
  rekorder.ondataavailable = (e: BlobEvent) => {
    if (e.data.size > 0) kusy.push(e.data);
  };
  const konec = new Promise<void>((hotovo) => {
    rekorder.onstop = () => hotovo();
  });
  rekorder.start();
  await new Promise((dal) => setTimeout(dal, ms));
  rekorder.stop();
  await konec;
  zesileni.zavri();
  proud.getTracks().forEach((t) => t.stop());
  return URL.createObjectURL(new Blob(kusy, { type: rekorder.mimeType || mime || MIME_HLASU }));
}

export function ztlumitAdminy(): boolean {
  try {
    return localStorage.getItem(KLIC_ZTLUMIT_ADMINY) === "1";
  } catch {
    return false;
  }
}

export function nastavZtlumitAdminy(ano: boolean): void {
  try {
    localStorage.setItem(KLIC_ZTLUMIT_ADMINY, ano ? "1" : "0");
  } catch {
    // Bez úložiště platí jen do obnovení stránky.
  }
}

function dekoduj(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Kolik zvuku musí být nachystáno, než se začne hrát — a po zádrhelu znovu.
 *
 * Dřív se hrálo hned s prvním kouskem. Ten nese ~240 ms zvuku a další dorazí
 * až za 300 ms (Chrome kóduje Opus po 60 ms, takže „250ms“ kousek má ve
 * skutečnosti 300 ms), takže zásoba došla ještě před druhým kouskem a
 * prohlížeč přehrávání na ~0,35 s zastavil: useknutí, ticho, naskočení —
 * dvě lupnutí a díra v prvním slově každé promluvy, i na dokonalé síti
 * (měřeno 2. 10. 2026, docs/know-how/push-to-talk.md). S touhle zásobou se
 * začíná až po druhém kousku a před příchodem každého dalšího zbývá ~240 ms
 * rezervy na zpoždění sítě.
 */
export const ZASOBA_MS = 450;
/** Jak dlouho se čeká na kousek, který nedorazil, než se přeskočí. */
export const PRESKOK_MS = 1_500;
/** Po jak dlouhém tichu ze sítě se sezení uzavře samo (ztracená značka konce). */
export const TICHO_MS = 5_000;

/**
 * Jedno mluvení (sezení) jednoho mluvčího. Kousky se lepí do MediaSource, ať
 * hraje skoro živě; kde MediaSource s Opusem není (Safari), se kousky
 * posbírají a přehrají naráz po konci — jako vysílačka.
 */
class Prehravani {
  readonly #audio = new Audio();
  readonly #fronta: Uint8Array[] = [];
  #zdroj: MediaSource | null = null;
  #buffer: SourceBuffer | null = null;
  #konec = false;
  /** Hraje se (nebo se o to prohlížeč snaží); false = sbírá se zásoba. */
  #hraje = false;
  #zavreno = false;
  #cekaPoradi = 0;
  readonly #odlozene = new Map<number, HlasUdalost>();
  #preskok: ReturnType<typeof setTimeout> | null = null;
  #ticho: ReturnType<typeof setTimeout> | null = null;
  #pojistka: ReturnType<typeof setTimeout> | null = null;
  readonly #mime: string;
  readonly #zive: boolean;
  readonly #onZavreno: () => void;

  constructor(mime: string, onZavreno: () => void) {
    this.#mime = mime;
    this.#onZavreno = onZavreno;
    // Naplno, nezávisle na Master Volume — viz hlasitostAdmina().
    this.#audio.volume = Math.min(1, Math.max(0, hlasitostAdmina() / 100));
    this.#audio.addEventListener("ended", () => this.#zavri());
    this.#zive = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported(mime);
    if (this.#zive) {
      this.#zdroj = new MediaSource();
      this.#audio.src = URL.createObjectURL(this.#zdroj);
      this.#zdroj.addEventListener("sourceopen", () => {
        if (!this.#zdroj || this.#buffer) return;
        this.#buffer = this.#zdroj.addSourceBuffer(mime);
        try {
          // Kousky se řadí za sebe bez ohledu na časové značky uvnitř: po
          // přeskočeném (ztraceném) kousku tak v zásobě nezůstane díra,
          // na které by přehrávání zůstalo stát.
          this.#buffer.mode = "sequence";
        } catch {
          // Prohlížeč, který to u tohohle formátu nedovolí, hraje podle značek.
        }
        this.#buffer.addEventListener("updateend", () => this.#dalsi());
        this.#buffer.addEventListener("error", () => this.#vzdej());
        this.#dalsi();
      });
      // Zásoba došla uprostřed řeči: nenechat prohlížeč naskočit s prvním
      // dalším kouskem (hned by došla zas), ale nasbírat ji znovu celou.
      this.#audio.addEventListener("waiting", () => {
        if (!this.#hraje || this.#konec) return;
        this.#hraje = false;
        this.#audio.pause();
      });
    }
  }

  /** Kousky můžou dorazit přeházené (každý je vlastní POST) — lepí se v pořadí. */
  prijmi(u: HlasUdalost): void {
    // Opozdilec po přeskočení nebo dvojí doručení: už se k němu nevrací.
    if (this.#zavreno || u.poradi < this.#cekaPoradi) return;
    this.#odlozene.set(u.poradi, u);
    this.#vyber();
    if (this.#ticho) clearTimeout(this.#ticho);
    this.#ticho = this.#konec ? null : setTimeout(() => this.#dotahni(), TICHO_MS);
    if (this.#odlozene.size === 0) {
      if (this.#preskok) clearTimeout(this.#preskok);
      this.#preskok = null;
    } else if (!this.#preskok) {
      // Kousek před těmihle chybí (POST se ztratil). Chvíli se na něj počká,
      // pak se přeskočí — jinak by zbytek promluvy mlčel až do konce.
      this.#preskok = setTimeout(() => {
        this.#preskok = null;
        this.#cekaPoradi = Math.min(...this.#odlozene.keys());
        this.#vyber();
        this.#zpracuj();
      }, PRESKOK_MS);
    }
    this.#zpracuj();
  }

  /** Co je na řadě, jde z odložených do fronty k přilepení. */
  #vyber(): void {
    for (;;) {
      const dalsi = this.#odlozene.get(this.#cekaPoradi);
      if (!dalsi) break;
      this.#odlozene.delete(this.#cekaPoradi);
      this.#cekaPoradi++;
      if (dalsi.data) this.#fronta.push(dekoduj(dalsi.data));
      if (dalsi.konec) this.#konec = true;
    }
  }

  #zpracuj(): void {
    if (this.#zive) this.#dalsi();
    else if (this.#konec) this.#prehrajNaraz();
  }

  /** Mluvčí zmizel bez značky konce: dohrát, co je, a zavřít. */
  #dotahni(): void {
    this.#ticho = null;
    if (this.#konec) return;
    for (const poradi of [...this.#odlozene.keys()].sort((a, b) => a - b)) {
      const u = this.#odlozene.get(poradi);
      if (u?.data) this.#fronta.push(dekoduj(u.data));
    }
    this.#odlozene.clear();
    this.#konec = true;
    this.#zpracuj();
  }

  #dalsi(): void {
    const b = this.#buffer;
    if (!b || b.updating || this.#zavreno) return;
    const kousek = this.#fronta.shift();
    if (kousek) {
      try {
        b.appendBuffer(kousek as BufferSource);
      } catch {
        // Rozbitý kousek — zbytek sezení se vzdá, ať to nekřičí do konzole.
        this.#vzdej();
      }
      return;
    }
    if (this.#konec && this.#zdroj?.readyState === "open") {
      try {
        this.#zdroj.endOfStream();
      } catch {
        // Už zavřeno — nevadí.
      }
      // Kdyby prohlížeč přehrání nepustil (autoplay) nebo neohlásil konec,
      // zavře se sezení samo chvíli po tom, co mělo dohrát.
      this.#pojistka ??= setTimeout(() => this.#zavri(), this.#zasobaMs() + 2_000);
    }
    this.#zkusHrat();
  }

  #zasobaMs(): number {
    const b = this.#audio.buffered;
    return b.length === 0 ? 0 : (b.end(b.length - 1) - this.#audio.currentTime) * 1000;
  }

  /** Hrát se začne až s dostatečnou zásobou — nebo když už víc nepřijde. */
  #zkusHrat(): void {
    if (this.#hraje || this.#zavreno) return;
    const zasoba = this.#zasobaMs();
    if (zasoba >= ZASOBA_MS || (this.#konec && zasoba > 0)) {
      this.#hraje = true;
      void this.#audio.play()?.catch(() => {});
    } else if (this.#konec) {
      // Prázdné sezení (stisk a hned puštění): není co hrát.
      this.#zavri();
    }
  }

  #prehrajNaraz(): void {
    if (this.#fronta.length === 0) {
      this.#zavri();
      return;
    }
    const blob = new Blob(this.#fronta.splice(0) as BlobPart[], { type: this.#mime });
    this.#audio.src = URL.createObjectURL(blob);
    void this.#audio.play()?.catch(() => this.#zavri());
  }

  /** Formát, který prohlížeč nepřehraje, nebo sezení bez začátku (hlavičky). */
  #vzdej(): void {
    this.#fronta.length = 0;
    this.#odlozene.clear();
    this.#konec = true;
    this.#zavri();
  }

  #zavri(): void {
    if (this.#zavreno) return;
    this.#zavreno = true;
    for (const c of [this.#preskok, this.#ticho, this.#pojistka]) if (c) clearTimeout(c);
    this.#onZavreno();
  }
}

/**
 * Přehrávač hlasu pro celou stránku: poslouchá kousky ze streamu a hraje je.
 * Vlastní hlas se nehraje (server ho ani neposílá), a admin si může ostatní
 * adminy ztlumit. Vrací odhlášení.
 */
export function spustPrehravacHlasu(ja: string, jaAdmin: boolean): () => void {
  const sezeni = new Map<string, Prehravani>();
  const naHlas = (e: Event) => {
    const u = (e as CustomEvent<HlasUdalost>).detail;
    if (!u || u.kdo === ja) return;
    // Ztlumení ostatních adminů: jen admin, jen cizí admini — hráči ho slyší vždy.
    if (jaAdmin && ztlumitAdminy() && !u.prijemci.includes(ja)) return;
    const klic = `${u.kdo}/${u.sezeni}`;
    let p = sezeni.get(klic);
    if (!p) {
      // Dohrané sezení zůstane ještě minutu v mapě, ať opožděný kousek
      // nezaloží nové přehrávání téže promluvy.
      p = new Prehravani(u.mime ?? MIME_HLASU, () => setTimeout(() => sezeni.delete(klic), 60_000));
      sezeni.set(klic, p);
    }
    p.prijmi(u);
  };
  window.addEventListener(UDALOST_HLAS, naHlas);
  return () => window.removeEventListener(UDALOST_HLAS, naHlas);
}

/** Jak kousky odcházejí na server; vrací se jako slib, ať jde držet pořadí. */
export type OdesliKousek = (telo: { sezeni: string; poradi: number; konec?: boolean; data?: string; mime?: string }) => Promise<unknown>;

async function doB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Nahrávání z mikrofonu po kouscích. `spust()` si řekne o mikrofon (napoprvé
 * se prohlížeč zeptá) a začne posílat; `zastav()` pošle poslední kousek
 * a značku konce a mikrofon zase pustí, ať v kartě nesvítí nahrávání.
 * Kousky se posílají za sebou (další čeká na předchozí), ať dorazí v pořadí.
 */
export function vytvorNahravani(odesli: OdesliKousek, onChyba?: (zprava: string) => void) {
  let rekorder: MediaRecorder | null = null;
  let proud: MediaStream | null = null;
  let zavriZesileni: (() => void) | null = null;
  let fronta: Promise<unknown> = Promise.resolve();
  let sezeni = "";
  let poradi = 0;

  const posli = (telo: Parameters<OdesliKousek>[0]) => {
    fronta = fronta.then(() => odesli(telo)).catch(() => {});
  };

  return {
    async spust(): Promise<void> {
      if (rekorder) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        onChyba?.("Tenhle prohlížeč nahrávání z mikrofonu neumí.");
        return;
      }
      try {
        // Automatické řízení hlasitosti se při zesílení pere s naším ziskem
        // (zvedne se šum, pak to škubne dolů), tak jen echo a šum.
        proud = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } });
      } catch {
        onChyba?.("Mikrofon se nepodařilo otevřít — povol ho stránce v prohlížeči.");
        return;
      }
      // Zesílení se čte až tady, ať změna v nastavení platí od dalšího stisku.
      const zesileni = zesilProud(proud, zesileniMikrofonu());
      zavriZesileni = zesileni.zavri;
      const nahravany = zesileni.proud;
      const mime = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(MIME_HLASU) ? MIME_HLASU : undefined;
      // 32 kb/s zesílenému hlasu nestačilo — hlasitější místa chrastila.
      rekorder = mime ? new MediaRecorder(nahravany, { mimeType: mime, audioBitsPerSecond: 64_000 }) : new MediaRecorder(nahravany);
      sezeni = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      poradi = 0;
      const skutecnyMime = rekorder.mimeType || mime || MIME_HLASU;
      rekorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        const moje = poradi++;
        const s = sezeni;
        fronta = fronta
          .then(async () => odesli({ sezeni: s, poradi: moje, data: await doB64(e.data), mime: skutecnyMime }))
          .catch(() => {});
      };
      rekorder.onstop = () => {
        posli({ sezeni, poradi: poradi++, konec: true, mime: skutecnyMime });
      };
      rekorder.start(KOUSEK_MS);
    },
    zastav(): void {
      const r = rekorder;
      rekorder = null;
      if (r && r.state !== "inactive") r.stop();
      zavriZesileni?.();
      zavriZesileni = null;
      proud?.getTracks().forEach((t) => t.stop());
      proud = null;
    },
    get bezi(): boolean {
      return rekorder !== null;
    },
  };
}
