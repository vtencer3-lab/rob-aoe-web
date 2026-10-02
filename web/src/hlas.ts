import { ZESILENI_MAX, ZESILENI_MIN, orizniZesileni } from "../../src/shared/hlas.js";
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
// Rozsah (100–400 %) je sdílený se serverem, viz src/shared/hlas.ts.
export { ZESILENI_MAX, ZESILENI_MIN };
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

/** Do téhle úrovně (z plného rozsahu 1) křivka omezení signál nemění vůbec. */
const KOLENO = 0.6;
/** Kolikanásobek plného rozsahu křivka pokrývá: nejvyšší zesílení. */
const ROZSAH_KRIVKY = ZESILENI_MAX / 100;

/**
 * Měkké omezení zesíleného hlasu. Vstup křivky je vzorek po zesílení dělený
 * `ROZSAH_KRIVKY` (WaveShaper bere jen −1…1, zesílený vzorek může být až 4).
 * Do kolena je křivka přímka se sklonem 1 — „150 %“ je opravdu 1,5×; nad
 * kolenem se plynule (tanh) ohýbá k 1 a nikdy ji nepřekročí.
 *
 * Původní křivka `tanh(1,6·x)` přímku neměla: už u tichého signálu násobila
 * 1,74× (z „150 %“ dělala 2,6×, měřeno 2. 10. 2026) a vzorky nad 1 usekla
 * natvrdo. Kompresor (`DynamicsCompressor`) tu ještě dřív lupal — má náběh
 * (attack), první milisekundy hlasité slabiky projdou nezkrácené (uživatel
 * 16. 9. 2026). Křivka náběh nemá, ohne každý vzorek hned.
 */
export function krivkaOmezeni(delka = 4097): Float32Array<ArrayBuffer> {
  const k = new Float32Array(new ArrayBuffer(delka * Float32Array.BYTES_PER_ELEMENT));
  for (let i = 0; i < delka; i++) {
    const x = ((i / (delka - 1)) * 2 - 1) * ROZSAH_KRIVKY;
    const a = Math.abs(x);
    k[i] = Math.sign(x) * (a <= KOLENO ? a : KOLENO + (1 - KOLENO) * Math.tanh((a - KOLENO) / (1 - KOLENO)));
  }
  return k;
}

/** Jeden kontext Web Audia pro zesílené přehrávání na celou stránku. */
let kontextPrehravani: AudioContext | null = null;

/**
 * Zesílí přehrávání prvku podle nastavení mluvčího (uživatel 15. 9. 2026:
 * „možnost boostnout svůj mikrofon“): prvek → zisk → měkké omezení → výstup.
 * Při 100 % nebo bez Web Audia se nic nezapojuje a prvek hraje přímo.
 *
 * Zesiluje se **u posluchače, ne při nahrávání** (od 2. 10. 2026). Nahrávka
 * vedená přes Web Audio (`MediaStreamDestination`) dostávala od Chrome
 * časové značky rámců střídavě po 59 a 61 ms místo 60 (rámec Opusu má 2880
 * vzorků, blok Web Audia 128, takže hranice rámce nepadá na hranici bloku)
 * a přehrávač v `MediaSource` pak každý druhý rámec o milisekundu ořízl —
 * osm lupnutí za vteřinu po celou dobu řeči. Mikrofon nahraný napřímo má
 * značky přesně po 60 ms. Měření: docs/know-how/push-to-talk.md.
 *
 * Kontext, kterému prohlížeč nedovolil běžet (stránka bez jediného kliknutí),
 * by prvek umlčel úplně; proto se zapojuje, až když opravdu běží — do té
 * doby hraje prvek přímo, jen nezesílený.
 *
 * Vrací **odpojení**: kontext je jeden na celou stránku a každá zesílená
 * promluva do něj přidá tři uzly. Bez odpojení po dohrání by v něm zůstaly
 * viset všechny promluvy večera i se svými prvky `<audio>`.
 */
export function zesilPrehravani(audio: HTMLMediaElement, procent: number): () => void {
  const nic = () => {};
  const Kontext = typeof window === "undefined" ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (procent <= ZESILENI_MIN || !Kontext) return nic;
  try {
    kontextPrehravani ??= new Kontext();
  } catch {
    return nic;
  }
  const kontext = kontextPrehravani;
  const uzly: AudioNode[] = [];
  let odpojeno = false;
  const zapoj = () => {
    // Promluva mohla skončit dřív, než prohlížeč kontext pustil.
    if (odpojeno || kontext.state !== "running") return;
    try {
      const zisk = kontext.createGain();
      zisk.gain.value = orizniZesileni(procent) / 100 / ROZSAH_KRIVKY;
      const omezeni = kontext.createWaveShaper();
      omezeni.curve = krivkaOmezeni();
      omezeni.oversample = "4x";
      const zdroj = kontext.createMediaElementSource(audio);
      uzly.push(zdroj, zisk, omezeni);
      zdroj.connect(zisk).connect(omezeni).connect(kontext.destination);
    } catch {
      // Prvek už zapojený jinde nebo Web Audio selhalo — hraje nezesílený.
    }
  };
  if (kontext.state === "running") zapoj();
  else void kontext.resume().then(zapoj, () => {});
  return () => {
    odpojeno = true;
    for (const uzel of uzly.splice(0)) {
      try {
        uzel.disconnect();
      } catch {
        // Už odpojený — nevadí.
      }
    }
  };
}

/**
 * Zkouška mikrofonu (uživatel 16. 9. 2026, ať jde zesílení nastavit bez
 * druhého člověka): pár vteřin se nahraje stejně jako push-to-talk a vrátí
 * se adresa nahrávky. Volající ji přehraje přes `zesilPrehravani` — tak
 * jako posluchači — a pak uvolní (`URL.revokeObjectURL`).
 */
export async function nahrajZkousku(ms = 3_000): Promise<string> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    throw new Error("Tenhle prohlížeč nahrávání z mikrofonu neumí.");
  }
  const proud = await navigator.mediaDevices.getUserMedia(MIKROFON);
  const rekorder = novyRekorder(proud);
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
  proud.getTracks().forEach((t) => t.stop());
  return URL.createObjectURL(new Blob(kusy, { type: rekorder.mimeType || MIME_HLASU }));
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
/** Pod kolik ms musí zásoba klesnout, aby `waiting` znamenalo, že opravdu došla. */
const DOSLO_MS = 100;
/**
 * Jak dlouho se čeká na kousek, který nedorazil, než se přeskočí. Krátce:
 * mluvčí posílá kousky jeden po druhém, takže když dorazil následující,
 * ten před ním už nepřijde (odeslání selhalo i napodruhé) — čekání jen
 * prodlužuje ticho.
 */
export const PRESKOK_MS = 500;
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
  /** Odpojení zesílení z kontextu Web Audia (viz `zesilPrehravani`). */
  readonly #odpojZesileni: () => void;
  /** Adresa objektu (MediaSource nebo Blob) v `src` prvku — po dohrání se uvolní. */
  #adresa: string | null = null;
  readonly #mime: string;
  readonly #zive: boolean;
  readonly #onZavreno: () => void;

  constructor(mime: string, zesileni: number, onZavreno: () => void) {
    this.#mime = mime;
    this.#onZavreno = onZavreno;
    // Naplno, nezávisle na Master Volume — viz hlasitostAdmina().
    this.#audio.volume = Math.min(1, Math.max(0, hlasitostAdmina() / 100));
    this.#audio.addEventListener("ended", () => this.#zavri());
    this.#odpojZesileni = zesilPrehravani(this.#audio, zesileni);
    this.#zive = typeof MediaSource !== "undefined" && typeof MediaSource.isTypeSupported === "function" && MediaSource.isTypeSupported(mime);
    if (this.#zive) {
      this.#zdroj = new MediaSource();
      this.#adresa = URL.createObjectURL(this.#zdroj);
      this.#audio.src = this.#adresa;
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
      // `waiting` ale Chrome občas ohlásí i hned po `play()`, když zásoba
      // je a jen se rozbíhá — to zádrhel není a zastavení by hlas zdrželo.
      this.#audio.addEventListener("waiting", () => {
        if (!this.#hraje || this.#konec || this.#zasobaMs() >= DOSLO_MS) return;
        this.#hraje = false;
        this.#audio.pause();
      });
    }
  }

  /** Kousky můžou dorazit přeházené (každý je vlastní POST) — lepí se v pořadí. */
  prijmi(u: HlasUdalost): void {
    // Opozdilec po přeskočení nebo dvojí doručení: už se k němu nevrací.
    // Totéž po konci promluvy (značka konce, nebo dotažení po tichu) —
    // kousek přilepený za uzavřený proud by přehrávání otevřel znovu.
    if (this.#zavreno || this.#konec || u.poradi < this.#cekaPoradi) return;
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
        // Mezitím dohráno jinudy (ticho ze sítě): není co přeskakovat a
        // minimum z ničeho by pořadí rozbilo.
        if (this.#odlozene.size === 0) return;
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
    // Odložené kousky se dohrají teď všechny; časovač přeskoku by je za
    // chvíli zkoušel zpracovat podruhé nad uzavřeným sezením.
    if (this.#preskok) clearTimeout(this.#preskok);
    this.#preskok = null;
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
    this.#adresa = URL.createObjectURL(blob);
    this.#audio.src = this.#adresa;
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
    // Úklid po promluvě: jinak by každá nechala v kontextu Web Audia své
    // uzly, v paměti prvek se zdrojem a neuvolněnou adresu objektu — za
    // večer jich jsou stovky.
    try {
      this.#audio.pause();
      this.#odpojZesileni();
      if (this.#adresa !== null) {
        URL.revokeObjectURL(this.#adresa);
        this.#adresa = null;
      }
      this.#audio.removeAttribute("src");
    } finally {
      // Štítek „mluví“ musí zmizet, i kdyby úklid selhal.
      this.#onZavreno();
    }
  }
}

/** Kdo je právě slyšet: jedna přehrávaná promluva. */
export interface Mluvci {
  /** Mluvčí a sezení — klíč pro seznam. */
  klic: string;
  kdo: string;
  jmeno: string;
  zapasId: number;
}

// Seznam se vyměňuje celý (ne mění na místě), ať ho React pozná jako nový
// snímek (useSyncExternalStore ve views/MluviTed.tsx).
let mluvici: readonly Mluvci[] = [];
const odberateleMluvcich = new Set<() => void>();

function nastavMluvici(nove: readonly Mluvci[]): void {
  mluvici = nove;
  for (const cb of odberateleMluvcich) cb();
}

/** Promluvy, které se právě přehrávají — ať je vidět, kdo mluví. */
export function kdoMluvi(): readonly Mluvci[] {
  return mluvici;
}

export function naZmenuMluvcich(cb: () => void): () => void {
  odberateleMluvcich.add(cb);
  return () => {
    odberateleMluvcich.delete(cb);
  };
}

/**
 * Přehrávač hlasu pro celou stránku: poslouchá kousky ze streamu a hraje je.
 * Vlastní hlas se nehraje (server ho ani neposílá), a admin si může ostatní
 * adminy ztlumit. Vrací odhlášení.
 */
export function spustPrehravacHlasu(ja: string, jaAdmin: boolean): () => void {
  const sezeni = new Map<string, Prehravani>();
  const moji = new Set<string>();
  const umlkl = (klic: string) => {
    if (moji.delete(klic)) nastavMluvici(mluvici.filter((m) => m.klic !== klic));
  };
  const naHlas = (e: Event) => {
    const u = (e as CustomEvent<HlasUdalost>).detail;
    if (!u || u.kdo === ja) return;
    // Ztlumení ostatních adminů: jen admin, jen cizí admini — hráči ho slyší
    // vždy, a mluvčího, kterého pustil mód (GM), neztlumí ani admin.
    if (jaAdmin && ztlumitAdminy() && u.jeAdmin !== false && !u.prijemci.includes(ja)) return;
    const klic = `${u.kdo}/${u.sezeni}`;
    let p = sezeni.get(klic);
    if (!p) {
      p = new Prehravani(u.mime ?? MIME_HLASU, orizniZesileni(u.zesileni), () => {
        umlkl(klic);
        // Dohrané sezení zůstane ještě minutu v mapě, ať opožděný kousek
        // nezaloží nové přehrávání téže promluvy.
        setTimeout(() => sezeni.delete(klic), 60_000);
      });
      sezeni.set(klic, p);
      moji.add(klic);
      nastavMluvici([...mluvici, { klic, kdo: u.kdo, jmeno: u.jmeno, zapasId: u.zapasId }]);
    }
    p.prijmi(u);
  };
  window.addEventListener(UDALOST_HLAS, naHlas);
  return () => {
    window.removeEventListener(UDALOST_HLAS, naHlas);
    for (const klic of [...moji]) umlkl(klic);
  };
}

/** Jak kousky odcházejí na server; vrací se jako slib, ať jde držet pořadí. */
export type OdesliKousek = (telo: { sezeni: string; poradi: number; konec?: boolean; data?: string; mime?: string; zesileni?: number }) => Promise<unknown>;

/**
 * Mikrofon bez automatického řízení hlasitosti: to by se pralo se zesílením
 * mluvčího (zvedne šum, pak škubne dolů). Potlačení ozvěny a šumu zůstává.
 */
const MIKROFON: MediaStreamConstraints = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: false } };

/** Rekordér hlasu: Opus ve WebM, kde ho prohlížeč umí; 64 kb/s (32 chrastilo). */
function novyRekorder(proud: MediaStream): MediaRecorder {
  const umi = typeof MediaRecorder.isTypeSupported === "function" && MediaRecorder.isTypeSupported(MIME_HLASU);
  return umi ? new MediaRecorder(proud, { mimeType: MIME_HLASU, audioBitsPerSecond: 64_000 }) : new MediaRecorder(proud);
}

async function doB64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Za jak dlouho se kousek, který neprošel sítí, zkusí poslat podruhé. */
const OPAKOVANI_MS = 150;

/**
 * Nahrávání z mikrofonu po kouscích. `spust()` si řekne o mikrofon (napoprvé
 * se prohlížeč zeptá) a začne posílat; `zastav()` pošle poslední kousek
 * a značku konce a mikrofon zase pustí, ať v kartě nesvítí nahrávání.
 * Kousky se posílají za sebou (další čeká na předchozí), ať dorazí v pořadí.
 *
 * Nahrává se **přímo z mikrofonu**; zesílení mluvčího jde jen jako údaj
 * u kousku a zesiluje se až při přehrávání (`zesilPrehravani` říká proč).
 */
export function vytvorNahravani(odesli: OdesliKousek, onChyba?: (zprava: string) => void) {
  let rekorder: MediaRecorder | null = null;
  let proud: MediaStream | null = null;
  let fronta: Promise<unknown> = Promise.resolve();
  let sezeni = "";
  let poradi = 0;
  let ohlaseno = false;

  const posli = (telo: () => Promise<Parameters<OdesliKousek>[0]>) => {
    fronta = fronta
      .then(async () => {
        const t = await telo();
        try {
          await odesli(t);
        } catch (e) {
          // Výpadek sítě (fetch hází TypeError) se zkusí ještě jednou — jinak
          // by posluchačům v řeči zůstala díra. Odmítnutí serverem se neopakuje.
          if (!(e instanceof TypeError)) throw e;
          await new Promise((dal) => setTimeout(dal, OPAKOVANI_MS));
          await odesli(t);
        }
      })
      .catch((e: unknown) => {
        // Jednou za promluvu: mluvčí má vědět, že ho neslyší.
        if (ohlaseno) return;
        ohlaseno = true;
        onChyba?.(e instanceof Error && !(e instanceof TypeError) ? e.message : "Hlas se nepodařilo odeslat — zkontroluj připojení.");
      });
  };

  return {
    async spust(): Promise<void> {
      if (rekorder) return;
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        onChyba?.("Tenhle prohlížeč nahrávání z mikrofonu neumí.");
        return;
      }
      try {
        proud = await navigator.mediaDevices.getUserMedia(MIKROFON);
      } catch {
        onChyba?.("Mikrofon se nepodařilo otevřít — povol ho stránce v prohlížeči.");
        return;
      }
      rekorder = novyRekorder(proud);
      sezeni = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      poradi = 0;
      ohlaseno = false;
      const s = sezeni;
      const mime = rekorder.mimeType || MIME_HLASU;
      // Zesílení se čte až tady, ať změna v nastavení platí od dalšího stisku.
      const procent = zesileniMikrofonu();
      const zesileni = procent > ZESILENI_MIN ? { zesileni: procent } : {};
      rekorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size === 0) return;
        const moje = poradi++;
        posli(async () => ({ sezeni: s, poradi: moje, data: await doB64(e.data), mime, ...zesileni }));
      };
      rekorder.onstop = () => {
        const moje = poradi++;
        posli(async () => ({ sezeni: s, poradi: moje, konec: true, mime }));
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
