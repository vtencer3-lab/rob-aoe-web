import { aplikuj, oknoOd, otevri, posun, prefiltruj, slovoPodKurzorem, VIDITELNYCH, type Naseptavani } from "../naseptavac.js";
import { EMOTE_VYKRICNIK, obrazekEmotu, rozsekejNaEmoty, useEmoty, type Emote } from "../emoty.js";
import { cisloTauntu, TAUNTY } from "../../../src/shared/taunty.js";
import type { OdesliKousek } from "../hlas.js";
import { PushToTalk } from "./PushToTalk.js";
import { jeDulezita, textZpravy } from "../../../src/shared/cenzura.js";
import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ZapasView, ZpravaView } from "../../../src/shared/types.js";
import twitchBroadcasterUrl from "../assets/twitch-broadcaster.png";
import twitchModeratorUrl from "../assets/twitch-moderator.png";
import { jmenoHrace } from "../zapas.js";

interface Props {
  zapas: ZapasView;
  /** Kdo se dívá — vlastní zprávy mají zvláštní třídu. */
  ja: string;
  /** Odeslání; `odpovedNa` je id zprávy, na kterou se odpovídá (null = žádná). */
  onOdeslat: (text: string, odpovedNa: number | null) => Promise<unknown> | void;
  /** Šipka nahoru v prázdném poli: úprava vlastní poslední zprávy. */
  onUpravit?: (zpravaId: number, text: string) => Promise<unknown> | void;
  /** Admin: křížek u zprávy ji smaže všem. */
  onSmazat?: (zpravaId: number) => Promise<unknown> | void;
  /** Debug mód: u zprávy jde přepnout autora na jiného admina nebo hráče zápasu — jen v prohlížeči, kvůli barvám. */
  ladeni?: boolean;
  /** Admin: zpráva s vykřičníkem na začátku je důležitá (zvon všem, tučně); u hráče vykřičník nic nedělá. */
  jaAdmin?: boolean;
  /** Admin: push-to-talk — kam odcházejí kousky nahrávky (App → api.hlas). */
  onHlas?: OdesliKousek;
}

/** Jména adminů pro debug přepínač autora (barvy jsou v ADMIN_BARVY). */
const ADMIN_JMENA: Readonly<Record<string, string>> = {
  "76561198147631465": "Rob",
  "76561198014056480": "Jouki",
  "76561198014710095": "Tonner",
};

/** Které instance chatu (podle zápasu) jsou právě aspoň kouskem na obrazovce. */
const viditelneChaty = new Map<number, Set<symbol>>();

function oznacViditelnost(zapasId: number, klic: symbol, vidim: boolean): void {
  let mnozina = viditelneChaty.get(zapasId);
  if (!mnozina) {
    mnozina = new Set();
    viditelneChaty.set(zapasId, mnozina);
  }
  if (vidim) mnozina.add(klic);
  else mnozina.delete(klic);
}

function nekdoNaObrazovce(zapasId: number): boolean {
  return (viditelneChaty.get(zapasId)?.size ?? 0) > 0;
}

/** Fulltext v našeptávači (localStorage): hledat kdekoli ve jméně emotu. */
const KLIC_FULLTEXT = "chat.naseptavac-fulltext";
/** Jak dlouho bliká zpráva, na kterou se skočilo z náhledu odpovědi. */
const BLIKANI_MS = 2_000;

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
export function Chat({ zapas, ja, onOdeslat, onUpravit, onSmazat, ladeni, jaAdmin = false, onHlas }: Props) {
  const [text, setText] = useState("");
  const [odesila, setOdesila] = useState(false);
  // Šipka nahoru: upravovaná zpráva (id) — pole nese její text, Escape zruší.
  const [upravovana, setUpravovana] = useState<number | null>(null);
  // Našeptávání (naseptavac.ts): otevřený seznam, okno čtyř položek, fulltext.
  const [ac, setAc] = useState<Naseptavani | null>(null);
  const [oknoAc, setOknoAc] = useState(0);
  const [fulltext, setFulltext] = useState(() => {
    try {
      return localStorage.getItem(KLIC_FULLTEXT) === "1";
    } catch {
      return false;
    }
  });
  const vstup = useRef<HTMLInputElement>(null);
  // Odpověď na zprávu (migrace 026): pruh nad polem s náhledem původní.
  const [odpovidamNa, setOdpovidamNa] = useState<{ id: number; jmeno: string; text: string } | null>(null);
  // Zpráva, na kterou se právě skočilo z náhledu odpovědi — 2 s bliká.
  const [blika, setBlika] = useState<number | null>(null);
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

  // Chat se sám posouvá jen, když je aspoň kousek na obrazovce (uživatel
  // 13. 9. 2026): kdo ho má odrolovaný pryč (třeba na druhém monitoru pod
  // okrajem), by jinak přišel o místo, kde přestal číst. Neaktivní okno
  // nevadí — rozhoduje výřez, ne fokus. Admin má týž chat dvakrát (režie
  // a karta hráče): stačí, když je na obrazovce kterýkoli z nich, pak se
  // posouvají oba; „Nové zprávy“ dostane až ten, kdo není na žádném.
  const [naObrazovce, setNaObrazovce] = useState(true);
  const klicInstance = useRef(Symbol("chat"));
  useEffect(() => {
    const el = seznam.current;
    const zapasId = zapas.id;
    const klic = klicInstance.current;
    oznacViditelnost(zapasId, klic, true);
    if (!el || typeof IntersectionObserver === "undefined") return () => oznacViditelnost(zapasId, klic, false);
    const pozorovatel = new IntersectionObserver((zaznamy) => {
      const vidim = zaznamy.some((z) => z.isIntersecting);
      oznacViditelnost(zapasId, klic, vidim);
      setNaObrazovce(vidim);
    });
    pozorovatel.observe(el);
    return () => {
      pozorovatel.disconnect();
      oznacViditelnost(zapasId, klic, false);
    };
  }, [zapas.id]);

  useEffect(() => {
    const el = seznam.current;
    if (!el) return;
    if (uDna.current && nekdoNaObrazovce(zapas.id)) {
      el.scrollTop = el.scrollHeight;
      posledniVidene.current = posledniId;
    } else if (zpravy.length > 0 && posledniId > posledniVidene.current) {
      // Mimo obrazovku se chová jako odrolovaný: až se člověk vrátí, uvidí
      // „Nové zprávy“ a oddělovač.
      uDna.current = false;
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
    // Mimo obrazovku se blednutí nezačíná: kořen pozorovatele je seznam, ne
    // okno, takže by oddělovač „byl vidět“ i s chatem odrolovaným pryč a
    // zmizel by dřív, než se k němu člověk vrátí. Až chat přijede na
    // obrazovku, efekt se spustí znovu a oddělovač je vidět dole v okně.
    if (!naObrazovce) return;
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
  }, [oddelovacOd, naObrazovce]);

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
      else await onOdeslat(cisty.slice(0, MAX_DELKA_ZPRAVY), odpovidamNa?.id ?? null);
      setText("");
      setUpravovana(null);
      setOdpovidamNa(null);
      setAc(null);
    } finally {
      setOdesila(false);
    }
  };

  // Vloží položku našeptávače do textu a posune kurzor za ni (+ mezera).
  const pouzij = (stav: Naseptavani) => {
    const v = aplikuj(text, stav);
    setText(v.text);
    setAc(v.ac);
    setOknoAc((o) => oknoOd(v.ac.index, v.ac.matches.length, o));
    requestAnimationFrame(() => vstup.current?.setSelectionRange(v.pos, v.pos));
  };
  const jmenaUzivatelu = () => [...new Set([...zapas.ucastnici.map(jmenoHrace), ...zpravy.map((z) => z.jmeno)])];
  const prepniFulltext = () => {
    const f = !fulltext;
    setFulltext(f);
    try {
      localStorage.setItem(KLIC_FULLTEXT, f ? "1" : "0");
    } catch {
      // Bez úložiště platí jen do obnovení stránky.
    }
    if (ac) {
      setAc(prefiltruj(ac, emoty.keys(), f));
      setOknoAc(0);
    }
    vstup.current?.focus();
  };

  const klavesa = (e: KeyboardEvent<HTMLInputElement>) => {
    const pos = e.currentTarget.selectionStart ?? text.length;
    if (e.key === "Tab") {
      // Tab: otevřít a vložit první; další Taby cyklují (Shift zpátky).
      // Auto-otevřený seznam (@) první Tab jen potvrdí.
      e.preventDefault();
      const smer: 1 | -1 = e.shiftKey ? -1 : 1;
      if (ac && ac.end === pos) {
        pouzij(ac.applied ? posun(ac, smer) : ac);
        return;
      }
      const nove = otevri(text, pos, emoty.keys(), jmenaUzivatelu(), fulltext);
      if (nove) pouzij(nove);
      else setAc(null);
      return;
    }
    if (ac) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        pouzij(posun(ac, e.key === "ArrowDown" ? 1 : -1));
        return;
      }
      if (e.key === "ArrowRight" || e.key === "Escape") {
        // Text už je vložený, jen se zavře seznam.
        if (e.key === "Escape") e.preventDefault();
        setAc(null);
        return;
      }
      if (e.key === "Enter") {
        // U jména Enter jen zavře (zprávu neodešle); u emotu propadne k odeslání.
        if (ac.druh === "uzivatel") {
          e.preventDefault();
          if (!ac.applied) pouzij(ac);
        }
        setAc(null);
        return;
      }
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) setAc(null);
    }
    if (e.key === "ArrowUp" && text === "" && upravovana === null && onUpravit) {
      const moje = [...zpravy].reverse().find((z) => z.steamId === ja);
      if (!moje) return;
      e.preventDefault();
      setUpravovana(moje.id);
      setText(moje.text);
    } else if (e.key === "Escape" && odpovidamNa) {
      setOdpovidamNa(null);
    } else if (e.key === "Escape" && upravovana !== null) {
      setUpravovana(null);
      setText("");
    }
  };

  // @jméno se otevírá už při psaní (od „@“ + 1 znak); emoty jen na Tab.
  const zmenaTextu = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setText(v);
    const { slovo } = slovoPodKurzorem(v, e.target.selectionStart ?? v.length);
    if (slovo.startsWith("@") && slovo.length >= 2) {
      setAc(otevri(v, e.target.selectionStart ?? v.length, [], jmenaUzivatelu(), fulltext));
      setOknoAc(0);
    } else if (ac) {
      setAc(null);
    }
  };

  // Náhled odpovědi: skok na původní zprávu a 2 s bliknutí (jako UnityChat).
  const skocNaZpravu = (id: number) => {
    const el = seznam.current;
    const li = el?.querySelector<HTMLElement>(`li[data-zprava-id="${id}"]`);
    if (!el || !li) return;
    // Posouvá se jen seznam zpráv, ne celá stránka (scrollIntoView by hnul
    // i s ní); když je původní zpráva celá vidět, neposouvá se vůbec.
    const vrch = li.offsetTop - el.offsetTop;
    const spodek = vrch + li.offsetHeight;
    const vidim = vrch >= el.scrollTop && spodek <= el.scrollTop + el.clientHeight;
    if (!vidim) el.scrollTo({ top: Math.max(0, vrch - (el.clientHeight - li.offsetHeight) / 2), behavior: "smooth" });
    setBlika(null);
    requestAnimationFrame(() => setBlika(id));
    setTimeout(() => setBlika((b) => (b === id ? null : b)), BLIKANI_MS);
  };

  const prvniNova = oddelovacOd === null ? null : (zpravy.find((z) => z.id > oddelovacOd)?.id ?? null);
  // 7TV emoty Robova kanálu: slovo, které je jménem emotu, je obrázek.
  const emoty = useEmoty();

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
        {jaAdmin && onHlas ? (
          // Vpravo v hlavičce, mimo klik na sbalení.
          <span
            className="chat-nastroje"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <PushToTalk onKousek={onHlas} />
          </span>
        ) : null}
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
              const tridy = ["zprava", z.steamId === ja ? "moje" : "", upravovana === z.id ? "upravuje-se" : "", blika === z.id ? "blika" : ""].filter(Boolean).join(" ");
              return (
                <Fragment key={z.id}>
                  {prvniNova === z.id ? (
                    <li ref={oddelovac} className={oddelovacBledne ? "oddelovac-novych bledne" : "oddelovac-novych"} aria-hidden="true" data-testid="oddelovac-novych">
                      <span>nové zprávy</span>
                    </li>
                  ) : null}
                  <li className={tridy} data-testid="zprava" data-zprava-id={z.id}>
                    {z.odpovedNa ? (
                      // Náhled původní zprávy jako malý řádek nad celou zprávou
                      // (uživatel 14. 9. 2026), zarovnaný na sloupec jména.
                      <button
                        type="button"
                        className="odpoved-na"
                        title="Přejít na původní zprávu"
                        data-testid="odpoved-na"
                        onClick={() => skocNaZpravu(z.odpovedNa!.id)}
                      >
                        <span aria-hidden="true">↩</span> <b>@{z.odpovedNa.jmeno}</b> <span className="uryvek">{z.odpovedNa.text}</span>
                      </button>
                    ) : null}
                    <time dateTime={z.poslano}>{cas(z.poslano)}</time>
                    <span className={tridaAutora(z)}>
                      {role ? <OdznakTwitch role={role} /> : null}
                      {z.jmeno}
                    </span>
                    <span className={jeDulezita(z) ? "text dulezita" : "text"}>
                      <TextZpravy zprava={z} emoty={emoty} />
                      {z.upraveno ? <small className="editovano">(editováno)</small> : null}
                    </span>
                    <span className="akce">
                      <button
                        type="button"
                        className="odpovedet"
                        aria-label={`Odpovědět na zprávu ${z.jmeno}`}
                        title="Odpovědět"
                        onClick={() => {
                          setOdpovidamNa({ id: z.id, jmeno: z.jmeno, text: textZpravy(z) });
                          vstup.current?.focus();
                        }}
                      >
                        ↩
                      </button>
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
                    </span>
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
          <div className="psani-obal">
          {odpovidamNa ? (
            <div className="odpoved-lista" data-testid="odpoved-lista">
              <span className="popisek">
                Odpověď pro <b>{odpovidamNa.jmeno}</b>
              </span>
              <span className="uryvek">{odpovidamNa.text}</span>
              <button type="button" className="zrusit" aria-label="Zrušit odpověď" title="Zrušit (Escape)" onClick={() => setOdpovidamNa(null)}>
                ×
              </button>
            </div>
          ) : null}
          {ac ? (
            <div className="naseptavac" data-testid="naseptavac" role="listbox" aria-label="Našeptávání">
              {ac.druh === "emote" ? (
                <label className="fulltext" onMouseDown={(e) => e.preventDefault()}>
                  <input type="checkbox" checked={fulltext} onChange={prepniFulltext} /> Fulltext
                </label>
              ) : null}
              {ac.matches.slice(oknoAc, oknoAc + VIDITELNYCH).map((m, i) => {
                const idx = oknoAc + i;
                const em = emoty.get(m);
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={idx === ac.index}
                    key={m}
                    className={idx === ac.index ? "polozka vybrana" : "polozka"}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      pouzij({ ...ac, index: idx });
                      vstup.current?.focus();
                    }}
                  >
                    {em ? <img src={obrazekEmotu(em, 1)} alt="" /> : <span className="tecka" aria-hidden="true" />}
                    <span className="jmeno">{m}</span>
                    <span className="zdroj">{em ? "7TV" : "hráč"}</span>
                  </button>
                );
              })}
              {ac.matches.length > VIDITELNYCH ? (
                <div className="pocet">
                  {ac.index + 1} / {ac.matches.length}
                </div>
              ) : null}
            </div>
          ) : null}
          <form className={upravovana !== null ? "psani upravuje" : "psani"} onSubmit={(e) => void odesli(e)}>
            <input
              ref={vstup}
              type="text"
              value={text}
              maxLength={MAX_DELKA_ZPRAVY}
              placeholder={upravovana !== null ? "Upravit zprávu… (Escape zruší)" : odpovidamNa ? "Odpověď… (Escape zruší)" : "Napsat do lobby…"}
              aria-label="Zpráva do chatu"
              autoComplete="off"
              onChange={zmenaTextu}
              onKeyDown={klavesa}
              onBlur={() => setAc(null)}
            />
            <button type="submit" disabled={odesila || text.trim() === ""}>
              {upravovana !== null ? "Uložit" : "Odeslat"}
            </button>
          </form>
          </div>
          {jaAdmin && text.startsWith("!") ? (
            <small className="dulezita-poznamka" data-testid="dulezita-poznamka">
              Důležitá zpráva — všem v lobby zazvoní zvon a bude tučně.
            </small>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * Text zprávy s emoty a taunty (uživatel 13. 9. 2026):
 * - samotný vykřičník od admina (důležitá zpráva bez textu) = emote DinkDonk,
 *   o kus větší — jinak by po odebrání vykřičníku nezbylo nic k vidění;
 * - zpráva, která je jen číslem tauntu ze hry, = „11 Laugh“ jako ve hře;
 * - jinak slova, která jsou jménem emotu ze sady, jako obrázky z CDN 7TV.
 */
function TextZpravy({ zprava, emoty }: { zprava: { jeAdmin: boolean; text: string }; emoty: Map<string, Emote> }) {
  const text = textZpravy(zprava);
  if (jeDulezita(zprava) && text === "") {
    const dink = emoty.get(EMOTE_VYKRICNIK);
    return dink ? <ObrazekEmotu emote={dink} velky /> : <>!</>;
  }
  const taunt = cisloTauntu(zprava.text);
  if (taunt !== null) {
    return (
      <span className="taunt" data-testid="taunt">
        <b>{taunt}</b> {TAUNTY[taunt]}
      </span>
    );
  }
  return (
    <>
      {rozsekejNaEmoty(text, emoty).map((kus, i) =>
        kus.typ === "emote" ? <ObrazekEmotu key={i} emote={kus.emote} vrstvy={kus.vrstvy} /> : <Fragment key={i}>{kus.text}</Fragment>,
      )}
    </>
  );
}

function ObrazekEmotu({ emote, velky = false, vrstvy = [] }: { emote: Emote; velky?: boolean; vrstvy?: Emote[] }) {
  const tridy = ["emote", emote.siroky ? "siroky" : "", velky ? "velky" : ""].filter(Boolean).join(" ");
  const obrazek = <img className={tridy} src={obrazekEmotu(emote, velky ? 3 : 2)} alt={emote.jmeno} title={emote.jmeno} loading="lazy" decoding="async" />;
  if (vrstvy.length === 0) return obrazek;
  // Zero-width vrstvy leží přes základní emote; popisek nese všechna jména.
  const jmena = [emote.jmeno, ...vrstvy.map((v) => v.jmeno)].join(" + ");
  return (
    <span className="emote-obal" title={jmena} data-testid="emote-obal">
      {obrazek}
      {vrstvy.map((v, i) => (
        <img key={i} className="emote vrstva" src={obrazekEmotu(v, 2)} alt={v.jmeno} loading="lazy" decoding="async" />
      ))}
    </span>
  );
}
