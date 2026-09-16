import { createPortal } from "react-dom";
import { useEffect } from "react";
import { useZamekScrollu } from "../zamekScrollu.js";
import { cesta } from "../cesty.js";
import steamIkona from "../assets/ui/prihlaseni-steam.webp";
import xboxIkona from "../assets/ui/prihlaseni-xbox.webp";

/**
 * Volba platformy při přihlášení. Dvě cesty se do záhlaví nevešly a vedle sebe
 * působily jako dvě různé akce — jsou to dvě cesty k téže. Odkazy, ne tlačítka:
 * obojí odsud vede pryč ze stránky.
 */
export function PrihlaseniOkno({ onZavrit }: { onZavrit: () => void }) {
  useZamekScrollu();
  useEffect(() => {
    const klavesa = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZavrit();
    };
    window.addEventListener("keydown", klavesa);
    return () => window.removeEventListener("keydown", klavesa);
  }, [onZavrit]);

  return createPortal(
    <div
      className="prelobby-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div className="prelobby-okno prihlaseni-okno" role="dialog" aria-modal="true" aria-label="Přihlášení">
        <h2>Přihlášení</h2>
        {/*
          Bez popisků pod štíty: znaky obou platforem jsou známé dost na to, aby
          se poznaly bez nápovědy, a text pod nimi z nich dělal formulář místo
          volby erbu. Jméno platformy nese `alt` obrázku, takže odkaz zůstává
          pojmenovaný pro čtečku i pro případ, že se obrázek nenačte.
        */}
        <div className="prihlaseni-volby">
          <a href={cesta("/api/auth/steam")}>
            <img src={steamIkona} alt="Přihlásit se přes Steam" width={512} height={512} />
          </a>
          <a href={cesta("/api/auth/microsoft")}>
            <img src={xboxIkona} alt="Přihlásit se přes Microsoft" width={512} height={512} />
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}
