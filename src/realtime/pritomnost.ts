import { getAktivniAkce, withdraw } from "../db/events.js";
import { broadcastAkce } from "./akceStav.js";

/**
 * Kdo má na akci otevřenou stránku.
 *
 * Přihláška do akce je slib „dnes hraju“. Kdo zavře stránku a odejde, ho ale
 * dřív nechával v seznamu, dokud si nevzpomněl — a Rob z toho seznamu skládal
 * zápasy. Zavření poslední karty se proto počítá jako odhlášení z akce (ne
 * z účtu, přihlášení přes Steam zůstává).
 *
 * Hlídá se to podle SSE spojení, ne podle události `beforeunload` v prohlížeči:
 * ta se pouští i při obnovení stránky a při proklikávání a odhlásila by
 * člověka, který nikam neodešel.
 */

/**
 * Odklad mezi zavřením poslední karty a odhlášením. Musí přežít obnovení
 * stránky i krátký výpadek sítě — obojí spojení zavře a hned otevře znovu —
 * a přitom nedržet v seznamu někoho, kdo je pryč. Půldruhé minuty na obojí
 * stačí; puls streamu chodí po 25 s, takže rozpadlé spojení se ohlásí dřív.
 */
export const ODCHOD_MS = 90_000;

/** Kolik má kdo otevřených streamů. Víc karet naráz je běžné, ne výjimka. */
const otevrene = new Map<string, number>();
const odklady = new Map<string, NodeJS.Timeout>();

function zrusOdklad(hracId: string): void {
  const odklad = odklady.get(hracId);
  if (odklad === undefined) return;
  clearTimeout(odklad);
  odklady.delete(hracId);
}

/** Otevřela se další karta. Vrací funkci, která ohlásí její zavření. */
export function sledujPritomnost(hracId: string): () => void {
  otevrene.set(hracId, (otevrene.get(hracId) ?? 0) + 1);
  zrusOdklad(hracId);

  let ohlaseno = false;
  return () => {
    // Úklid streamu se volá i vícekrát; druhé zavření téže karty se nepočítá.
    if (ohlaseno) return;
    ohlaseno = true;

    const zbyva = (otevrene.get(hracId) ?? 1) - 1;
    if (zbyva > 0) {
      otevrene.set(hracId, zbyva);
      return;
    }
    otevrene.delete(hracId);

    const odklad = setTimeout(() => {
      odklady.delete(hracId);
      void odhlasZAkce(hracId);
    }, ODCHOD_MS);
    // Ať odklad nedrží proces naživu při vypínání.
    odklad.unref?.();
    odklady.set(hracId, odklad);
  };
}

async function odhlasZAkce(hracId: string): Promise<void> {
  try {
    // Akce se rozhoduje až tady: mezi zavřením karty a vypršením odkladu mohl
    // večer skončit a jiný začít.
    const akce = await getAktivniAkce();
    if (!akce) return;
    await withdraw(akce.id, hracId);
    await broadcastAkce();
  } catch {
    // Odhlášení je úklid, ne úkol uživatele. Když se nepovede, hráč zůstane
    // v seznamu a usne podle lhůty aktivity — horší, ale ne rozbité.
  }
}

/** Jen pro testy: zapomene, co si drží v paměti. */
export function zapomenPritomnost(): void {
  for (const hracId of odklady.keys()) zrusOdklad(hracId);
  otevrene.clear();
}
