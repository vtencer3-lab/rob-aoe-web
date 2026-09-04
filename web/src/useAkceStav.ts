import { useEffect, useState } from "react";
import type { AkceStavPayload } from "../../src/shared/types.js";

/** První pokus o obnovu je skoro okamžitý, další se zdvojnásobují až na strop. */
export const PRVNI_ODKLAD_MS = 1_000;
/** Strop odkladu. Nečinná stránka se tak ptá nejvýš čtyřikrát za minutu. */
export const MAX_ODKLAD_MS = 15_000;

/**
 * Server posílá celý stav akce, ne přírůstky. Proto se tady nic neskládá —
 * poslední přijatá zpráva je pravda a obnova po výpadku spojení je zdarma.
 *
 * Spojení si obnovujeme sami, protože na vestavěné chování EventSource se tu
 * spolehnout nejde: podle specifikace SSE prohlížeč spojení po jiném stavovém
 * kódu než 200 natvrdo ukončí (readyState = CLOSED) a už nikdy ho sám
 * neotevře. `/api/stream` přitom vrací 404, dokud Rob večer nezaloží — takže
 * kdo si stránku otevře dřív, zůstal by mrtvý navždy. Vlastní obnova navíc
 * pokrývá i výpadek tunelu nebo restart serveru, což u Cloudflare Tunnelu
 * z domácího stroje není teoretická situace.
 */
export function useAkceStav(): { stav: AkceStavPayload | null; spojeno: boolean } {
  const [stav, setStav] = useState<AkceStavPayload | null>(null);
  const [spojeno, setSpojeno] = useState(false);

  useEffect(() => {
    let zdroj: EventSource | undefined;
    let casovac: ReturnType<typeof setTimeout> | undefined;
    let odklad = PRVNI_ODKLAD_MS;
    let ukonceno = false;

    const otevri = () => {
      const aktualni = new EventSource("/api/stream");
      zdroj = aktualni;

      aktualni.onopen = () => {
        odklad = PRVNI_ODKLAD_MS;
        setSpojeno(true);
      };
      aktualni.onmessage = (udalost) => {
        odklad = PRVNI_ODKLAD_MS;
        setStav(JSON.parse(udalost.data) as AkceStavPayload);
        setSpojeno(true);
      };
      aktualni.onerror = () => {
        setSpojeno(false);
        if (ukonceno) return;
        // Zavíráme i my sami: u síťové chyby by se EventSource pokusil znovu
        // připojit vlastním tempem a běžely by dvě obnovy vedle sebe.
        aktualni.close();
        casovac = setTimeout(otevri, odklad);
        odklad = Math.min(odklad * 2, MAX_ODKLAD_MS);
      };
    };

    otevri();

    return () => {
      ukonceno = true;
      clearTimeout(casovac);
      zdroj?.close();
    };
  }, []);

  return { stav, spojeno };
}
