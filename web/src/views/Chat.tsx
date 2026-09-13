import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ZapasView, ZpravaView } from "../../../src/shared/types.js";
import twitchBroadcasterUrl from "../assets/twitch-broadcaster.png";
import twitchModeratorUrl from "../assets/twitch-moderator.png";
import { jmenoHrace } from "../zapas.js";

interface Props {
  zapas: ZapasView;
  /** Kdo se dívá — vlastní zprávy mají zvláštní třídu. */
  ja: string;
  onOdeslat: (text: string) => Promise<unknown> | void;
  /** Šipka nahoru v prázdném poli: úprava vlastní poslední zprávy. */
  onUpravit?: (zpravaId: number, text: string) => Promise<unknown> | void;
  /** Admin: křížek u zprávy ji smaže všem. */
  onSmazat?: (zpravaId: number) => Promise<unknown> | void;
  /** Debug mód: u zprávy jde přepnout autora na jiného admina nebo hráče zápasu — jen v prohlížeči, kvůli barvám. */
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

/** Jak dlouho po tom, co člověk k oddělovači doroluje, ještě zůstane — musí přesáhnout animaci `oddelovac-bledne` (6 s), jinak řádek zmizí skokem. */
const ODDELOVAC_MS = 6_200;

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

/**
 * Oficiální odznaky Twitche (globální broadcaster a moderator, verze 1,
 * 72 px), stažené 13. 9. 2026 z Twitch CDN do assetů, ať jsou vždycky po ruce.
 */
const TWITCH_ODZNAK: Readonly<Record<"broadcaster" | "moderator", string>> = {
  broadcaster: twitchBroadcasterUrl,
  moderator: twitchModeratorUrl,
};

function OdznakTwitch({ role }: { role: "broadcaster" | "moderator" }) {
  const popis = role === "broadcaster" ? "Vysílající" : "Moderátor";
  return <img className={`twitch-odznak ${role}`} src={TWITCH_ODZNAK[role]} alt={popis} title={popis} width={18} height={18} data-testid={`twitch-${role}`} />;
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
  const oddelovac = useRef<HTMLLIElement>(null);
  const uDna = useRef(true);
  // Poslední zpráva, kterou člověk viděl u dna; co je za ní, je „nové“.
  const posledniVidene = useRef(0);
  const [noveDole, setNoveDole] = useState(false);
  // Po skoku dolů: čára „nové zprávy“ před první nepřečtenou. Zůstane, dokud
  // k ní člověk nedoroluje; pak ještě chvíli a zmizí.
  const [oddelovacOd, setOddelovacOd] = useState<number | null>(null);
  const [oddelovacBledne, setOddelovacBledne] = useState(false);
  // Debug: přepsaný autor zprávy (id zprávy → Steam ID admina nebo hráče), jen tady.
  const [prepsanyAutor, setPrepsanyAutor] = useState<Record<number, string>>({});
  const zpravy = (zapas.zpravy ?? []).map((z) => {
    const kdo = prepsanyAutor[z.id];
    if (!kdo) return z;
    if (ADMIN_JMENA[kdo]) return { ...z, steamId: kdo, jmeno: ADMIN_JMENA[kdo]!, jeAdmin: true, barva: null, tym: null };
    const hrac = zapas.ucastnici.find((u) => u.steamId === kdo);
    return hrac ? { ...z, steamId: kdo, jmeno: jmenoHrace(hrac), jeAdmin: false, barva: hrac.barva, tym: hrac.tym } : z;
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
      // Tlačítko a oddělovač vznikají spolu: kdo je odrolovaný, vidí obojí hned.
      setNoveDole(true);
      if (oddelovacOd === null) {
        setOddelovacOd(posledniVidene.current);
        setOddelovacBledne(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posledniId]);

  // Oddělovač zmizí až poté, co se dostane do výřezu seznamu (člověk k němu
  // doroloval), a ještě chvíli počká, ať jde přečíst, kde nové začínají.
  useEffect(() => {
    const cara = oddelovac.current;
    const el = seznam.current;
    if (oddelovacOd === null || !cara || !el || typeof IntersectionObserver === "undefined") return;
    let casovac: ReturnType<typeof setTimeout> | undefined;
    const pozorovatel = new IntersectionObserver(
      (zaznamy) => {
        if (!zaznamy.some((z) => z.isIntersecting)) return;
        pozorovatel.disconnect();
        setOddelovacBledne(true);
        casovac = setTimeout(() => {
          setOddelovacOd(null);
          setOddelovacBledne(false);
        }, ODDELOVAC_MS);
      },
      { root: el, threshold: 0.9 },
    );
    pozorovatel.observe(cara);
    return () => {
      pozorovatel.disconnect();
      clearTimeout(casovac);
    };
  }, [oddelovacOd]);

  // Po skoku dolů má být oddělovač vidět nahoře ve výřezu, ne pod ním — jinak
  // není vidět, odkud číst. Sjede se tedy k němu, ne na dno; když se pod ním
  // vejde všechno, je to zároveň dno.
  const skocDolu = () => {
    const od = posledniVidene.current;
    setOddelovacOd(od);
    setOddelovacBledne(false);
    uDna.current = true;
    posledniVidene.current = posledniId;
    setNoveDole(false);
    setTimeout(() => {
      const el = seznam.current;
      const cara = oddelovac.current;
      if (!el) return;
      // Do osmi zpráv se vejde všechno, tak rovnou na dno; jinak k oddělovači.
      const cil = cara && zpravy.length >= 8 ? Math.max(0, cara.offsetTop - el.offsetTop - 6) : el.scrollHeight;
      el.scrollTo({ top: Math.min(cil, el.scrollHeight), behavior: "smooth" });
    }, 0);
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

  const prvniNova = oddelovacOd === null ? null : (zpravy.find((z) => z.id > oddelovacOd)?.id ?? null);

  return (
    <section className={sbaleny ? "chat sbaleny" : "chat"} aria-label={`Chat zápasu #${zapas.poradi}`} data-testid="chat">
      {/* Hlavička je div, ne tlačítko: obecný vzhled tlačítek (podklad, hover)
          sem nepatří, má vypadat jako nadpis, na který se dá kliknout. */}
      <div
        className="chat-nadpis"
        role="button"
        tabIndex={0}
        aria-expanded={!sbaleny}
        onClick={() => setSbaleny((s) => !s)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setSbaleny((s) => !s);
          }
        }}
      >
        <span className="sipka" aria-hidden="true">
          {sbaleny ? "▸" : "▾"}
        </span>
        <span className="chat-titulek">Chat</span>
        {sbaleny && zpravy.length > 0 ? <small>{zpravy.length}</small> : null}
      </div>
      <div className="chat-telo" aria-hidden={sbaleny}>
        <div className="chat-vnitrek">
          <ol
            className="zpravy"
            ref={seznam}
            onScroll={(e) => {
              const el = e.currentTarget;
              uDna.current = el.scrollHeight - el.scrollTop - el.clientHeight < 8;
              if (uDna.current) {
                // Kdo se dolů doroloval sám, dostane oddělovač taky — ať ví, kde nové začínají.
                if (noveDole && oddelovacOd === null && posledniId > posledniVidene.current) {
                  setOddelovacOd(posledniVidene.current);
                  setOddelovacBledne(false);
                }
                posledniVidene.current = posledniId;
                setNoveDole(false);
              }
            }}
          >
            {zpravy.length === 0 ? <li className="prazdno">Zatím ticho. Napiš první.</li> : null}
            {zpravy.map((z) => {
              const role = z.jeAdmin ? TWITCH_ROLE[z.steamId] : undefined;
              const tridy = ["zprava", z.steamId === ja ? "moje" : "", upravovana === z.id ? "upravuje-se" : ""].filter(Boolean).join(" ");
              return (
                <Fragment key={z.id}>
                  {prvniNova === z.id ? (
                    <li ref={oddelovac} className={oddelovacBledne ? "oddelovac-novych bledne" : "oddelovac-novych"} aria-hidden="true" data-testid="oddelovac-novych">
                      <span>nové zprávy</span>
                    </li>
                  ) : null}
                  <li className={tridy} data-testid="zprava">
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
                        {zapas.ucastnici.map((u) => (
                          <option key={u.steamId} value={u.steamId}>
                            {jmenoHrace(u)}
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
                </Fragment>
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
