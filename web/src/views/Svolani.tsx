import { createPortal } from "react-dom";
import { useZamekScrollu } from "../zamekScrollu.js";

interface Props {
  /** Kdo zazvonil (jméno admina). */
  kdo: string;
  onJsemTu: () => void;
  onOdhlasit: () => void;
}

/**
 * Zvonek od admina: hráči vyskočí okno „{admin} tě shání!“. Zavře se jen
 * jedním ze dvou tlačítek — „Jsem tu!“ vrátí plnou lhůtu, „Odhlásit se
 * z akce“ hráče odhlásí. Kliknutí vedle ani Escape okno nezavřou (uživatel:
 * hráč má odpovědět, ne to odklepnout).
 */
export function Svolani({ kdo, onJsemTu, onOdhlasit }: Props) {
  useZamekScrollu();
  return createPortal(
    <div className="prelobby-stin" data-testid="svolani-stin">
      <div className="prelobby-okno svolani" role="alertdialog" aria-modal="true" aria-label={`${kdo} tě shání!`} data-testid="svolani">
        <p className="otazka">
          <strong>{kdo}</strong> tě shání!
        </p>
        <div className="ovladani">
          <button type="button" className="vytvorit" onClick={onJsemTu} autoFocus>
            Jsem tu!
          </button>
          <button type="button" onClick={onOdhlasit}>
            Odhlásit se z akce
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
