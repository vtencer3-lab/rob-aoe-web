import { useLayoutEffect, useRef, useState, type RefObject } from "react";

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

/** Rozbalí prvek: výška z nuly na přirozenou, obsah se přitom prolne. */
export function rozbal(el: HTMLElement, potom?: () => void): void {
  el.style.overflow = "hidden";
  animuj(el, [{ height: "0px", opacity: 0 }, { height: `${el.scrollHeight}px`, opacity: 1 }], { ms: trvani("--prechod-skladani"), krivka: krivka() }, () => {
    el.style.overflow = "";
    potom?.();
  });
}

/**
 * Sbalí prvek na nulovou výšku a pak zavolá `potom` (to má prvek zavřít nebo
 * odpojit). Sbalený konec drží, dokud volající nezavolá vrácený úklid —
 * jinak by se obsah mezi koncem animace a překreslením Reactu na jeden
 * snímek vrátil v plné výšce.
 */
export function sbal(el: HTMLElement, potom: () => void): () => void {
  el.style.overflow = "hidden";
  const animace = animuj(el, [{ height: `${el.scrollHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], { ms: trvani("--prechod-skladani"), krivka: krivka(), drzet: true }, potom);
  return () => {
    animace?.cancel();
    el.style.overflow = "";
  };
}

/**
 * Plynulé rozbalení a sbalení bloku, jehož stav drží volající (`otevreno`,
 * `onPrepnout`): při otevření se stav přepne hned a tělo dojede na svou
 * výšku, při zavření tělo napřed sjede na nulu a stav se přepne až potom —
 * volající tak smí zavřený obsah vůbec nevykreslit. Během sbalování je
 * `zavira` pravda: blok je ještě otevřený, ale šipka v hlavičce se má točit
 * zpátky už s tělem, ne až po něm. Kliknutí během rozjetého pohybu se
 * nepočítá.
 */
export function useSbalovani<T extends HTMLElement>(otevreno: boolean, onPrepnout: (otevreno: boolean) => void): { telo: RefObject<T | null>; prepni: () => void; bezi: () => boolean; zavira: boolean } {
  const telo = useRef<T>(null);
  const stav = useRef<{ bezi: boolean; rozbalit: boolean; uklid: (() => void) | null }>({ bezi: false, rozbalit: false, uklid: null });
  const [zavira, setZavira] = useState(false);
  useLayoutEffect(() => {
    const s = stav.current;
    if (!otevreno) {
      s.uklid?.();
      s.uklid = null;
      setZavira(false);
      return;
    }
    if (!s.rozbalit) return;
    s.rozbalit = false;
    const el = telo.current;
    if (!el) return;
    s.bezi = true;
    rozbal(el, () => {
      s.bezi = false;
    });
  }, [otevreno]);
  const prepni = () => {
    const s = stav.current;
    if (s.bezi) return;
    if (!otevreno) {
      s.rozbalit = true;
      onPrepnout(true);
      return;
    }
    const el = telo.current;
    if (!el) {
      onPrepnout(false);
      return;
    }
    s.bezi = true;
    setZavira(true);
    s.uklid = sbal(el, () => {
      s.bezi = false;
      onPrepnout(false);
    });
  };
  return { telo, prepni, bezi: () => stav.current.bezi, zavira };
}

/** Třída stínu pod modálním oknem; sdílejí ji všechna okna webu (styl.css). */
const STIN_OKNA = "prelobby-stin";

/**
 * Dojezd zavíraného okna. Okna se kreslí podmíněně (`{otevreno ? <Okno />
 * : null}`), takže je React při zavření odebere z DOM naráz a CSS nemá co
 * animovat. Hlídač proto odebraný stín s oknem vrátí zpátky jako neživou
 * kulisu (`inert`, bez kliknutí, mimo čtečky), CSS mu podle třídy `zavira`
 * přehraje zavření a časovač ho odklidí. Jednotlivá okna o tom nevědí —
 * stačí, že stojí na `.prelobby-stin`.
 *
 * Odebráním z DOM prvky ztrácejí odrolování (seznam map, dlouhý formulář),
 * a kulisa by při mizení skočila na začátek; poslední polohy se proto
 * průběžně zapisují a po vrácení obnoví.
 *
 * Volá se jednou při startu aplikace (main.tsx); vrací úklid.
 */
export function sledujZaviraniOken(): () => void {
  if (typeof MutationObserver !== "function") return () => {};
  const odrolovano = new WeakMap<Element, number>();
  const zapisOdrolovani = (e: Event) => {
    const cil = e.target;
    if (cil instanceof Element && cil.closest(`.${STIN_OKNA}`)) odrolovano.set(cil, cil.scrollTop);
  };
  document.addEventListener("scroll", zapisOdrolovani, true);
  const hlidac = new MutationObserver((zaznamy) => {
    const ms = trvani("--prechod");
    if (ms <= 0) return;
    for (const zaznam of zaznamy) {
      for (const uzel of zaznam.removedNodes) {
        if (!(uzel instanceof HTMLElement) || !uzel.classList.contains(STIN_OKNA) || uzel.classList.contains("zavira") || uzel.isConnected) continue;
        uzel.classList.add("zavira");
        uzel.setAttribute("inert", "");
        uzel.setAttribute("aria-hidden", "true");
        document.body.appendChild(uzel);
        for (const prvek of uzel.querySelectorAll("*")) {
          const top = odrolovano.get(prvek);
          if (top) prvek.scrollTop = top;
        }
        setTimeout(() => uzel.remove(), ms);
      }
    }
  });
  hlidac.observe(document.body, { childList: true });
  return () => {
    hlidac.disconnect();
    document.removeEventListener("scroll", zapisOdrolovani, true);
  };
}
