import { useEffect, useRef, useState } from "react";

interface Props {
  hodnota: string;
  /** Doplní se do popisku pro čtečky: „Kopírovat <popis>“. */
  popis: string;
}

/**
 * Host opisuje název lobby a heslo do herního dialogu uprostřed vysílání.
 * Překlep v hesle pozná až tím, že se mu nikdo nepřipojí, takže se to opisovat
 * nemá vůbec.
 */
export function KopirovaciTlacitko({ hodnota, popis }: Props) {
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
      // hodnota zůstává vedle na obrazovce k opsání — hláška navíc by hostovi
      // uprostřed streamu stejně nepomohla.
    }
  }

  return (
    <button
      type="button"
      className="kopirovat"
      aria-label={`Kopírovat ${popis}`}
      onClick={() => void kopiruj()}
    >
      {zkopirovano ? "zkopírováno" : "kopírovat"}
    </button>
  );
}
