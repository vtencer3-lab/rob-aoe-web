import { useEffect, useState } from "react";
import { api } from "./api.js";

export interface Emote {
  jmeno: string;
  url: string;
  siroky: boolean;
  /** Zero-width: skládá se přes předchozí emote. */
  nulovaSirka: boolean;
}

/** Emote, kterým se ukáže samotný vykřičník od admina (uživatel 13. 9. 2026). */
export const EMOTE_VYKRICNIK = "DinkDonk";

/** Adresa obrázku emotu na CDN 7TV v dané velikosti (1x–4x, webp). */
export function obrazekEmotu(e: Emote, velikost: 1 | 2 | 3 | 4 = 2): string {
  return `${e.url}/${velikost}x.webp`;
}

let cache: Map<string, Emote> | null = null;
let nacitani: Promise<Map<string, Emote>> | null = null;

/** Sada jednou za stránku; další volání dostanou tutéž mapu. */
export function nactiEmoty(): Promise<Map<string, Emote>> {
  if (cache) return Promise.resolve(cache);
  if (!nacitani) {
    nacitani = api
      .emoty()
      .then((odpoved) => {
        cache = new Map(odpoved.emoty.map((e) => [e.jmeno, e]));
        return cache;
      })
      .catch(() => {
        // Bez 7TV je chat prostě bez obrázků; za minutu se zkusí znovu.
        nacitani = null;
        return new Map<string, Emote>();
      });
  }
  return nacitani;
}

/** Jen pro testy: zapomenout stažené. */
export function zapomenEmoty(): void {
  cache = null;
  nacitani = null;
}

export function useEmoty(): Map<string, Emote> {
  const [emoty, setEmoty] = useState<Map<string, Emote>>(() => cache ?? new Map());
  useEffect(() => {
    let zivy = true;
    void nactiEmoty().then((m) => {
      if (zivy) setEmoty(m);
    });
    return () => {
      zivy = false;
    };
  }, []);
  return emoty;
}

export type KusTextu = { typ: "text"; text: string } | { typ: "emote"; emote: Emote; vrstvy: Emote[] };

/**
 * Rozseká text zprávy na slova a emoty: slovo, které je přesně jménem emotu
 * ze sady, se ukáže jako obrázek, zbytek zůstane text. Mezery se zachovají.
 * Zero-width emote (uživatel 14. 9. 2026) hned za jiným emotem se na něj
 * položí jako vrstva (víc za sebou = víc vrstev); za textem je to obyčejný
 * emote, není na co ho položit.
 */
export function rozsekejNaEmoty(text: string, emoty: Map<string, Emote>): KusTextu[] {
  if (emoty.size === 0) return [{ typ: "text", text }];
  const kusy: KusTextu[] = [];
  let bufr = "";
  for (const cast of text.split(/(\s+)/)) {
    const e = /^\s+$/.test(cast) ? undefined : emoty.get(cast);
    if (e) {
      const posledni = kusy.at(-1);
      // Mezi emotem a jeho vrstvou smí být jen mezery (bufr je pak jen bílé).
      if (e.nulovaSirka && posledni?.typ === "emote" && /^\s*$/.test(bufr)) {
        bufr = "";
        posledni.vrstvy.push(e);
        continue;
      }
      if (bufr) kusy.push({ typ: "text", text: bufr });
      bufr = "";
      kusy.push({ typ: "emote", emote: e, vrstvy: [] });
    } else {
      bufr += cast;
    }
  }
  if (bufr) kusy.push({ typ: "text", text: bufr });
  return kusy;
}
