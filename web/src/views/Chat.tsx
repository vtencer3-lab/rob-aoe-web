import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ZapasView, ZpravaView } from "../../../src/shared/types.js";

interface Props {
  zapas: ZapasView;
  /** Kdo se dívá — vlastní zprávy mají zvláštní třídu. */
  ja: string;
  onOdeslat: (text: string) => Promise<unknown> | void;
  /** Šipka nahoru v prázdném poli: úprava vlastní poslední zprávy. */
  onUpravit?: (zpravaId: number, text: string) => Promise<unknown> | void;
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

/** Událost okna, kterou režie sbalí chat zápasu (detail = id zápasu). */
export const UDALOST_SBALIT_CHAT = "aoe:sbalit-chat";

/** Nejdelší zpráva; totéž hlídá server i databáze. */
export const MAX_DELKA_ZPRAVY = 500;

/** Jak dlouho po skoku dolů zůstanou nové zprávy zvýrazněné (3 s drží, 1,5 s bledne). */
const ZVYRAZNENI_MS = 4_600;

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

/** Twitch role u jména: Rob vysílá, Jouki a Tonner moderují. */
const TWITCH_ROLE: Readonly<Record<string, "broadcaster" | "moderator">> = {
  "76561198147631465": "broadcaster",
  "76561198014056480": "moderator",
  "76561198014710095": "moderator",
};

/** Odznak jako na Twitchi, kreslený tady (žádný cizí obrázek): kamera pro vysílajícího, meč pro moderátora. */
function OdznakTwitch({ role }: { role: "broadcaster" | "moderator" }) {
  const popis = role === "broadcaster" ? "Vysílající" : "Moderátor";
  return (
    <svg className={`twitch-odznak ${role}`} viewBox="0 0 18 18" width="16" height="16" role="img" aria-label={popis} data-testid={`twitch-${role}`}>
      <title>{popis}</title>
      <rect x="0" y="0" width="18" height="18" rx="3" />
      {role === "broadcaster" ? (
        <path d="M3.5 5.5h7a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1zm8.5 2.2 3-1.7v6l-3-1.7z" fill="#fff" />
      ) : (
        <path d="M13.2 3.3 15 5.1 8.6 11.5l1.1 1.1-1.3 1.3-1.1-1.1-1.5 1.5-1.4-1.4 1.5-1.5-1.1-1.1 1.3-1.3 1.1 1.1z" fill="#fff" />
      )}
    </svg>
  );
}

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
export function Chat({ zapas, ja, onOdeslat, onUpravit, onSmazat, ladeni }: Props) {
  const [text, setText] = useState("");
  const [odesila, setOdesila] = useState(false);
  // Šipka nahoru: upravovaná zpráva (id) — pole nese její text, Escape zruší.
  const [upravovana, setUpravovana] = useState<number | null>(null);
  const seznam = useRef<HTMLOListElement>(null);
  const uDna = useRef(true);
  // Poslední zpráva, kterou člověk viděl u dna; co je za ní, je „nové“.
  const posledniVidene = useRef(0);
  const [noveDole, setNoveDole] = useState(false);
  // Po skoku dolů: od které zprávy zvýraznit, ať je vidět, odkud číst.
  const [zvyraznitOd, setZvyraznitOd] = useState<number | null>(null);
  // Debug: přepsaný autor zprávy (id zprávy → Steam ID admina), jen tady.
  const [prepsanyAutor, setPrepsanyAutor] = useState<Record<number, string>>({});
  const zpravy = (zapas.zpravy ?? []).map((z) => {
    const kdo = prepsanyAutor[z.id];
    return kdo ? { ...z, steamId: kdo, jmeno: ADMIN_JMENA[kdo] ?? kdo, jeAdmin: true, barva: null, tym: null } : z;
  });
  const posledniId = zpravy.at(-1)?.id ?? 0;
  const novychPocet = zpravy.filter((z) => z.id > posledniVidene.current).length;

  useEffect(() => {
    const el = seznam.current;
    if (!el) return;
    if (uDna.current) {
      el.scrollTop = el.scrollHeight;
      posledniVidene.current = posledniId;
    } else if (zpravy.length > 0 && posledniId > posledniVidene.current) {
      setNoveDole(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posledniId]);

  useEffect(() => {
    if (zvyraznitOd === null) return;
    const casovac = setTimeout(() => setZvyraznitOd(null), ZVYRAZNENI_MS);
    return () => clearTimeout(casovac);
  }, [zvyraznitOd]);

  const skocDolu = () => {
    const el = seznam.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setZvyraznitOd(posledniVidene.current);
    uDna.current = true;
    posledniVidene.current = posledniId;
    setNoveDole(false);
  };
  // Sbalený chat: hlavička zůstane, zprávy i psaní se schovají (s animací).
  // Kliknutí na Spectate v režii ho sbalí samo — Rob jde do hry a chat mu
  // v tu chvíli jen zabírá místo (uživatel: „při kliknutí na Spectate se
  // chat automaticky collapsne“).
  const [sbaleny, setSbaleny] = useState(false);
  useEffect(() => {
    const sbal = (e: Event) => {
      const id = (e as CustomEvent<number>).detail;
      if (id === zapas.id || id === undefined) setSbaleny(true);
    };
    window.addEventListener(UDALOST_SBALIT_CHAT, sbal);
    return () => window.removeEventListener(UDALOST_SBALIT_CHAT, sbal);
  }, [zapas.id]);

  const odesli = async (e: FormEvent) => {
    e.preventDefault();
    const cisty = text.trim();
    if (cisty === "" || odesila) return;
    setOdesila(true);
    try {
      if (upravovana !== null && onUpravit) await onUpravit(upravovana, cisty.slice(0, MAX_DELKA_ZPRAVY));
      else await onOdeslat(cisty.slice(0, MAX_DELKA_ZPRAVY));
      setText("");
      setUpravovana(null);
    } finally {
      setOdesila(false);
    }
  };

  const klavesa = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp" && text === "" && upravovana === null && onUpravit) {
      const moje = [...zpravy].reverse().find((z) => z.steamId === ja);
      if (!moje) return;
      e.preventDefault();
      setUpravovana(moje.id);
      setText(moje.text);
    } else if (e.key === "Escape" && upravovana !== null) {
      setUpravovana(null);
      setText("");
    }
  };

  return (
    <section className={sbaleny ? "chat sbaleny" : "chat"} aria-label={`Chat zápasu #${zapas.poradi}`} data-testid="chat">
      <button type="button" className="chat-nadpis" aria-expanded={!sbaleny} onClick={() => setSbaleny((s) => !s)}>
        <span className="sipka" aria-hidden="true">
          {sbaleny ? "▸" : "▾"}
        </span>
        <span className="chat-titulek">Chat</span>
        {sbaleny && zpravy.length > 0 ? <small>{zpravy.length}</small> : null}
      </button>
      <div className="chat-telo" aria-hidden={sbaleny}>
        <div className="chat-vnitrek">
          <ol
            className="zpravy"
            ref={seznam}
            onScroll={(e) => {
              const el = e.currentTarget;
              uDna.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
              if (uDna.current) {
                posledniVidene.current = posledniId;
                setNoveDole(false);
              }
            }}
          >
            {zpravy.length === 0 ? <li className="prazdno">Zatím ticho. Napiš první.</li> : null}
            {zpravy.map((z) => {
              const role = z.jeAdmin ? TWITCH_ROLE[z.steamId] : undefined;
              const tridy = ["zprava", z.steamId === ja ? "moje" : "", zvyraznitOd !== null && z.id > zvyraznitOd ? "nova" : "", upravovana === z.id ? "upravuje-se" : ""]
                .filter(Boolean)
                .join(" ");
              return (
                <li key={z.id} className={tridy} data-testid="zprava">
                  <time dateTime={z.poslano}>{cas(z.poslano)}</time>
                  <span className={tridaAutora(z)}>
                    {role ? <OdznakTwitch role={role} /> : null}
                    {z.jmeno}
                  </span>
                  <span className="text">
                    {z.text}
                    {z.upraveno ? <small className="editovano">(editováno)</small> : null}
                  </span>
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
              );
            })}
          </ol>
          {noveDole ? (
            <div className="nove-zpravy-radek">
              <button type="button" className="nove-zpravy" onClick={skocDolu}>
                Nové zprávy{novychPocet > 0 ? ` (${novychPocet})` : ""} ↓
              </button>
            </div>
          ) : null}
          <form className={upravovana !== null ? "psani upravuje" : "psani"} onSubmit={(e) => void odesli(e)}>
            <input
              type="text"
              value={text}
              maxLength={MAX_DELKA_ZPRAVY}
              placeholder={upravovana !== null ? "Upravit zprávu… (Escape zruší)" : "Napsat do lobby…"}
              aria-label="Zpráva do chatu"
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={klavesa}
            />
            <button type="submit" disabled={odesila || text.trim() === ""}>
              {upravovana !== null ? "Uložit" : "Odeslat"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
