import { useState, type ReactNode } from "react";

/**
 * Tajný obsah, ve výchozím stavu zakrytý (spec §1.1 bod 8). Stav je jen
 * v paměti komponenty — po obnovení stránky je karta zase zakrytá, ať si ji
 * streamer neprozradí tím, že stránku znovu načte.
 */
export function Zakryti({ popisek, children, rub }: { popisek: string; children: ReactNode; rub?: ReactNode }) {
  const [odkryto, setOdkryto] = useState(false);
  return (
    <div className={odkryto ? "zakryti odkryto" : "zakryti"} data-testid="zakryti">
      <button type="button" className="zakryti-tlacitko" aria-expanded={odkryto} onClick={() => setOdkryto(!odkryto)}>
        {odkryto ? "Zakrýt" : popisek}
      </button>
      {odkryto ? children : (rub ?? null)}
    </div>
  );
}
