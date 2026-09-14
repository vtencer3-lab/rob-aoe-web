import { useEffect, useRef, useState } from "react";
import { nastavZtlumitAdminy, vytvorNahravani, ztlumitAdminy, type OdesliKousek } from "../hlas.js";

/* Ikony jako SVG v barvě textu (zlatá), ne emoji: emoji jsou malé a
   reproduktor modrý, což se k dřevu a zlatu nehodí (uživatel 13. 9. 2026). */
function IkonaMikrofon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="ikona">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M6 11a6 6 0 0 0 12 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 17v3M9 21h6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function IkonaReproduktor({ ztlumeno }: { ztlumeno: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="ikona">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      {ztlumeno ? (
        <path d="M16 9l5 6M21 9l-5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : (
        <>
          <path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

interface Props {
  /** Kam kousky nahrávky odcházejí (App → api.hlas pro tenhle zápas). */
  onKousek: OdesliKousek;
}

/**
 * Push-to-talk admina v hlavičce chatu (uživatel 13. 9. 2026): držet =
 * mluvit, účastníci zápasu slyší. Vedle je ztlumení ostatních adminů —
 * jen pro admina, hráčům se nic neztlumí.
 */
export function PushToTalk({ onKousek }: Props) {
  const [mluvi, setMluvi] = useState(false);
  const [chyba, setChyba] = useState<string | null>(null);
  const [ztlumeno, setZtlumeno] = useState(ztlumitAdminy);
  const nahravani = useRef<ReturnType<typeof vytvorNahravani> | null>(null);
  if (!nahravani.current) nahravani.current = vytvorNahravani(onKousek, setChyba);
  // Kdo pustí tlačítko mimo něj (nebo odpojí komponentu), musí přestat mluvit.
  useEffect(() => {
    const pust = () => {
      nahravani.current?.zastav();
      setMluvi(false);
    };
    window.addEventListener("pointerup", pust);
    window.addEventListener("pointercancel", pust);
    window.addEventListener("blur", pust);
    return () => {
      window.removeEventListener("pointerup", pust);
      window.removeEventListener("pointercancel", pust);
      window.removeEventListener("blur", pust);
      nahravani.current?.zastav();
    };
  }, []);

  return (
    <span className="push-to-talk" data-testid="push-to-talk">
      <button
        type="button"
        className={mluvi ? "ptt napoveda mluvi" : "ptt napoveda"}
        data-napoveda="Držet a mluvit — účastníci zápasu tě slyší"
        aria-pressed={mluvi}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.preventDefault();
          setChyba(null);
          setMluvi(true);
          void nahravani.current?.spust();
        }}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && !mluvi) {
            e.preventDefault();
            setMluvi(true);
            void nahravani.current?.spust();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === " " || e.key === "Enter") {
            nahravani.current?.zastav();
            setMluvi(false);
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <IkonaMikrofon />
        {mluvi ? <span className="nahrava" aria-hidden="true" /> : null}
        <span className="sr-only">{mluvi ? "Mluvím" : "Mluvit"}</span>
      </button>
      <button
        type="button"
        className={ztlumeno ? "ztlumit napoveda zapnuto" : "ztlumit napoveda"}
        data-napoveda="Mute tlačítko pouze pro ostatní adminy, aby nemuseli poslouchat tvůj otravnej hlas"
        aria-label={ztlumeno ? "Ostatní admini ztlumeni" : "Ztlumit ostatní adminy"}
        aria-pressed={ztlumeno}
        onClick={() => {
          const nove = !ztlumeno;
          setZtlumeno(nove);
          nastavZtlumitAdminy(nove);
        }}
      >
        <IkonaReproduktor ztlumeno={ztlumeno} />
      </button>
      {chyba ? (
        <small className="chyba" role="alert">
          {chyba}
        </small>
      ) : null}
    </span>
  );
}
