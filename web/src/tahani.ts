import { useLayoutEffect, useRef, type DragEvent, type PointerEvent } from "react";
import type { Skupina } from "./skladani.js";

/** Jak dlouho se ostatní řádky posouvají na nové místo. */
export const DOBA_POSUNU_MS = 150;

interface Tazeny {
  steamId: string;
  skupina: Skupina;
  el: HTMLElement;
  pointerId: number;
  /** clientY, u kterého má řádek posun 0 — po přeskládání se přepočítá. */
  vychoziY: number;
  posledniY: number;
}

/** Interaktivní prvky uvnitř řádku, ze kterých se tažení nezačíná. */
const NETAHAT = "button, a, input, select, textarea, [role='listbox'], [role='option'], .vyber-civ";

/**
 * Přetahování řádků v rámci jedné skupiny (vybraní, nebo nevybraní).
 *
 * Táhne se pointer událostmi: řádek, na který se klikne, se „vezme do ruky“
 * (třída `v-ruce`, jede s kurzorem), a jakmile kurzor přejede střed souseda,
 * pořadí se prohodí hned — ostatní řádky se na nové místo plynule posunou
 * (FLIP: změřit polohu před a po překreslení a rozdíl odanimovat). Nativní
 * drag & drop dělal jen průhledného ducha a přeskládal až po puštění.
 *
 * HTML5 události (dragstart/dragover/drop) zůstávají jako záloha pro
 * prohlížeče bez pointer událostí a pro testy v jsdom, které pointer
 * geometrii neumí.
 */
export function useTahani(presun: (skupina: Skupina, odId: string, naId: string) => void) {
  const tazenyHtml5 = useRef<{ steamId: string; skupina: Skupina } | null>(null);
  const tazeny = useRef<Tazeny | null>(null);
  const prvky = useRef(new Map<string, HTMLElement>());
  const predchoziTop = useRef(new Map<string, number>());

  // FLIP: po každém překreslení porovnat, kde řádky byly a kde jsou, a
  // rozdíl odanimovat. Tažený řádek se neanimuje — jen se mu přepočítá
  // výchozí bod, aby zůstal pod kurzorem.
  useLayoutEffect(() => {
    const t = tazeny.current;
    const nove = new Map<string, number>();
    for (const [id, el] of prvky.current) {
      if (!el.isConnected) continue;
      const jeTazeny = t?.el === el;
      const puvodniTransform = el.style.transform;
      if (jeTazeny) el.style.transform = "";
      const top = el.getBoundingClientRect().top;
      if (jeTazeny) el.style.transform = puvodniTransform;
      nove.set(id, top);
      const drive = predchoziTop.current.get(id);
      if (drive === undefined || drive === top) continue;
      if (jeTazeny && t) {
        t.vychoziY += top - drive;
        el.style.transform = `translateY(${t.posledniY - t.vychoziY}px)`;
        continue;
      }
      el.style.transition = "none";
      el.style.transform = `translateY(${drive - top}px)`;
      void el.offsetHeight; // reflow, ať se výchozí poloha opravdu použije
      el.style.transition = `transform ${DOBA_POSUNU_MS}ms ease`;
      el.style.transform = "";
      el.addEventListener("transitionend", () => {
        el.style.transition = "";
      }, { once: true });
    }
    predchoziTop.current = nove;
  });

  const poloz = (e: PointerEvent<HTMLElement>) => {
    const t = tazeny.current;
    if (!t || t.el !== e.currentTarget) return;
    tazeny.current = null;
    t.el.classList.remove("v-ruce");
    t.el.style.transition = `transform ${DOBA_POSUNU_MS}ms ease`;
    t.el.style.transform = "";
    t.el.addEventListener("transitionend", () => {
      t.el.style.transition = "";
    }, { once: true });
    try {
      t.el.releasePointerCapture(t.pointerId);
    } catch {
      // Kurzor už zachycený nebyl (jsdom, nebo prohlížeč po pointercancel).
    }
  };

  return (skupina: Skupina, steamId: string) => ({
    ref: (el: HTMLElement | null) => {
      if (el) prvky.current.set(steamId, el);
      else prvky.current.delete(steamId);
    },
    "data-tah-id": steamId,
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      // jsdom pointer událostem tlačítko nedává — chybějící bereme jako levé.
      if ((e.button ?? 0) !== 0 || (e.target as HTMLElement).closest(NETAHAT)) return;
      const el = e.currentTarget;
      tazeny.current = { steamId, skupina, el, pointerId: e.pointerId, vychoziY: e.clientY, posledniY: e.clientY };
      el.classList.add("v-ruce");
      el.style.transition = "none";
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // jsdom setPointerCapture neumí; tažení pak funguje jen přes HTML5 události.
      }
      e.preventDefault();
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const t = tazeny.current;
      if (!t || t.el !== e.currentTarget) return;
      t.posledniY = e.clientY;
      t.el.style.transform = `translateY(${e.clientY - t.vychoziY}px)`;
      // Přejel kurzor střed souseda? Pak si s ním prohodit místo.
      const rodic = t.el.parentElement;
      if (!rodic) return;
      const sourozenci = Array.from(rodic.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c !== t.el && c.hasAttribute("data-tah-id"));
      for (const s of sourozenci) {
        const r = s.getBoundingClientRect();
        if (r.height === 0) continue;
        const stred = r.top + r.height / 2;
        const sousedJePred = Boolean(s.compareDocumentPosition(t.el) & Node.DOCUMENT_POSITION_FOLLOWING);
        if ((sousedJePred && e.clientY < stred) || (!sousedJePred && e.clientY > stred)) {
          presun(skupina, t.steamId, s.dataset["tahId"]!);
          break;
        }
      }
    },
    onPointerUp: poloz,
    onPointerCancel: poloz,

    // Záloha: HTML5 drag & drop (testy, prohlížeče bez pointer událostí).
    onDragStart: () => {
      tazenyHtml5.current = { steamId, skupina };
    },
    onDragOver: (e: DragEvent) => {
      // Přetahovat jde jen v rámci skupiny; cizí tažení se nepřijme.
      if (tazenyHtml5.current?.skupina === skupina) e.preventDefault();
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (tazenyHtml5.current?.skupina === skupina) presun(skupina, tazenyHtml5.current.steamId, steamId);
      tazenyHtml5.current = null;
    },
    onDragEnd: () => {
      tazenyHtml5.current = null;
    },
  });
}
