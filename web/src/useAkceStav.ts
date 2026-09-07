import { useEffect, useRef, useState } from "react";
import type { AkceStavPayload } from "../../src/shared/types.js";
import { VERZE } from "../../src/shared/verze.js";
import { api } from "./api.js";
import { cesta } from "./cesty.js";

/** První pokus o obnovu je skoro okamžitý, další se zdvojnásobují až na strop. */
export const PRVNI_ODKLAD_MS = 1_000;
/** Strop odkladu. Nečinná stránka se tak ptá nejvýš čtyřikrát za minutu. */
export const MAX_ODKLAD_MS = 15_000;
/** Jak dlouho snese otevřený, ale mlčící stream, než ho přestaneme brát vážně. */
export const TRPELIVOST_MS = 5_000;
/** Tempo náhradního dotazování. Dost husté na živý večer, dost řídké na server. */
export const DOTAZ_INTERVAL_MS = 3_000;
/**
 * Server pulsuje každých 25 s. Když za tuhle dobu nepřijde ani puls, ani
 * stav, spojení potichu umřelo (NAT, proxy, uspaný počítač) — prohlížeč to
 * sám nepozná a čekal by navždy. 7. 9. 2026 tak Rob 18 s klikal na „Zrušit“
 * a nic se nedělo, protože stream byl dvě hodiny mrtvý.
 */
export const HLIDKA_MS = 70_000;

/**
 * Server posílá celý stav akce, ne přírůstky. Proto se tady nic neskládá —
 * poslední přijatá zpráva je pravda a obnova po výpadku spojení je zdarma.
 * Tatáž vlastnost dělá z `/api/akce` plnohodnotnou náhradu streamu: vrací
 * doslova týž redigovaný payload, jen na vyžádání.
 *
 * Hook drží dvě zábradlí proti dvěma různým způsobům, jak stream umře:
 *
 * 1. **Spojení spadne.** Obnovujeme si ho sami, protože na EventSource se
 *    spolehnout nejde — podle specifikace SSE prohlížeč po jiném stavovém
 *    kódu než 200 spojení natvrdo ukončí (readyState = CLOSED) a sám už ho
 *    neotevře. Pokrývá to i výpadek tunelu nebo restart serveru, což u
 *    Cloudflare Tunnelu z domácího stroje není teoretická situace.
 *
 * 2. **Spojení stojí otevřené a mlčí.** Tohle je zákeřnější, protože se
 *    nevyhodí žádná chyba a stránka jen navždy zůstane prázdná. Přesně tak se
 *    chová Cloudflare quick tunnel (`*.trycloudflare.com`): drží celé tělo
 *    odpovědi, dokud neskončí, a náš stream schválně nekončí nikdy — takže
 *    přes něj nedorazí ani úvodní snímek stavu. Změřeno, hlavičkami
 *    (`cache-control: no-cache`, `x-accel-buffering: no`) to nejde ubránit,
 *    edge je z odpovědi zahodí. Po TRPELIVOST_MS ticha proto přepneme na
 *    dotazování.
 *
 * Mlčící stream přitom **nezavíráme**. Nic nás nestojí a kdyby se cesta ven
 * někdy pročistila (jiný tunel, jiná trasa), první doručená zpráva dotazování
 * sama vypne a jsme zpátky na realtime bez jediného refreshe.
 */
export interface AkceStavHook {
  stav: AkceStavPayload | null;
  spojeno: boolean;
  obnov: () => Promise<void>;
  /** Verze serveru, když se liší od té, kterou má stránka načtenou; jinak null. */
  novaVerze: string | null;
}

export function useAkceStav(): AkceStavHook {
  const [stav, setStav] = useState<AkceStavPayload | null>(null);
  const [spojeno, setSpojeno] = useState(false);
  const [novaVerze, setNovaVerze] = useState<string | null>(null);
  const obnovRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let zdroj: EventSource | undefined;
    let casovac: ReturnType<typeof setTimeout> | undefined;
    let odklad = PRVNI_ODKLAD_MS;
    let ukonceno = false;
    let hlidka: ReturnType<typeof setTimeout> | undefined;
    let dotazovani: ReturnType<typeof setInterval> | undefined;
    let hlidkaTicha: ReturnType<typeof setTimeout> | undefined;

    const dotazSeServeru = async () => {
      try {
        const novy = await api.akce();
        if (ukonceno) return;
        setStav(novy);
        setSpojeno(true);
      } catch {
        if (!ukonceno) setSpojeno(false);
      }
    };
    obnovRef.current = dotazSeServeru;

    // Návrat do záložky: co se stalo mezitím, se raději hned dočte, než aby
    // se čekalo na další zprávu ze streamu.
    const naViditelnost = () => {
      if (document.visibilityState === "visible") void dotazSeServeru();
    };
    document.addEventListener("visibilitychange", naViditelnost);

    // Otevřený stream, kterým nic neteče, je horší než spadlý: nic se
    // nevyhodí, jen stránka navždy mlčí. Tuhle přesnou vadu dělá Cloudflare
    // quick tunnel, který tělo odpovědi drží až do jejího konce.
    const zapniDotazovani = () => {
      if (dotazovani) return;
      void dotazSeServeru();
      dotazovani = setInterval(() => void dotazSeServeru(), DOTAZ_INTERVAL_MS);
    };

    const vypniDotazovani = () => {
      clearInterval(dotazovani);
      dotazovani = undefined;
    };

    const otevri = () => {
      const aktualni = new EventSource(cesta("/api/stream"));
      zdroj = aktualni;

      // Hlídka ticha: každý puls i stav ji natáhne znovu. Když vyprší,
      // spojení je potichu mrtvé — zavřít, dotazovat se a otevřít nové.
      const natahniHlidku = () => {
        clearTimeout(hlidkaTicha);
        hlidkaTicha = setTimeout(() => {
          if (ukonceno || zdroj !== aktualni) return;
          setSpojeno(false);
          aktualni.close();
          zapniDotazovani();
          odklad = PRVNI_ODKLAD_MS;
          otevri();
        }, HLIDKA_MS);
      };

      aktualni.onopen = () => {
        odklad = PRVNI_ODKLAD_MS;
        setSpojeno(true);
        natahniHlidku();
      };
      aktualni.onmessage = (udalost) => {
        // Stream mluví — náhrada už není k ničemu.
        clearTimeout(hlidka);
        hlidka = undefined;
        vypniDotazovani();
        odklad = PRVNI_ODKLAD_MS;
        natahniHlidku();
        setStav(JSON.parse(udalost.data) as AkceStavPayload);
        setSpojeno(true);
      };
      // Testovací náhrada EventSource nemusí addEventListener mít.
      aktualni.addEventListener?.("puls", natahniHlidku);
      // Server se po nasazení restartuje, stream spadne a nové spojení
      // přinese novou verzi. Stará stránka by jinak nové položky stavu
      // tiše ignorovala a tvářila se, že se nic nesynchronizuje.
      aktualni.addEventListener?.("verze", (udalost) => {
        const { verze } = JSON.parse((udalost as MessageEvent<string>).data) as { verze?: string };
        if (typeof verze === "string") setNovaVerze(verze !== VERZE ? verze : null);
      });
      aktualni.onerror = () => {
        setSpojeno(false);
        if (ukonceno) return;
        clearTimeout(hlidkaTicha);
        // Zavíráme i my sami: u síťové chyby by se EventSource pokusil znovu
        // připojit vlastním tempem a běžely by dvě obnovy vedle sebe.
        aktualni.close();
        casovac = setTimeout(otevri, odklad);
        odklad = Math.min(odklad * 2, MAX_ODKLAD_MS);
      };
    };

    otevri();
    hlidka = setTimeout(zapniDotazovani, TRPELIVOST_MS);

    return () => {
      ukonceno = true;
      clearTimeout(casovac);
      clearTimeout(hlidka);
      clearTimeout(hlidkaTicha);
      document.removeEventListener("visibilitychange", naViditelnost);
      vypniDotazovani();
      zdroj?.close();
    };
  }, []);

  return { stav, spojeno, obnov: () => obnovRef.current(), novaVerze };
}
