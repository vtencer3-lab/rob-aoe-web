import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
 * streamer neprozradí tím, že stránku znovu načte. Výjimka je `pamet`
 * (pult GM, uživatel 3. 10. 2026: „když byl pult rozbalený, refresh ho
 * nechá rozbalený“): stav drží sessionStorage pod tímhle klíčem — jen
 * v téže záložce, nová záložka nebo okno začíná zakryté. `napoveda` je bublina
 * zakrytého tlačítka (`title`) pro popisek, který sám neříká, co kliknutí
 * udělá.
 *
 * Zakrytá karta s rubem je tlačítkem sama (uživatel 2. 10. 2026): žádný
 * nápis nad ní, `popisek` je jen přístupné jméno a bublina, najetí kartu
 * nadzvedne a rozsvítí. Bez rubu zůstává obyčejné tlačítko s popiskem.
 * „Zakrýt“ leží v líci nad obsahem, ať se otočí i s ním a výška ho
 * započítá.
 *
 * Odkrytí i zakrytí je otočení karty kolem svislé osy (uživatel 2. 10.
 * 2026): strana, která je vidět, se natočí na hranu, teprve pak se obsah
 * vymění a nová strana se dotočí — tajný obsah se tedy vykreslí až ve
 * chvíli, kdy je karta hranou k divákovi, a při zakrývání zmizí z DOM
 * v půlce pohybu. Výška jede s druhou půlkou, ať stránka pod kartou
 * neposkočí. Bez pohybu (testovací DOM, `prefers-reduced-motion`) se strany
 * prohodí naráz jako dřív.
 */
export function Zakryti({ popisek, children, rub, napoveda, pamet }: { popisek: string; children: ReactNode; rub?: ReactNode; napoveda?: string; pamet?: string }) {
  const [odkryto, setOdkryto] = useState(() => {
    if (!pamet) return false;
    try {
      return sessionStorage.getItem(pamet) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!pamet) return;
    try {
      if (odkryto) sessionStorage.setItem(pamet, "1");
      else sessionStorage.removeItem(pamet);
    } catch {
      // Bez úložiště se pult po obnovení zase zakryje.
    }
  }, [odkryto, pamet]);
  const lic = useRef<HTMLDivElement>(null);
  // Rozjeté otočení: další kliknutí počká na konec a příjezd nové strany ví,
  // z jaké výšky a kterým směrem jede.
  const otaceni = useRef<{ odjezd: Animation | null; zVysky: number; vzdalenost: number; smer: number; ms: number; prijezd: boolean } | null>(null);

  // Kliknuté tlačítko po výměně stran zmizí; fokus z klávesnice přejde na
  // tlačítko nové strany, ať se nezahodí na začátek stránky.
  const presunFokus = useRef(false);

  const prepni = () => {
    if (otaceni.current) return;
    const el = lic.current;
    presunFokus.current = !!el && el.contains(document.activeElement);
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
    // Líc bez výšky nemá co otáčet — nová strana rovnou přijede.
    if (stav.zVysky === 0) vymen();
    else {
      // Konec první půlky drží (karta zůstane na hraně), dokud React obsah
      // nevymění; jinak by se stará strana na jeden snímek vrátila čelem.
      stav.odjezd = animuj(el, [{ transform: natoceni(stav.vzdalenost, 0) }, { transform: natoceni(stav.vzdalenost, 90 * smer), filter: "brightness(0.55)" }], { ms: ms * PODIL_ODJEZDU, krivka: "ease-in", drzet: true }, vymen);
    }
  };

  useLayoutEffect(() => {
    if (presunFokus.current) {
      presunFokus.current = false;
      lic.current?.querySelector("button")?.focus({ preventScroll: true });
    }
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
      <div className="zakryti-lic" ref={lic}>
        {odkryto ? (
          <>
            <button type="button" className="zakryti-tlacitko" aria-expanded onClick={prepni}>
              Zakrýt
            </button>
            {children}
          </>
        ) : rub ? (
          <button type="button" className="bez-vzhledu zakryti-karta" aria-expanded={false} aria-label={popisek} title={napoveda ?? popisek} onClick={prepni}>
            {rub}
          </button>
        ) : (
          <button type="button" className="zakryti-tlacitko" aria-expanded={false} title={napoveda} onClick={prepni}>
            {popisek}
          </button>
        )}
      </div>
    </div>
  );
}
