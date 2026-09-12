import { useEffect } from "react";
import { useZamekScrollu } from "../zamekScrollu.js";

interface Props {
  /** Otázka, na kterou se odpovídá Ano/Ne. */
  text: string;
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
  useEffect(() => {
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZrusit();
      if (e.key === "Enter") onPotvrdit();
    };
    window.addEventListener("keydown", klavesa);
    return () => window.removeEventListener("keydown", klavesa);
  }, [onPotvrdit, onZrusit]);

  return (
    <div
      className="prelobby-stin"
      data-testid="potvrzeni-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZrusit();
      }}
    >
      <div className="prelobby-okno potvrzeni" role="alertdialog" aria-modal="true" aria-label={text} data-testid="potvrzeni">
        <p className="otazka">{text}</p>
        <div className="ovladani">
          <button type="button" className="vytvorit" onClick={onPotvrdit} autoFocus>
            {potvrdit}
          </button>
          <button type="button" onClick={onZrusit}>
            {zrusit}
          </button>
        </div>
      </div>
    </div>
  );
}
