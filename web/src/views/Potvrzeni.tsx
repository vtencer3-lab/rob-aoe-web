import { createPortal } from "react-dom";
import { useEffect, useId, type ReactNode } from "react";
import { useZamekScrollu } from "../zamekScrollu.js";

interface Props {
  /** Otázka, na kterou se odpovídá Ano/Ne; uzel, ať v ní jméno hráče může nést čtvereček barvy. */
  text: ReactNode;
  potvrdit?: string;
  zrusit?: string;
  onPotvrdit: () => void;
  onZrusit: () => void;
}

/**
 * Potvrzovací okno ve stylu ostatních modálů místo `window.confirm`: to by
 * se v přenosu muselo odškrtávat v prohlížeči a nevypadá jako zbytek webu.
 * Escape ruší, Enter potvrzuje.
 */
export function Potvrzeni({ text, potvrdit = "Ano", zrusit = "Ne", onPotvrdit, onZrusit }: Props) {
  useZamekScrollu();
  // Okno se jmenuje otázkou; přes id odstavce, protože otázka nemusí být holý text.
  const idOtazky = useId();
  useEffect(() => {
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZrusit();
      if (e.key === "Enter") onPotvrdit();
    };
    window.addEventListener("keydown", klavesa);
    return () => window.removeEventListener("keydown", klavesa);
  }, [onPotvrdit, onZrusit]);

  return createPortal(
    <div
      className="prelobby-stin"
      data-testid="potvrzeni-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZrusit();
      }}
    >
      <div className="prelobby-okno potvrzeni" role="alertdialog" aria-modal="true" aria-labelledby={idOtazky} data-testid="potvrzeni">
        <p className="otazka" id={idOtazky}>
          {text}
        </p>
        <div className="ovladani">
          <button type="button" className="vytvorit" onClick={onPotvrdit} autoFocus>
            {potvrdit}
          </button>
          <button type="button" onClick={onZrusit}>
            {zrusit}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
