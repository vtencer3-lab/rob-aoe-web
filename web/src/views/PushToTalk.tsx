import { useEffect, useRef, useState } from "react";
import { nastavZtlumitAdminy, vytvorNahravani, ztlumitAdminy, type OdesliKousek } from "../hlas.js";

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
        className={mluvi ? "ptt mluvi" : "ptt"}
        title="Držet a mluvit — účastníci zápasu tě slyší"
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
        <span aria-hidden="true">🎙</span> {mluvi ? "Mluvím…" : "Mluvit"}
      </button>
      <button
        type="button"
        className={ztlumeno ? "ztlumit zapnuto" : "ztlumit"}
        title="Mute tlačítko pouze pro ostatní adminy, aby nemuseli poslouchat tvůj otravnej hlas"
        aria-label={ztlumeno ? "Ostatní admini ztlumeni" : "Ztlumit ostatní adminy"}
        aria-pressed={ztlumeno}
        onClick={() => {
          const nove = !ztlumeno;
          setZtlumeno(nove);
          nastavZtlumitAdminy(nove);
        }}
      >
        <span aria-hidden="true">{ztlumeno ? "🔇" : "🔊"}</span>
      </button>
      {chyba ? (
        <small className="chyba" role="alert">
          {chyba}
        </small>
      ) : null}
    </span>
  );
}
