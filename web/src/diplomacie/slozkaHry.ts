/**
 * Uložení scénáře rovnou do složky scénářů hry (uživatel 2. 10. 2026: „nejde
 * otevřít složka pomocí nějakého práva od uživatele, něco jako právo na
 * mikrofon?“). Průzkumníka web otevřít neumí, ale Chrome a Edge mají File
 * System Access API: hráč jednou ukáže složku, prohlížeč k ní dá povolení
 * a web do ní soubor zapíše sám. Úchyt složky se pamatuje v IndexedDB, takže
 * příště stačí jedno kliknutí (prohlížeč se nanejvýš zeptá na povolení).
 *
 * Co prohlížeč nedovolí: otevřít Průzkumníka, ani předvolit v dialogu cestu
 * — umí si jen pod daným `id` pamatovat naposledy vybranou složku. Proto
 * zůstává na stránce řádek s cestou ke zkopírování do dialogu.
 *
 * Všechna logika (úložiště, povolení, zápis) je tady; komponenta
 * `StazeniScenare` jen volá `ulozDoHry` a ukazuje výsledek.
 */

/** Jak se jmenuje složka scénářů hry (poslední díl cesty z `cestaKeScenarum`). */
export const SLOZKA_SCENARU = "scenario";
/** Pod tímhle `id` si prohlížeč pamatuje, kde dialog výběru složky naposledy byl. */
const ID_DIALOGU = "aoe2-scenare";
const DATABAZE = "rob-aoe-diplomacie";
const SKLAD = "slozky";

type Povoleni = "granted" | "denied" | "prompt";
/**
 * Části File System Access API, které TypeScript v `lib.dom` nemá (návrh
 * WICG mimo standard): výběr složky a povolení k úchytu.
 */
interface SlozkaSPovolenim extends FileSystemDirectoryHandle {
  queryPermission?: (volby: { mode: "readwrite" }) => Promise<Povoleni>;
  requestPermission?: (volby: { mode: "readwrite" }) => Promise<Povoleni>;
}
type VyberSlozky = (volby: { id: string; mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
const vyberSlozky = (): VyberSlozky | undefined => (window as unknown as { showDirectoryPicker?: VyberSlozky }).showDirectoryPicker;

/**
 * Umí tenhle prohlížeč zapsat do složky, kterou mu hráč ukáže? Chrome a Edge
 * na počítači ano; Firefox a Safari API nemají. Telefon se vynechává, i když
 * ho Chrome pro Android umí — hra na něm není, složka scénářů taky ne.
 */
export function umiSlozkuHry(): boolean {
  return typeof vyberSlozky() === "function" && !/Android|Mobi/i.test(navigator.userAgent);
}

/** Vypadá vybraná složka jako složka scénářů hry? Stačí jméno — celou cestu prohlížeč webu neprozradí. */
export function jeSlozkaScenaru(slozka: FileSystemDirectoryHandle): boolean {
  return slozka.name.toLowerCase() === SLOZKA_SCENARU;
}

function otevriDatabazi(): Promise<IDBDatabase> {
  return new Promise((ano, ne) => {
    const zadost = indexedDB.open(DATABAZE, 1);
    zadost.onupgradeneeded = () => {
      if (!zadost.result.objectStoreNames.contains(SKLAD)) zadost.result.createObjectStore(SKLAD);
    };
    zadost.onsuccess = () => ano(zadost.result);
    zadost.onerror = () => ne(zadost.error);
  });
}

/** Jedna operace nad skladem úchytů; zápis je hotový až s dokončením transakce, čtení hned s výsledkem. */
async function veSkladu<T>(rezim: IDBTransactionMode, operace: (sklad: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await otevriDatabazi();
  try {
    return await new Promise<T>((ano, ne) => {
      const transakce = db.transaction(SKLAD, rezim);
      const zadost = operace(transakce.objectStore(SKLAD));
      if (rezim === "readonly") zadost.onsuccess = () => ano(zadost.result);
      else transakce.oncomplete = () => ano(zadost.result);
      zadost.onerror = () => ne(zadost.error);
      transakce.onerror = () => ne(transakce.error);
    });
  } finally {
    db.close();
  }
}

/**
 * Složka, kterou si hráč `kdo` naposledy vybral, nebo `null`. Klíčem je hráč:
 * složka scénářů se ve hře jmenuje podle účtu, takže dva lidé na jednom
 * prohlížeči nesmí sdílet jednu. Nedostupné úložiště (anonymní okno,
 * zakázaná data webu) znamená jen „nic si nepamatuju“.
 */
export async function nactiSlozku(kdo: string): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await veSkladu<FileSystemDirectoryHandle | undefined>("readonly", (sklad) => sklad.get(kdo))) ?? null;
  } catch {
    return null;
  }
}

async function zapamatujSlozku(kdo: string, slozka: FileSystemDirectoryHandle): Promise<void> {
  try {
    await veSkladu("readwrite", (sklad) => sklad.put(slozka, kdo));
  } catch {
    // Bez úložiště se hráč příště zeptá znovu — soubor už zapsaný je.
  }
}

async function zapomenSlozku(kdo: string): Promise<void> {
  try {
    await veSkladu("readwrite", (sklad) => sklad.delete(kdo));
  } catch {
    // Není co zapomínat.
  }
}

/** Smí web do složky zapisovat? Když to prohlížeč neví, zeptá se hráče (jako u mikrofonu). */
async function povolZapis(slozka: SlozkaSPovolenim): Promise<boolean> {
  // Prohlížeč bez dotazů na povolení úchyt rovnou buď pustí, nebo zápis odmítne sám.
  if (!slozka.queryPermission || !slozka.requestPermission) return true;
  if ((await slozka.queryPermission({ mode: "readwrite" })) === "granted") return true;
  return (await slozka.requestPermission({ mode: "readwrite" })) === "granted";
}

const jmenoChyby = (e: unknown) => (e instanceof Error || e instanceof DOMException ? e.name : "");

export type VysledekUlozeni =
  /** Soubor je ve složce; `slozka` je její jméno pro potvrzení. */
  | { stav: "ulozeno"; slozka: string }
  /** Hráč dialog výběru složky zavřel. */
  | { stav: "nevybrano" }
  /** Vybraná složka se nejmenuje `scenario`; nic se nezapsalo, čeká se na potvrzení. */
  | { stav: "cizi-slozka"; slozka: FileSystemDirectoryHandle }
  /** Nepovedlo se; `text` je česká hláška pro hráče. */
  | { stav: "chyba"; text: string };

export interface VolbyUlozeni {
  /** Nepoužít zapamatovanou složku a nechat vybrat jinou („změnit složku“). */
  vybratZnovu?: boolean;
  /** Složka, kterou hráč po upozornění potvrdil, i když se nejmenuje `scenario`. */
  potvrzena?: FileSystemDirectoryHandle;
}

const chyba = (text: string): VysledekUlozeni => ({ stav: "chyba", text });
const STAHNI_OBYCEJNE = "Scénář můžeš stáhnout obyčejně odkazem níž.";

/**
 * Stáhne soubor z `url` a zapíše ho pod jménem `jmeno` do složky scénářů
 * hráče `kdo` (existující soubor přepíše). Bez zapamatované složky — nebo
 * s `vybratZnovu` — otevře dialog výběru; složku, která se nejmenuje
 * `scenario`, vrátí k potvrzení a nic do ní nezapíše.
 *
 * Volat rovnou z obsluhy kliknutí: dialog výběru i dotaz na povolení smí
 * prohlížeč otevřít jen chvíli po akci uživatele. Proto se povolení řeší
 * před stažením souboru, ne po něm.
 */
export async function ulozDoHry(kdo: string, soubor: { url: string; jmeno: string }, volby: VolbyUlozeni = {}): Promise<VysledekUlozeni> {
  let slozka: SlozkaSPovolenim | null = volby.potvrzena ?? (volby.vybratZnovu ? null : await nactiSlozku(kdo));
  if (!slozka) {
    const vyber = vyberSlozky();
    if (!vyber) return chyba(`Tenhle prohlížeč do složky zapisovat neumí. ${STAHNI_OBYCEJNE}`);
    try {
      // `window.` schválně: funkce odtržená od okna hází „Illegal invocation“.
      slozka = await vyber.call(window, { id: ID_DIALOGU, mode: "readwrite" });
    } catch (e) {
      if (jmenoChyby(e) === "AbortError") return { stav: "nevybrano" };
      return chyba(`Složku se nepodařilo vybrat. ${STAHNI_OBYCEJNE}`);
    }
    if (!jeSlozkaScenaru(slozka)) return { stav: "cizi-slozka", slozka };
  }

  try {
    if (!(await povolZapis(slozka))) return chyba(`Prohlížeč nedostal povolení do složky zapisovat. Zkus to znovu a zápis povol. ${STAHNI_OBYCEJNE}`);
  } catch {
    return chyba(`Povolení k zápisu do složky se nepodařilo získat. ${STAHNI_OBYCEJNE}`);
  }

  let data: Blob;
  try {
    const odpoved = await fetch(soubor.url);
    if (!odpoved.ok) return chyba(`Scénář se nepodařilo stáhnout ze serveru (${odpoved.status}).`);
    data = await odpoved.blob();
  } catch {
    return chyba("Scénář se nepodařilo stáhnout ze serveru — zkontroluj připojení.");
  }

  try {
    const cil = await slozka.getFileHandle(soubor.jmeno, { create: true });
    const zapis = await cil.createWritable();
    await zapis.write(data);
    await zapis.close();
  } catch (e) {
    if (jmenoChyby(e) === "NotFoundError") {
      // Složka mezitím zmizela (přeinstalovaná hra, jiný disk) — úchyt je k ničemu.
      await zapomenSlozku(kdo);
      return chyba("Zapamatovaná složka už neexistuje — klikni znovu a vyber ji.");
    }
    if (jmenoChyby(e) === "NotAllowedError") return chyba(`Prohlížeč zápis do složky nepovolil. ${STAHNI_OBYCEJNE}`);
    return chyba(`Zápis do složky se nepovedl (soubor může mít otevřený hra). ${STAHNI_OBYCEJNE}`);
  }

  await zapamatujSlozku(kdo, slozka);
  return { stav: "ulozeno", slozka: slozka.name };
}
