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

function zrusOdklad(steamId: string): void {
  const odklad = odklady.get(steamId);
  if (odklad === undefined) return;
  clearTimeout(odklad);
  odklady.delete(steamId);
}

/** Otevřela se další karta. Vrací funkci, která ohlásí její zavření. */
export function sledujPritomnost(steamId: string): () => void {
  otevrene.set(steamId, (otevrene.get(steamId) ?? 0) + 1);
  zrusOdklad(steamId);

  let ohlaseno = false;
  return () => {
    // Úklid streamu se volá i vícekrát; druhé zavření téže karty se nepočítá.
    if (ohlaseno) return;
    ohlaseno = true;

    const zbyva = (otevrene.get(steamId) ?? 1) - 1;
    if (zbyva > 0) {
      otevrene.set(steamId, zbyva);
      return;
    }
    otevrene.delete(steamId);

    const odklad = setTimeout(() => {
      odklady.delete(steamId);
      void odhlasZAkce(steamId);
    }, ODCHOD_MS);
    // Ať odklad nedrží proces naživu při vypínání.
    odklad.unref?.();
    odklady.set(steamId, odklad);
  };
}

async function odhlasZAkce(steamId: string): Promise<void> {
  try {
    // Akce se rozhoduje až tady: mezi zavřením karty a vypršením odkladu mohl
    // večer skončit a jiný začít.
    const akce = await getAktivniAkce();
    if (!akce) return;
    await withdraw(akce.id, steamId);
    await broadcastAkce();
  } catch {
    // Odhlášení je úklid, ne úkol uživatele. Když se nepovede, hráč zůstane
    // v seznamu a usne podle lhůty aktivity — horší, ale ne rozbité.
  }
}

/** Jen pro testy: zapomene, co si drží v paměti. */
export function zapomenPritomnost(): void {
  for (const steamId of odklady.keys()) zrusOdklad(steamId);
  otevrene.clear();
}
