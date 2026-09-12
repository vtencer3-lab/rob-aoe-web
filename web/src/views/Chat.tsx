import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ZapasView, ZpravaView } from "../../../src/shared/types.js";

interface Props {
  zapas: ZapasView;
  /** Kdo se dívá — vlastní zprávy mají zvláštní třídu. */
  ja: string;
  onOdeslat: (text: string) => Promise<unknown> | void;
  /** Admin: křížek u zprávy ji smaže všem. */
  onSmazat?: (zpravaId: number) => Promise<unknown> | void;
  /** Debug mód: u zprávy jde přepnout autora na jiného admina — jen v prohlížeči, kvůli barvám. */
  ladeni?: boolean;
}

/** Jména adminů pro debug přepínač autora (barvy jsou v ADMIN_BARVY). */
const ADMIN_JMENA: Readonly<Record<string, string>> = {
  "76561198147631465": "Rob",
  "76561198014056480": "Jouki",
  "76561198014710095": "Tonner",
};

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
export function Chat({ zapas, ja, onOdeslat, onSmazat, ladeni }: Props) {
  const [text, setText] = useState("");
  const [odesila, setOdesila] = useState(false);
  const seznam = useRef<HTMLOListElement>(null);
  const uDna = useRef(true);
  // Kdo je odrolovaný nahoru, dostane místo skoku dolů jen značku, že dole
  // přibylo (uživatel: „indikace, že dole jsou nové zprávy“).
  const [noveDole, setNoveDole] = useState(false);
  // Debug: přepsaný autor zprávy (id zprávy → Steam ID admina), jen tady.
  const [prepsanyAutor, setPrepsanyAutor] = useState<Record<number, string>>({});
  const zpravy = (zapas.zpravy ?? []).map((z) => {
    const kdo = prepsanyAutor[z.id];
    return kdo ? { ...z, steamId: kdo, jmeno: ADMIN_JMENA[kdo] ?? kdo, jeAdmin: true, barva: null, tym: null } : z;
  });
  const posledniId = zpravy.at(-1)?.id ?? 0;

  useEffect(() => {
    const el = seznam.current;
    if (!el) return;
    if (uDna.current) el.scrollTop = el.scrollHeight;
    else if (zpravy.length > 0) setNoveDole(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posledniId]);

  const skocDolu = () => {
    const el = seznam.current;
    if (el) el.scrollTop = el.scrollHeight;
    uDna.current = true;
    setNoveDole(false);
  };

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
      <h3 className="chat-nadpis">Chat</h3>
      <ol
        className="zpravy"
        ref={seznam}
        onScroll={(e) => {
          const el = e.currentTarget;
          uDna.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
          if (uDna.current) setNoveDole(false);
        }}
      >
        {zpravy.length === 0 ? <li className="prazdno">Zatím ticho. Napiš první.</li> : null}
        {zpravy.map((z) => (
          <li key={z.id} className={z.steamId === ja ? "zprava moje" : "zprava"} data-testid="zprava">
            <time dateTime={z.poslano}>{cas(z.poslano)}</time>
            <span className={tridaAutora(z)}>{z.jmeno}</span>
            <span className="text">{z.text}</span>
            {ladeni ? (
              <select
                className="debug-autor"
                aria-label="Debug: autor zprávy"
                value={prepsanyAutor[z.id] ?? ""}
                onChange={(e) => setPrepsanyAutor((p) => ({ ...p, [z.id]: e.target.value }))}
              >
                <option value="">původní</option>
                {Object.entries(ADMIN_JMENA).map(([id, jmeno]) => (
                  <option key={id} value={id}>
                    {jmeno}
                  </option>
                ))}
              </select>
            ) : null}
            {onSmazat ? (
              <button type="button" className="smazat-zpravu" aria-label="Smazat zprávu" title="Smazat zprávu" onClick={() => void onSmazat(z.id)}>
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ol>
      {noveDole ? (
        <button type="button" className="nove-zpravy" onClick={skocDolu}>
          Nové zprávy ↓
        </button>
      ) : null}
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
