/**
 * Hlasitost zvuků webu, 0–100. „Master Volume“ (výchozí 70) je strop pro
 * všechno; jednotlivé události mají vlastní podíl z něj — zatím chat
 * (výchozí 50), takže 70 % × 50 % = 35 % (uživatel 13. 9. 2026). Každá další
 * událost se má odvozovat stejně: `hlasitost() * podil / 100`.
 */
const KLIC_HLASITOSTI = "zvuk.hlasitost";
const KLIC_HLASITOSTI_CHATU = "zvuk.hlasitost-chat";
export const VYCHOZI_HLASITOST = 70;
export const VYCHOZI_HLASITOST_CHATU = 50;

function nactiProcenta(klic: string, vychozi: number): number {
  try {
    const ulozeno = localStorage.getItem(klic);
    const cislo = ulozeno === null ? NaN : Number(ulozeno);
    return Number.isFinite(cislo) ? Math.min(100, Math.max(0, cislo)) : vychozi;
  } catch {
    return vychozi;
  }
}

function ulozProcenta(klic: string, procent: number): void {
  try {
    localStorage.setItem(klic, String(Math.min(100, Math.max(0, Math.round(procent)))));
  } catch {
    // Bez úložiště platí do obnovení stránky jen výchozí.
  }
}

/** Master Volume, 0–100. */
export function hlasitost(): number {
  return nactiProcenta(KLIC_HLASITOSTI, VYCHOZI_HLASITOST);
}

export function nastavHlasitost(procent: number): void {
  ulozProcenta(KLIC_HLASITOSTI, procent);
}

/** Podíl chatu z Master Volume, 0–100. */
export function hlasitostChatu(): number {
  return nactiProcenta(KLIC_HLASITOSTI_CHATU, VYCHOZI_HLASITOST_CHATU);
}

export function nastavHlasitostChatu(procent: number): void {
  ulozProcenta(KLIC_HLASITOSTI_CHATU, procent);
}

/** Výsledná hlasitost události: master × podíl (70 × 50 → 35). */
export function hlasitostUdalosti(podil: number, master = hlasitost()): number {
  return (master * podil) / 100;
}

/**
 * Přehraje zvuk a mlčí, když nejde.
 *
 * Prohlížeč umí odmítnout autoplay a `play()` nemusí vrátit slib vůbec
 * (jsdom v testech, starší Safari) — v obou případech je správná reakce
 * ticho, ne výjimka v obsluze kliknutí.
 */
export function prehraj(url: string, procent = hlasitost()): void {
  const audio = new Audio(url);
  audio.volume = Math.min(1, Math.max(0, procent / 100));
  const slib = audio.play() as Promise<void> | undefined;
  void slib?.catch((chyba: unknown) => {
    // Prohlížeč bez gesta uživatele zvuk nepustí (NotAllowedError) — třeba
    // spícímu hráči, který od načtení stránky nikam neklikl (13. 9. 2026:
    // super zvonek ukázal okno, ale poplach se neozval). Zvuk se odloží
    // a přehraje při prvním kliknutí nebo klávese; okno „tě shání!“ mezitím
    // řekne proč.
    if (!(chyba instanceof Error) || chyba.name !== "NotAllowedError") return;
    if (cekajici.length === 0) {
      window.addEventListener("pointerdown", prehrajCekajici);
      window.addEventListener("keydown", prehrajCekajici);
    }
    cekajici.push({ url, procent });
    oznam(true);
  });
}

const cekajici: { url: string; procent: number }[] = [];
const posluchaci = new Set<(zablokovano: boolean) => void>();

function oznam(zablokovano: boolean): void {
  for (const cb of posluchaci) cb(zablokovano);
}

function prehrajCekajici(): void {
  window.removeEventListener("pointerdown", prehrajCekajici);
  window.removeEventListener("keydown", prehrajCekajici);
  for (const { url, procent } of cekajici.splice(0)) {
    const audio = new Audio(url);
    audio.volume = Math.min(1, Math.max(0, procent / 100));
    void (audio.play() as Promise<void> | undefined)?.catch(() => {});
  }
  oznam(false);
}

/** Kdo chce vědět, že prohlížeč zvuk zadržel (a pak zase pustil). Vrací odhlášení. */
export function naZablokovaniZvuku(cb: (zablokovano: boolean) => void): () => void {
  posluchaci.add(cb);
  return () => {
    posluchaci.delete(cb);
  };
}
