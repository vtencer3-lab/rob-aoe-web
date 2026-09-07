import { useEffect, useRef, useState } from "react";
import { CIVILIZACE, nazevCivilizace, patriDoSady } from "../../../src/shared/civilizace.js";
import { erbCivilizace } from "../civErby.js";

interface Props {
  hodnota: number | null;
  onZmena: (civ: number | null) => void;
  /** Popisek pro čtečky, např. „Civilizace Trokner“. */
  popisek: string;
  /** Civilization Set z nastavení akce; null = je to jedno, nabídne se všechno. */
  sada: number | null;
  /** Jen ke čtení (karta hráče): zašedlé tlačítko, seznam se neotvírá. */
  vypnuto?: boolean;
}

const PODLE_JMENA: number[] = Object.entries(CIVILIZACE)
  .map(([id, nazev]) => ({ id: Number(id), nazev }))
  .sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"))
  .map((c) => c.id);

/**
 * Nabídka podle zvolené sady. Vybraná civilizace v seznamu zůstává, i když do
 * sady nepatří — Rob mohl sadu přepnout až po ní a mlčky ji vyhodit by
 * znamenalo, že se z rozbaleného seznamu nedá poznat, co je nastavené.
 */
function nabidka(sada: number | null, hodnota: number | null): Array<number | null> {
  return [null, ...PODLE_JMENA.filter((civ) => patriDoSady(civ, sada) || civ === hodnota)];
}

export function Erb({ civ, velikost = 48 }: { civ: number | null; velikost?: number }) {
  const url = erbCivilizace(civ);
  if (!url) return null;
  return <img className="erb" src={url} alt="" height={velikost} loading="lazy" />;
}

/**
 * Výběr civilizace s erbem před jménem, jako ve hře. Nativní <select> obrázky
 * neumí, takže je to tlačítko + vlastní seznam (role listbox). Zavírá se
 * klikem mimo, Escapem i výběrem; šipky a Enter fungují v seznamu.
 */
export function VyberCivilizace({ hodnota, onZmena, popisek, sada, vypnuto = false }: Props) {
  const [otevreno, setOtevreno] = useState(false);
  const polozky = nabidka(sada, hodnota);
  const obal = useRef<HTMLDivElement>(null);
  const seznam = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!otevreno) return;
    const zavri = (e: MouseEvent) => {
      if (!obal.current?.contains(e.target as Node)) setOtevreno(false);
    };
    document.addEventListener("mousedown", zavri);
    // Vybraná položka do zorného pole, ať se neroluje od Achaemenidů.
    seznam.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
    seznam.current?.focus();
    return () => document.removeEventListener("mousedown", zavri);
  }, [otevreno]);

  const vyber = (civ: number | null) => {
    onZmena(civ);
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
      onZmena(dalsi ?? null);
    }
    if (e.key === "Enter") setOtevreno(false);
  };

  return (
    <div className="vyber-civ" ref={obal}>
      <button
        type="button"
        className="vyber-civ-tlacitko"
        aria-label={popisek}
        aria-haspopup="listbox"
        aria-expanded={otevreno}
        disabled={vypnuto}
        onClick={() => setOtevreno((o) => !o)}
      >
        <Erb civ={hodnota} />
        <span>{hodnota === null ? "libovolná civ." : nazevCivilizace(hodnota)}</span>
        <span className="sipka" aria-hidden="true">
          ▾
        </span>
      </button>
      {otevreno ? (
        <ul className="vyber-civ-seznam" role="listbox" aria-label={popisek} tabIndex={-1} ref={seznam} onKeyDown={klavesa}>
          {polozky.map((civ) => (
            <li
              key={civ ?? "libovolna"}
              role="option"
              aria-selected={civ === hodnota}
              className={civ === hodnota ? "vybrana" : undefined}
              onClick={() => vyber(civ)}
            >
              <Erb civ={civ} />
              <span>{civ === null ? "libovolná civ." : nazevCivilizace(civ)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
