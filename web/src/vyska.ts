import { useLayoutEffect, useRef, type RefObject } from "react";

/** Jak dlouho trvá srovnání výšky. Krátce: má to být plynulé, ne obřadné. */
export const ZMENA_VYSKY_MS = 200;

/**
 * Plynulá změna výšky prvku, když mu přibude nebo ubude obsah.
 *
 * Když Rob vybere hráče do sestavy, zmizí řádek z tabulky přihlášených a panel
 * o ten kus poskočí. Skok je nepříjemný právě proto, že je okamžitý: oko ho
 * čte jako záškub, ne jako změnu.
 *
 * Technika je stejná jako u přejezdu řádků: ve stejném snímku, ve kterém
 * prohlížeč spočítal novou výšku, se prvku nasadí ta stará a hned se nechá
 * dojet na novou. `overflow` se po dobu přejezdu zavře, ať obsah nekouká ven
 * z rámu, a na konci se všechno uklidí, aby si panel dál řídil výšku sám.
 *
 * Měří se spočtená výška, ne obalový obdélník: panel je `content-box` a jeho
 * obdélník nese i 34px rám a odsazení. Dosadit jedno za druhé znamenalo pustit
 * přejezd o 80 px vedle — deska se nafoukla, dojela a na konci se srazila zpět
 * na svou skutečnou výšku.
 *
 * `klic` je otisk obsahu; efekt se pouští, jen když se opravdu změnil.
 */
export function useZmenaVysky(prvek: RefObject<HTMLElement | null>, klic: string): void {
  const drive = useRef<number | null>(null);

  useLayoutEffect(() => {
    const el = prvek.current;
    if (!el) return;
    const nova = parseFloat(window.getComputedStyle(el).height);
    const stara = drive.current;
    drive.current = nova;

    const bezPohybu = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // První vykreslení nemá odkud přijet; nulový rozdíl není co animovat.
    // V testovacím DOM jsou všechny rozměry nulové, takže se nespustí nic.
    if (bezPohybu || stara === null || !Number.isFinite(nova) || stara === nova) return;

    el.style.transition = "none";
    el.style.height = `${stara}px`;
    el.style.overflow = "hidden";
    const uklid = () => {
      el.style.transition = "";
      el.style.height = "";
      el.style.overflow = "";
    };
    const id = requestAnimationFrame(() => {
      el.style.transition = `height ${ZMENA_VYSKY_MS}ms ease`;
      el.style.height = `${nova}px`;
      el.addEventListener("transitionend", uklid, { once: true });
    });
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener("transitionend", uklid);
      uklid();
    };
  }, [prvek, klic]);
}
