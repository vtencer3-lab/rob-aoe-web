/**
 * Pohyb rozhraní řízený ze skriptu (docs/grafika.md „Pohyb“). Většinu
 * přechodů dělá samo CSS; sem patří jen to, co CSS neumí: výška na `auto`,
 * dvoufázové otočení karty, dojezd okna, které React už odpojil.
 *
 * Časy se nečtou z konstant, ale z proměnných v `:root` (styl.css), ať se
 * ladí na jednom místě. Při `prefers-reduced-motion: reduce` jsou tam nuly
 * a v testovacím DOM (jsdom) proměnné ani `Element.animate` nejsou — obojí
 * tady znamená „bez pohybu“: `potom` se zavolá hned a komponenta se chová
 * jako dřív. Žádná logika nečeká jen na událost animace: konec jistí časovač.
 */

/** Délka pohybu z proměnné `:root` v milisekundách; 0 = bez pohybu. */
export function trvani(promenna = "--prechod"): number {
  const text = getComputedStyle(document.documentElement).getPropertyValue(promenna).trim();
  const cislo = Number.parseFloat(text);
  if (!Number.isFinite(cislo) || cislo <= 0) return 0;
  return text.endsWith("ms") ? cislo : text.endsWith("s") ? cislo * 1000 : 0;
}

/** Časová křivka z proměnné `:root`; bez ní obyčejné `ease`. */
export function krivka(promenna = "--krivka"): string {
  return getComputedStyle(document.documentElement).getPropertyValue(promenna).trim() || "ease";
}

/** O kolik smí událost `finish` zaostat za délkou animace, než konec vynutí časovač. */
const REZERVA_MS = 120;

export interface VolbyPohybu {
  ms: number;
  krivka?: string;
  /** Koncový snímek zůstane stát, dokud se animace nezruší (`cancel`). */
  drzet?: boolean;
}

/**
 * Pustí animaci (Web Animations) a po ní právě jednou zavolá `potom`. Kde
 * pohyb není (nulová délka, prohlížeč bez `animate`), zavolá `potom` hned
 * a vrátí `null`. Událost `finish` se v záložce na pozadí opozdí, proto ji
 * jistí časovač — stav komponenty na ní nesmí viset.
 */
export function animuj(el: Element, snimky: Keyframe[], volby: VolbyPohybu, potom?: () => void): Animation | null {
  if (volby.ms <= 0 || typeof el.animate !== "function") {
    potom?.();
    return null;
  }
  let animace: Animation;
  try {
    animace = el.animate(snimky, { duration: volby.ms, easing: volby.krivka ?? "ease", fill: volby.drzet ? "forwards" : "none" });
  } catch {
    // Neplatná křivka z CSS nesmí shodit kliknutí — raději bez pohybu.
    potom?.();
    return null;
  }
  let hotovo = false;
  const dokonci = () => {
    if (hotovo) return;
    hotovo = true;
    clearTimeout(pojistka);
    potom?.();
  };
  const pojistka = setTimeout(dokonci, volby.ms + REZERVA_MS);
  animace.onfinish = dokonci;
  animace.oncancel = dokonci;
  return animace;
}
