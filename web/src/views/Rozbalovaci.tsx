import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props<T> {
  polozky: readonly T[];
  hodnota: T;
  onZmena: (hodnota: T) => void;
  /** Popisek pro čtečky, např. „Civilizace Trokner“, „Cíl: Hráč 2“. */
  popisek: string;
  /** Co položka ukazuje — v tlačítku i v seznamu (obrázek, čtvereček, text). */
  obsah: (polozka: T) => ReactNode;
  klic: (polozka: T) => string | number;
  /** Třída obalu pro vzhled konkrétního výběru (`vyber-civ`, `vyber-hrace`). */
  trida: string;
  /** Jen ke čtení: zašedlé tlačítko, seznam se neotvírá. */
  vypnuto?: boolean;
}

/**
 * Rozbalovací výběr s obrázky v položkách — nativní <select> umí jen text.
 * Tlačítko + vlastní seznam (role listbox), zavírá se klikem mimo, Escapem
 * i výběrem; šipky mění hodnotu rovnou, Enter seznam zavře. Jeden kód pro
 * výběr civilizace s erbem i výběr hráče se čtverečkem barvy (uživatel
 * 3. 10. 2026: „mohli bychom si vytvořit custom dropdown?“).
 */
export function Rozbalovaci<T>({ polozky, hodnota, onZmena, popisek, obsah, klic, trida, vypnuto = false }: Props<T>) {
  const [otevreno, setOtevreno] = useState(false);
  const obal = useRef<HTMLDivElement>(null);
  const seznam = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!otevreno) return;
    const zavri = (e: MouseEvent) => {
      if (!obal.current?.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener("mousedown", zavri);
    // Vybraná položka do zorného pole, ať se neroluje od začátku seznamu.
    seznam.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
    seznam.current?.focus();
    return () => document.removeEventListener("mousedown", zavri);
  }, [otevreno]);

  const vyber = (polozka: T) => {
    onZmena(polozka);
    setOtevreno(false);
  };

  const klavesa = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOtevreno(false);
      return;
    }
    const i = polozky.indexOf(hodnota);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dalsi = polozky[Math.min(Math.max(i + (e.key === "ArrowDown" ? 1 : -1), 0), polozky.length - 1)];
      if (dalsi !== undefined && dalsi !== hodnota) onZmena(dalsi);
    }
    if (e.key === "Enter") setOtevreno(false);
  };

  return (
    <div className={`rozbalovaci ${trida}`} ref={obal}>
      <button
        type="button"
        className="rozbalovaci-tlacitko"
        aria-label={popisek}
        aria-haspopup="listbox"
        aria-expanded={otevreno}
        disabled={vypnuto}
        onClick={() => setOtevreno((o) => !o)}
      >
        {obsah(hodnota)}
        <span className="sipka" aria-hidden="true">
          ▾
        </span>
      </button>
      {otevreno ? (
        <ul className="rozbalovaci-seznam" role="listbox" aria-label={popisek} tabIndex={-1} ref={seznam} onKeyDown={klavesa}>
          {polozky.map((polozka) => (
            <li key={klic(polozka)} role="option" aria-selected={polozka === hodnota} className={polozka === hodnota ? "vybrana" : undefined} onClick={() => vyber(polozka)}>
              {obsah(polozka)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
