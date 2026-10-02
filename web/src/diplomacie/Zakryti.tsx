import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { animuj, trvani } from "../pohyb.js";

/**
 * Jak daleko od oka karta při otáčení leží — menší číslo, větší zkreslení.
 * Nejmíň dvojnásobek šířky líce: ten je široký jako celá sekce (obsah stojí
 * uprostřed) a při menší vzdálenosti by jeho bližší hrana na chvíli vyjela
 * přes okraj stránky a ta by dostala vodorovný posuvník.
 */
const perspektiva = (el: HTMLElement) => Math.max(1100, 2 * el.offsetWidth);
/** Podíl první půlky otočení (stará strana odjíždí na hranu); zbytek je příjezd nové. */
const PODIL_ODJEZDU = 0.45;

const natoceni = (vzdalenost: number, stupne: number) => `perspective(${vzdalenost}px) rotateY(${stupne}deg)`;

/**
 * Tajný obsah, ve výchozím stavu zakrytý (spec §1.1 bod 8). Stav je jen
 * v paměti komponenty — po obnovení stránky je karta zase zakrytá, ať si ji
 * streamer neprozradí tím, že stránku znovu načte. `napoveda` je bublina
 * zakrytého tlačítka (`title`) pro popisek, který sám neříká, co kliknutí
 * udělá.
 *
 * Odkrytí i zakrytí je otočení karty kolem svislé osy (uživatel 2. 10.
 * 2026): strana, která je vidět, se natočí na hranu, teprve pak se obsah
 * vymění a nová strana se dotočí — tajný obsah se tedy vykreslí až ve
 * chvíli, kdy je karta hranou k divákovi, a při zakrývání zmizí z DOM
 * v půlce pohybu. Výška jede s druhou půlkou, ať stránka pod kartou
 * neposkočí. Bez pohybu (testovací DOM, `prefers-reduced-motion`) se strany
 * prohodí naráz jako dřív.
 */
export function Zakryti({ popisek, children, rub, napoveda }: { popisek: string; children: ReactNode; rub?: ReactNode; napoveda?: string }) {
  const [odkryto, setOdkryto] = useState(false);
  const lic = useRef<HTMLDivElement>(null);
  // Rozjeté otočení: další kliknutí počká na konec a příjezd nové strany ví,
  // z jaké výšky a kterým směrem jede.
  const otaceni = useRef<{ odjezd: Animation | null; zVysky: number; vzdalenost: number; smer: number; ms: number; prijezd: boolean } | null>(null);

  const prepni = () => {
    if (otaceni.current) return;
    const el = lic.current;
    const ms = trvani("--prechod-karta");
    if (!el || ms <= 0 || typeof el.animate !== "function") {
      setOdkryto(!odkryto);
      return;
    }
    const smer = odkryto ? -1 : 1;
    const stav = { odjezd: null as Animation | null, zVysky: el.offsetHeight, vzdalenost: perspektiva(el), smer, ms, prijezd: false };
    otaceni.current = stav;
    const vymen = () => {
      stav.prijezd = true;
      setOdkryto(!odkryto);
    };
    // Zakrytá karta bez rubu nemá co otáčet — nová strana rovnou přijede.
    if (stav.zVysky === 0) vymen();
    else {
      // Konec první půlky drží (karta zůstane na hraně), dokud React obsah
      // nevymění; jinak by se stará strana na jeden snímek vrátila čelem.
      stav.odjezd = animuj(el, [{ transform: natoceni(stav.vzdalenost, 0) }, { transform: natoceni(stav.vzdalenost, 90 * smer), filter: "brightness(0.55)" }], { ms: ms * PODIL_ODJEZDU, krivka: "ease-in", drzet: true }, vymen);
    }
  };

  useLayoutEffect(() => {
    const stav = otaceni.current;
    if (!stav?.prijezd) return;
    const el = lic.current;
    stav.odjezd?.cancel();
    if (!el) {
      otaceni.current = null;
      return;
    }
    const doVysky = el.offsetHeight;
    // Výška jede ze staré strany na novou; co se do ní zatím nevejde, se
    // ořízne (ořez se točí s kartou, takže nic neusekne napříč).
    el.style.overflow = "hidden";
    animuj(
      el,
      [
        { transform: natoceni(stav.vzdalenost, -90 * stav.smer), height: `${stav.zVysky}px`, filter: "brightness(0.55)" },
        { transform: natoceni(stav.vzdalenost, 0), height: `${doVysky}px`, filter: "brightness(1)" },
      ],
      { ms: stav.ms * (1 - PODIL_ODJEZDU), krivka: "ease-out" },
      () => {
        el.style.overflow = "";
        otaceni.current = null;
      },
    );
  }, [odkryto]);

  return (
    <div className={odkryto ? "zakryti odkryto" : "zakryti"} data-testid="zakryti">
      <button type="button" className="zakryti-tlacitko" aria-expanded={odkryto} title={odkryto ? undefined : napoveda} onClick={prepni}>
        {odkryto ? "Zakrýt" : popisek}
      </button>
      <div className="zakryti-lic" ref={lic}>
        {odkryto ? children : (rub ?? null)}
      </div>
    </div>
  );
}
