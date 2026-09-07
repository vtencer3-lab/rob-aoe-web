import { useEffect, useRef, useState } from "react";

interface Props {
  hodnota: string;
  /** Doplní se do popisku pro čtečky: „Kopírovat <popis>“. */
  popis: string;
  /** Další třídy, např. pro usazení do snímku dialogu Create Lobby. */
  className?: string;
  testId?: string;
}

/**
 * Hodnota, která se zkopíruje kliknutím na sebe samu. Host opisuje název
 * lobby a heslo do herního dialogu uprostřed vysílání; překlep v hesle pozná
 * až tím, že se mu nikdo nepřipojí, takže se to opisovat nemá vůbec. Ikona
 * vedle textu říká, že se dá kliknout; toast nad hodnotou potvrdí, že se
 * to povedlo, aniž by se cokoliv v řádku pohnulo.
 */
export function Kopirovatelne({ hodnota, popis, className, testId }: Props) {
  const [zkopirovano, setZkopirovano] = useState(false);
  const casovac = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Bez úklidu by se po odpojení komponenty sahalo na setState odpojeného
  // stromu — zápas se přitom překreslí při každé změně stavu z SSE.
  useEffect(() => () => clearTimeout(casovac.current), []);

  async function kopiruj() {
    try {
      await navigator.clipboard.writeText(hodnota);
      setZkopirovano(true);
      clearTimeout(casovac.current);
      casovac.current = setTimeout(() => setZkopirovano(false), 1500);
    } catch {
      // Schránku prohlížeč pustí jen na https nebo localhostu. Když odmítne,
      // hodnota zůstává na obrazovce k opsání — hláška navíc by hostovi
      // uprostřed streamu stejně nepomohla.
    }
  }

  return (
    <button
      type="button"
      className={className ? `kopirovatelne ${className}` : "kopirovatelne"}
      data-testid={testId}
      aria-label={`Kopírovat ${popis}`}
      title={`Kopírovat ${popis}`}
      onClick={() => void kopiruj()}
    >
      <strong>{hodnota}</strong>
      <svg className="ikona-kopie" aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
        <rect x="5" y="5" width="9" height="9" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {zkopirovano ? (
        <span className="toast" role="status">
          Zkopírováno!
        </span>
      ) : null}
    </button>
  );
}
