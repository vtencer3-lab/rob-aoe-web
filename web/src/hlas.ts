import type { HlasUdalost } from "../../src/shared/types.js";
import { hlasitost } from "./zvuk.js";

/** Událost okna, kterou stream předává kousky hlasu (detail = HlasUdalost). */
export const UDALOST_HLAS = "aoe:hlas";
/** Kolik ms nahrávky jde v jednom kousku; menší = menší zpoždění, víc požadavků. */
export const KOUSEK_MS = 250;
/** Preferovaný formát nahrávky; co prohlížeč neumí, nahradí výchozím. */
export const MIME_HLASU = "audio/webm;codecs=opus";
const KLIC_ZTLUMIT_ADMINY = "hlas.ztlumit-adminy";

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
 * Jedno mluvení (sezení) jednoho admina. Kousky se lepí do MediaSource, ať
 * hraje skoro živě; kde MediaSource s Opusem není (Safari), se kousky
 * posbírají a přehrají naráz po konci — jako vysílačka.
 */
class Prehravani {
  readonly #audio = new Audio();
  readonly #fronta: Uint8Array[] = [];
  #zdroj: MediaSource | null = null;
  #buffer: SourceBuffer | null = null;
  #konec = false;
  #cekaPoradi = 0;
  readonly #odlozene = new Map<number, HlasUdalost>();
  readonly #mime: string;
  readonly #zive: boolean;

  constructor(mime: string) {
    this.#mime = mime;
    this.#audio.volume = Math.min(1, Math.max(0, hlasitost() / 100));
    this.#zive = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported(mime);
    if (this.#zive) {
      this.#zdroj = new MediaSource();
      this.#audio.src = URL.createObjectURL(this.#zdroj);
      this.#zdroj.addEventListener("sourceopen", () => {
        if (!this.#zdroj || this.#buffer) return;
        this.#buffer = this.#zdroj.addSourceBuffer(mime);
        this.#buffer.addEventListener("updateend", () => this.#dalsi());
        this.#dalsi();
      });
      void this.#audio.play()?.catch(() => {});
    }
  }

  /** Kousky můžou dorazit přeházené (každý je vlastní POST) — lepí se v pořadí. */
  prijmi(u: HlasUdalost): void {
    this.#odlozene.set(u.poradi, u);
    for (;;) {
      const dalsi = this.#odlozene.get(this.#cekaPoradi);
      if (!dalsi) break;
      this.#odlozene.delete(this.#cekaPoradi);
      this.#cekaPoradi++;
      if (dalsi.data) this.#fronta.push(dekoduj(dalsi.data));
      if (dalsi.konec) this.#konec = true;
    }
    if (this.#zive) this.#dalsi();
    else if (this.#konec) this.#prehrajNaraz();
  }

  #dalsi(): void {
    const b = this.#buffer;
    if (!b || b.updating) return;
    const kousek = this.#fronta.shift();
    if (kousek) {
      try {
        b.appendBuffer(kousek as BufferSource);
      } catch {
        // Rozbitý kousek — zbytek sezení se vzdá, ať to nekřičí do konzole.
        this.#fronta.length = 0;
      }
      return;
    }
    if (this.#konec && this.#zdroj?.readyState === "open") {
      try {
        this.#zdroj.endOfStream();
      } catch {
        // Už zavřeno — nevadí.
      }
    }
  }

  #prehrajNaraz(): void {
    if (this.#fronta.length === 0) return;
    const blob = new Blob(this.#fronta.splice(0) as BlobPart[], { type: this.#mime });
    this.#audio.src = URL.createObjectURL(blob);
    void this.#audio.play()?.catch(() => {});
  }

  hotovo(): boolean {
    return this.#konec && this.#fronta.length === 0 && this.#odlozene.size === 0;
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
      p = new Prehravani(u.mime ?? MIME_HLASU);
      sezeni.set(klic, p);
    }
    p.prijmi(u);
    if (p.hotovo()) setTimeout(() => sezeni.delete(klic), 60_000);
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
        proud = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch {
        onChyba?.("Mikrofon se nepodařilo otevřít — povol ho stránce v prohlížeči.");
        return;
      }
      const mime = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(MIME_HLASU) ? MIME_HLASU : undefined;
      rekorder = mime ? new MediaRecorder(proud, { mimeType: mime, audioBitsPerSecond: 32_000 }) : new MediaRecorder(proud);
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
      proud?.getTracks().forEach((t) => t.stop());
      proud = null;
    },
    get bezi(): boolean {
      return rekorder !== null;
    },
  };
}
