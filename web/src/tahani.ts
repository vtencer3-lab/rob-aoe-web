import { useEffect, useLayoutEffect, useRef, type DragEvent, type PointerEvent } from "react";
import type { Skupina } from "./skladani.js";

/** Jak dlouho se ostatní řádky posouvají na nové místo. */
export const DOBA_POSUNU_MS = 150;

/**
 * Probíhá právě tažení? Po dobu tahu se pod kurzorem střídají řádky a jejich
 * najetí/odjetí by jinak zhasínalo a rozsvěcelo kartu se statistikami.
 * Komponenty se ptají tady a během tahu hover ignorují.
 */
/** Událost na window po konci tažení; `detail.prvek` je to, co je pod kurzorem. */
export const KONEC_TAHU = "tahani-konec";

/**
 * Po konci tažení: má karta se statistikami zůstat? Vrátí steamId jména,
 * nad kterým kurzor skončil, jinak null (karta se má schovat).
 */
/**
 * Čí jméno bylo pod kurzorem na konci tahu. `koren` omezí hledání na jeden
 * seznam: sestava i tabulka přihlášených značí jména stejným atributem, a bez
 * omezení si tabulka brala i jméno ze sestavy a ukázala kartu hráče, na
 * kterého se v ní nenajelo.
 */
export function jmenoPodKurzorem(e: Event, koren?: Element | null): string | null {
  const prvek = (e as CustomEvent<{ prvek: Element | null }>).detail?.prvek;
  const jmeno = prvek?.closest?.("[data-jmeno-hrace]");
  if (!(jmeno instanceof HTMLElement)) return null;
  if (koren && !koren.contains(jmeno)) return null;
  return jmeno.dataset["jmenoHrace"] ?? null;
}

export function tahneSe(): boolean {
  return typeof document !== "undefined" && document.body.classList.contains("tahne-se");
}

interface Tazeny {
  steamId: string;
  skupina: Skupina;
  el: HTMLElement;
  pointerId: number;
  posledniX: number;
  /** clientY, u kterého má řádek posun 0 — po přeskládání se přepočítá. */
  vychoziY: number;
  posledniY: number;
}

/**
 * Svislý posun z právě běžící animace (translateY v matici transformu).
 * Během FLIP přechodu je řádek opticky jinde, než kde v rozvržení sedí;
 * rozhodovat o prohození se musí podle rozvržení, jinak se při rychlém
 * tahu prohazuje tam a zpět a řádky se „rozletí“.
 */
function animovanyPosunY(el: HTMLElement): number {
  const t = getComputedStyle(el).transform;
  if (!t || t === "none") return 0;
  const m = /matrix\(([^)]+)\)/.exec(t);
  if (!m) return 0;
  const casti = m[1]!.split(",").map((x) => Number(x.trim()));
  return casti.length === 6 ? (casti[5] ?? 0) : 0;
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
  // Posluchače na window žijí přes překreslení; volají vždy aktuální presun.
  const presunRef = useRef(presun);
  presunRef.current = presun;
  const tazenyHtml5 = useRef<{ steamId: string; skupina: Skupina } | null>(null);
  const tazeny = useRef<Tazeny | null>(null);
  const prvky = useRef(new Map<string, HTMLElement>());
  const predchoziTop = useRef(new Map<string, number>());

  // FLIP: po každém překreslení porovnat, kde řádky byly a kde jsou, a
  // rozdíl odanimovat. Tažený řádek se neanimuje — jen se mu přepočítá
  // výchozí bod, aby zůstal pod kurzorem.
  //
  // Měří se vůči rodiči, ne vůči oknu: souřadnice vůči oknu se mění při
  // každém odrolování a první překreslení po něm (třeba najetí na jméno)
  // pak „animovalo“ celý seznam z místa, kde byl před rolováním. Animuje
  // se jen během tažení — jindy se poloha jen zapamatuje.
  useLayoutEffect(() => {
    const t = tazeny.current;
    const nove = new Map<string, number>();
    for (const [id, el] of prvky.current) {
      if (!el.isConnected || !el.parentElement) continue;
      const jeTazeny = t?.el === el;
      // Poloha v rozvržení, bez vlastního posunu: tažený řádek jede s kurzorem,
      // ostatní můžou být uprostřed animace. Kdyby se ta měřila, uložená poloha
      // by lhala a další překreslení by řádky poslalo o to dál.
      const top = el.getBoundingClientRect().top - animovanyPosunY(el) - el.parentElement.getBoundingClientRect().top;
      nove.set(id, top);
      const drive = predchoziTop.current.get(id);
      if (!t || drive === undefined || drive === top) continue;
      if (jeTazeny) {
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

  // Pohyb a puštění se poslouchají na window, ne na řádku: při přeskládání
  // React řádek v DOM přesune a prohlížeč mu tím vezme zachycení kurzoru,
  // takže tažení přes víc než jednu pozici se samo přerušilo.
  const posun = (e: globalThis.PointerEvent) => {
    const t = tazeny.current;
    if (!t) return;
    t.posledniY = e.clientY;
    t.posledniX = e.clientX;
    t.el.style.transform = `translateY(${e.clientY - t.vychoziY}px)`;
    // Přejel kurzor střed souseda? Pak si s ním prohodit místo.
    const rodic = t.el.parentElement;
    if (!rodic) return;
    const sourozenci = Array.from(rodic.children).filter((c): c is HTMLElement => c instanceof HTMLElement && c !== t.el && c.hasAttribute("data-tah-id"));
    for (const s of sourozenci) {
      const r = s.getBoundingClientRect();
      if (r.height === 0) continue;
      const stred = r.top - animovanyPosunY(s) + r.height / 2;
      const sousedJePred = Boolean(s.compareDocumentPosition(t.el) & Node.DOCUMENT_POSITION_FOLLOWING);
      if ((sousedJePred && e.clientY < stred) || (!sousedJePred && e.clientY > stred)) {
        presunRef.current(t.skupina, t.steamId, s.dataset["tahId"]!);
        break;
      }
    }
  };

  const poloz = () => {
    const t = tazeny.current;
    if (!t) return;
    tazeny.current = null;
    document.body.classList.remove("tahne-se");
    // Během tahu se najetí/odjetí ignorovalo; teď se řekne, co je pod
    // kurzorem, ať si karta se statistikami srovná stav (KONEC_TAHU).
    const pod = typeof document.elementFromPoint === "function" ? document.elementFromPoint(t.posledniX, t.posledniY) : null;
    window.dispatchEvent(new CustomEvent(KONEC_TAHU, { detail: { prvek: pod } }));
    window.removeEventListener("pointermove", posun);
    window.removeEventListener("pointerup", poloz);
    window.removeEventListener("pointercancel", poloz);
    t.el.classList.remove("v-ruce");
    t.el.style.transition = `transform ${DOBA_POSUNU_MS}ms ease`;
    t.el.style.transform = "";
    t.el.addEventListener("transitionend", () => {
      t.el.style.transition = "";
    }, { once: true });
  };

  // Odpojení komponenty uprostřed tažení nesmí nechat posluchače na window.
  useEffect(() => poloz, []);

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
      if (tazeny.current) poloz();
      tazeny.current = { steamId, skupina, el, pointerId: e.pointerId, posledniX: e.clientX, vychoziY: e.clientY, posledniY: e.clientY };
      el.classList.add("v-ruce");
      el.style.transition = "none";
      document.body.classList.add("tahne-se");
      window.addEventListener("pointermove", posun);
      window.addEventListener("pointerup", poloz);
      window.addEventListener("pointercancel", poloz);
      e.preventDefault();
    },

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
