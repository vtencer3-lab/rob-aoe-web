import { vi } from "vitest";

/** Jedna puštěná animace v podvrženém prohlížeči. */
export interface PodvrzenaAnimace {
  el: Element;
  snimky: Keyframe[];
  volby: KeyframeAnimationOptions;
  zrusena: boolean;
  /** Pošle `finish`, jako když animace dojede. */
  dokonci: () => void;
}

export interface PodvrzenyPohyb {
  animace: PodvrzenaAnimace[];
  uklid: () => void;
}

/**
 * Testovací DOM (jsdom) pohyb nezná: nemá styly s proměnnými `:root` ani
 * `Element.animate`. Pro testy komponent, které se ze skriptu hýbou
 * (`pohyb.ts`), se obojí podvrhne — proměnné jako styl kořene, `animate`
 * jako záznam, který test dokončí sám (`dokonci`) nebo nechá na časovači.
 */
export function podvrhniPohyb(promenne: Record<string, string>): PodvrzenyPohyb {
  const koren = document.documentElement;
  for (const [nazev, hodnota] of Object.entries(promenne)) koren.style.setProperty(nazev, hodnota);
  const animace: PodvrzenaAnimace[] = [];
  const puvodni = Object.getOwnPropertyDescriptor(Element.prototype, "animate");
  Element.prototype.animate = vi.fn(function (this: Element, snimky: Keyframe[], volby: KeyframeAnimationOptions) {
    const zaznam: PodvrzenaAnimace = { el: this, snimky, volby, zrusena: false, dokonci: () => objekt.onfinish?.call(objekt, new Event("finish") as AnimationPlaybackEvent) };
    const objekt = {
      onfinish: null as Animation["onfinish"],
      oncancel: null as Animation["oncancel"],
      cancel() {
        zaznam.zrusena = true;
        objekt.oncancel?.call(objekt as unknown as Animation, new Event("cancel") as AnimationPlaybackEvent);
      },
    } as unknown as Animation;
    animace.push(zaznam);
    return objekt;
  }) as unknown as Element["animate"];
  return {
    animace,
    uklid: () => {
      for (const nazev of Object.keys(promenne)) koren.style.removeProperty(nazev);
      if (puvodni) Object.defineProperty(Element.prototype, "animate", puvodni);
      else delete (Element.prototype as { animate?: unknown }).animate;
      animace.length = 0;
    },
  };
}
