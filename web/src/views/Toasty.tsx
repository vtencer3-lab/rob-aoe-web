import { useEffect } from "react";

export interface Toast {
  id: number;
  text: string;
  /** Tlačítko „Zpět“ u toastu změny; u zpět/znovu není. */
  zpet?: () => void;
}

/** Jak dlouho toast svítí, než sám zmizí. */
export const DOBA_TOASTU_MS = 6_000;

/**
 * Hlášky o změnách vpravo dole: co se stalo, tlačítko Zpět a křížek. Samy
 * zmizí po 6 s. Kontejner sedí nad kartou se statistikami (CSS proměnná
 * --staty-vyska), ať je vidět vždycky.
 */
export function Toasty({ toasty, onZavrit }: { toasty: Toast[]; onZavrit: (id: number) => void }) {
  useEffect(() => {
    if (toasty.length === 0) return;
    const posledni = toasty[toasty.length - 1]!;
    const casovac = setTimeout(() => onZavrit(posledni.id), DOBA_TOASTU_MS);
    return () => clearTimeout(casovac);
    // Každý nový toast si spustí vlastní odpočet; starší zmizí, až na ně dojde.
  }, [toasty, onZavrit]);

  if (toasty.length === 0) return null;
  return (
    <div className="toasty" data-testid="toasty" role="status" aria-live="polite">
      {toasty.map((t) => (
        <div key={t.id} className="toast-zmeny">
          <span>{t.text}</span>
          {t.zpet ? (
            <button type="button" onClick={t.zpet}>
              Zpět
            </button>
          ) : null}
          <button type="button" className="zavrit" aria-label="Zavřít" onClick={() => onZavrit(t.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
