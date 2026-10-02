import { vi } from "vitest";

/**
 * Podvržené File System Access API a IndexedDB pro testy `slozkaHry.ts`
 * a `StazeniScenare` — testovací DOM (jsdom) nemá ani jedno. Jen to, co
 * modul opravdu volá; žádná nová závislost.
 */

type Povoleni = "granted" | "denied" | "prompt";

/** Složka na „disku“: co se do ní zapsalo, je v `soubory`. */
export class PodvrzenaSlozka {
  readonly kind = "directory";
  readonly soubory = new Map<string, Blob>();
  /** Co prohlížeč o povolení ví teď a co hráč odpoví, když se zeptá. */
  povoleni: Povoleni = "granted";
  odpovedHrace: Povoleni = "granted";
  /** Chyba, kterou zápis hodí (jméno `DOMException`): zmizelá složka, zamčený soubor. */
  chybaZapisu: string | null = null;
  /** Chyba, kterou hodí až `write` rozepsaného proudu (plný disk, soubor zamčený hrou). */
  chybaProudu: string | null = null;
  /** Kolikrát se rozepsaný proud zahodil (`abort`). */
  zahozeno = 0;
  constructor(readonly name: string) {}
  queryPermission = vi.fn(async () => this.povoleni);
  requestPermission = vi.fn(async () => (this.povoleni = this.odpovedHrace));
  getFileHandle = vi.fn(async (jmeno: string, _volby?: { create?: boolean }) => {
    if (this.chybaZapisu) throw new DOMException("podvržená chyba", this.chybaZapisu);
    let rozepsano: Blob | null = null;
    return {
      createWritable: async () => ({
        write: async (data: Blob) => {
          if (this.chybaProudu) throw new DOMException("podvržená chyba", this.chybaProudu);
          rozepsano = data;
        },
        abort: async () => {
          rozepsano = null;
          this.zahozeno++;
        },
        // Jako v prohlížeči: soubor se objeví až po zavření zápisu.
        close: async () => {
          if (rozepsano) this.soubory.set(jmeno, rozepsano);
        },
      }),
    };
  });
  /** Úchyt tak, jak ho čeká modul (typy prohlížeče jsou širší, než podvrh potřebuje). */
  get uchyt(): FileSystemDirectoryHandle {
    return this as unknown as FileSystemDirectoryHandle;
  }
}

/** IndexedDB v paměti: jedna databáze, sklady klíč → hodnota, odpovědi v mikroúloze. */
function databazeVPameti(): IDBFactory {
  const sklady = new Map<string, Map<IDBValidKey, unknown>>();
  const zadost = <T>(vysledek: () => T) => {
    const z = { result: undefined as T | undefined, error: null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null };
    queueMicrotask(() => {
      z.result = vysledek();
      z.onsuccess?.();
    });
    return z;
  };
  const db = {
    objectStoreNames: { contains: (jmeno: string) => sklady.has(jmeno) },
    createObjectStore: (jmeno: string) => void sklady.set(jmeno, new Map()),
    close: () => {},
    transaction: (jmeno: string) => {
      const transakce = { oncomplete: null as (() => void) | null, onerror: null, error: null, objectStore: () => sklad };
      const hotovo = () => queueMicrotask(() => queueMicrotask(() => transakce.oncomplete?.()));
      const sklad = {
        get: (klic: IDBValidKey) => zadost(() => sklady.get(jmeno)!.get(klic)),
        put: (hodnota: unknown, klic: IDBValidKey) => (hotovo(), zadost(() => void sklady.get(jmeno)!.set(klic, hodnota))),
        delete: (klic: IDBValidKey) => (hotovo(), zadost(() => void sklady.get(jmeno)!.delete(klic))),
      };
      return transakce;
    },
  };
  return {
    open: () => {
      const z = { result: db, error: null, onupgradeneeded: null as (() => void) | null, onsuccess: null as (() => void) | null, onerror: null };
      queueMicrotask(() => {
        z.onupgradeneeded?.();
        z.onsuccess?.();
      });
      return z;
    },
  } as unknown as IDBFactory;
}

export interface PodvrzenyProhlizec {
  /** Dialog výběru složky; test mu řekne, co hráč vybere (`mockResolvedValueOnce`) nebo že ho zavře. */
  vyber: ReturnType<typeof vi.fn>;
  /** Stažení souboru ze serveru; bez zásahu vrací `obsah`. */
  fetch: ReturnType<typeof vi.fn>;
  /** Obsah scénáře, který server pošle — zapsaný soubor se s ním porovnává. */
  obsah: Blob;
  uklid: () => void;
}

/** Odpověď serveru se souborem (jen to, co modul z `Response` čte). */
export const odpovedSeSouborem = (obsah: Blob, status = 200) => ({ ok: status >= 200 && status < 300, status, blob: async () => obsah }) as unknown as Response;

/** Chyba, kterou dialog hodí, když ho hráč zavře. */
export const zavrenyDialog = () => new DOMException("The user aborted a request.", "AbortError");

/**
 * Prohlížeč, který složky umí (Chrome/Edge): dialog výběru, IndexedDB
 * a `fetch` vracející obsah scénáře. `sVyberem: false` = Firefox, Safari.
 */
export function podvrhniProhlizec({ sVyberem = true, sDatabazi = true }: { sVyberem?: boolean; sDatabazi?: boolean } = {}): PodvrzenyProhlizec {
  const vyber = vi.fn();
  const obsah = new Blob(["obsah scénáře"]);
  const stazeni = vi.fn(async () => odpovedSeSouborem(obsah));
  const okno = window as unknown as Record<string, unknown>;
  if (sVyberem) okno["showDirectoryPicker"] = vyber;
  vi.stubGlobal("fetch", stazeni);
  if (sDatabazi) vi.stubGlobal("indexedDB", databazeVPameti());
  return {
    vyber,
    fetch: stazeni,
    obsah,
    uklid: () => {
      delete okno["showDirectoryPicker"];
      vi.unstubAllGlobals();
    },
  };
}
