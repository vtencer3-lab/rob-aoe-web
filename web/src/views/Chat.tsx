import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ZapasView, ZpravaView } from "../../../src/shared/types.js";

interface Props {
  zapas: ZapasView;
  /** Kdo se dívá — vlastní zprávy mají zvláštní třídu. */
  ja: string;
  onOdeslat: (text: string) => Promise<unknown> | void;
}

/** Nejdelší zpráva; totéž hlídá server i databáze. */
export const MAX_DELKA_ZPRAVY = 500;

/**
 * Admini mají v chatu každý svou barvu (přání uživatele: Rob výrazná fialová,
 * Jouki výrazná oranžová, Tonner cihlová). Kdo z adminů tu není, dostane
 * zlatou. Barvy samotné jsou v `:root` (`--chat-*`), tady jen klíče.
 */
export const ADMIN_BARVY: Readonly<Record<string, string>> = {
  "76561198147631465": "rob",
  "76561198014056480": "jouki",
  "76561198014710095": "tonner",
};

function tridaAutora(z: ZpravaView): string {
  if (z.jeAdmin) return `autor admin ${ADMIN_BARVY[z.steamId] ?? "admin-jiny"}`;
  return z.barva === null ? "autor" : `autor barva-${z.barva}`;
}

function cas(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Chat u zápasu: hráči zápasu a admini, nikdo jiný ho nevidí (redakce na
 * serveru). Zprávy chodí v celém stavu přes SSE, takže tady se jen kreslí
 * a odesílá; seznam se drží u dna, dokud si ho člověk sám neodroluje nahoru.
 * Jméno hráče má barvu jeho slotu, admin svou vlastní a září.
 */
export function Chat({ zapas, ja, onOdeslat }: Props) {
  const [text, setText] = useState("");
  const [odesila, setOdesila] = useState(false);
  const seznam = useRef<HTMLOListElement>(null);
  const uDna = useRef(true);
  const zpravy = zapas.zpravy ?? [];

  useEffect(() => {
    const el = seznam.current;
    if (el && uDna.current) el.scrollTop = el.scrollHeight;
  }, [zpravy.length]);

  const odesli = async (e: FormEvent) => {
    e.preventDefault();
    const cisty = text.trim();
    if (cisty === "" || odesila) return;
    setOdesila(true);
    try {
      await onOdeslat(cisty.slice(0, MAX_DELKA_ZPRAVY));
      setText("");
    } finally {
      setOdesila(false);
    }
  };

  return (
    <section className="chat" aria-label={`Chat zápasu #${zapas.poradi}`} data-testid="chat">
      <ol
        className="zpravy"
        ref={seznam}
        onScroll={(e) => {
          const el = e.currentTarget;
          uDna.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
        }}
      >
        {zpravy.length === 0 ? <li className="prazdno">Zatím ticho. Napiš první.</li> : null}
        {zpravy.map((z) => (
          <li key={z.id} className={z.steamId === ja ? "zprava moje" : "zprava"} data-testid="zprava">
            <time dateTime={z.poslano}>{cas(z.poslano)}</time>
            <span className={tridaAutora(z)}>{z.jmeno}</span>
            <span className="text">{z.text}</span>
          </li>
        ))}
      </ol>
      <form className="psani" onSubmit={(e) => void odesli(e)}>
        <input
          type="text"
          value={text}
          maxLength={MAX_DELKA_ZPRAVY}
          placeholder="Napsat do lobby…"
          aria-label="Zpráva do chatu"
          autoComplete="off"
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={odesila || text.trim() === ""}>
          Odeslat
        </button>
      </form>
    </section>
  );
}
