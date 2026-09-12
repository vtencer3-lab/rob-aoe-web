/** Hlasitost zvuků webu, 0–100; výchozí 70 (přání uživatele). */
const KLIC_HLASITOSTI = "zvuk.hlasitost";
export const VYCHOZI_HLASITOST = 70;

export function hlasitost(): number {
  try {
    const ulozeno = localStorage.getItem(KLIC_HLASITOSTI);
    const cislo = ulozeno === null ? NaN : Number(ulozeno);
    return Number.isFinite(cislo) ? Math.min(100, Math.max(0, cislo)) : VYCHOZI_HLASITOST;
  } catch {
    return VYCHOZI_HLASITOST;
  }
}

export function nastavHlasitost(procent: number): void {
  try {
    localStorage.setItem(KLIC_HLASITOSTI, String(Math.min(100, Math.max(0, Math.round(procent)))));
  } catch {
    // Bez úložiště platí do obnovení stránky jen výchozí.
  }
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
  void slib?.catch(() => {});
}
