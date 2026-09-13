import { createPortal } from "react-dom";
import { useZamekScrollu } from "../zamekScrollu.js";
import { useEffect, useRef, useState } from "react";
import {
  DATA_MODY,
  LOBBY_TYPY,
  SERVERY,
  VIDITELNOST,
  ZPOZDENI_DIVAKU,
  type NastaveniLobby as Nastaveni,
} from "../../../src/shared/lobbyKontrola.js";
import { MAX_HRACU, MIN_HRACU } from "../../../src/shared/sestava.js";
/** Ke zvolení Private patří kromě zatřesení a nadávky i zvuk. */
import debilUrl from "../assets/debil.mp3";
import { prehraj } from "../zvuk.js";

interface Props {
  /** Živé nastavení akce; pre-lobby klíče z něj okno čte a mění. */
  nastaveni: Nastaveni;
  /** Jméno, které dostane příští lobby — opisuje se do hry. */
  nazevLobby: string;
  /** Heslo večera, společné všem lobby akce; prázdné, dokud ho server nepošle. */
  heslo: string;
  onZmena: (nastaveni: Nastaveni) => void;
  /** Kostka u hesla: server vygeneruje nové pro lobby, které teprve vzniknou. Bez ní kostka není. */
  onNoveHeslo?: () => void;
  /** Při úpravě založeného zápasu jde jméno lobby přepsat; bez toho je jen ke čtení. */
  onNazev?: (nazevLobby: string) => void;
  onZavrit: () => void;
}

/**
 * Okno „Create Lobby“ ze hry, řádek po řádku: co Rob naklikal tady, to pak
 * opíše do hry. Proto je to modální okno a ne další sloupec v panelu —
 * zakládání lobby je jeden krok mimo běžné nastavování hry a nastaví se
 * jednou za večer.
 *
 * Hodnoty voleb jsou odečtené z herní nabídky (9. 9. 2026), včetně pořadí
 * serverů. „–“ všude znamená „je to jedno“, stejně jako v panelu nastavení.
 */
/** Jak dlouho se třese řádek, na kterém někdo zkusil nemožné. */
const DOBA_ZATRESENI_MS = 600;

export function PreLobby({ nastaveni: n, nazevLobby, heslo, onZmena, onNoveHeslo, onNazev, onZavrit }: Props) {
  useZamekScrollu();
  // Jméno lobby se ukládá až po dopsání (Enter nebo odchod z pole), ne po
  // každém písmenu — hostovi by jinak blikalo v okně Create Lobby.
  const [nazevRozepsany, setNazevRozepsany] = useState<string | null>(null);
  const ulozNazev = () => {
    if (!onNazev || nazevRozepsany === null) return;
    const cisty = nazevRozepsany.trim();
    if (cisty !== "" && cisty !== nazevLobby) onNazev(cisty);
    setNazevRozepsany(null);
  };
  const okno = useRef<HTMLDivElement>(null);
  const [dotceny, setDotceny] = useState<string | null>(null);
  const [vynadano, setVynadano] = useState(false);

  // Escape zavírá stejně jako kliknutí mimo okno — obojí je „nechci to“.
  useEffect(() => {
    const naKlavesu = (e: KeyboardEvent) => {
      if (e.key === "Escape") onZavrit();
    };
    window.addEventListener("keydown", naKlavesu);
    return () => window.removeEventListener("keydown", naKlavesu);
  }, [onZavrit]);

  // Zatřesení řádkem trvá chvilku; potom se třída zase sundá, aby šlo
  // zatřást znovu při dalším pokusu.
  useEffect(() => {
    if (dotceny === null) return;
    const casovac = setTimeout(() => setDotceny(null), DOBA_ZATRESENI_MS);
    return () => clearTimeout(casovac);
  }, [dotceny]);

  /** Volba, která se pro večer nehodí: zatřást řádkem, vynadat, pustit stopu. */
  const odmitni = (klic: string) => {
    setDotceny(klic);
    setVynadano(true);
    prehraj(debilUrl);
  };

  const cislo = (v: string) => (v === "" ? null : Number(v));
  const zmen = (cast: Partial<Nastaveni>) => onZmena({ ...n, ...cast });

  return createPortal(
    <div
      className="prelobby-stin"
      data-testid="prelobby-stin"
      onClick={(e) => {
        if (e.target === e.currentTarget) onZavrit();
      }}
    >
      <div className="prelobby-okno" role="dialog" aria-modal="true" aria-label="Pre-Lobby Nastavení" data-testid="prelobby" ref={okno}>
        <header className="hlavicka-akce">
          <h2>Create Lobby Nastavení</h2>
          <button type="button" className="zavrit" aria-label="Zavřít" onClick={onZavrit}>
            ✕
          </button>
        </header>
        {vynadano ? (
          <p className="prelobby-nadavka" role="alert" data-testid="prelobby-nadavka">
            A tak jseš debil, nebo co?
          </p>
        ) : null}

        <div className="radky">
          {/* Jméno lobby ani heslo nejsou předvolba — jméno patří příští lobby,
              heslo celému večeru; obojí Rob opíše do hry. Reset se jich netýká. */}
          <label className="radek" data-klic="nazevLobby">
            <span>Lobby Name:</span>
            {onNazev ? (
              <input
                type="text"
                value={nazevRozepsany ?? nazevLobby}
                maxLength={40}
                data-testid="prelobby-nazev"
                onChange={(e) => setNazevRozepsany(e.target.value)}
                onBlur={ulozNazev}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    ulozNazev();
                  }
                }}
              />
            ) : (
              <input type="text" value={nazevLobby} readOnly data-testid="prelobby-nazev" />
            )}
          </label>
          <label className="radek" data-klic="lobbyTyp">
            <span>Lobby Type:</span>
            {/* Bez „–“: nějaký typ lobby vybraný být musí, jinak to je chyba. */}
            <select value={n.lobbyTyp ?? ""} onChange={(e) => zmen({ lobbyTyp: cislo(e.target.value) })}>
              {Object.entries(LOBBY_TYPY).map(([v, nazev]) => (
                <option key={v} value={v}>
                  {nazev}
                </option>
              ))}
            </select>
          </label>
          {/* Private lobby zakáže diváky, takže by celý večer neměl kdo
              sledovat. Volba tu je jen proto, aby bylo vidět, že se s ní
              nepočítá: vybrat ji jde, ale hned se vrátí zpátky na Public. */}
          <label className={dotceny === "viditelnost" ? "radek zatrest" : "radek"} data-klic="viditelnost">
            <span>Visibility:</span>
            <select
              value={n.viditelnost ?? 0}
              onChange={(e) => {
                const v = cislo(e.target.value);
                if (v === 1) {
                  odmitni("viditelnost");
                  return;
                }
                zmen({ viditelnost: v });
              }}
            >
              {Object.entries(VIDITELNOST).map(([v, nazev]) => (
                <option key={v} value={v}>
                  {nazev}
                </option>
              ))}
            </select>
          </label>
          <label className="radek" data-klic="maxHracu">
            <span>Players:</span>
            <select value={n.maxHracu ?? ""} onChange={(e) => zmen({ maxHracu: cislo(e.target.value) })}>
              <option value="">–</option>
              {Array.from({ length: MAX_HRACU - MIN_HRACU + 1 }, (_, i) => i + MIN_HRACU).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          {/* Co-Op Campaign se pro večer nehodí vůbec: buď je vypnutá (a tak
              to má být), nebo je zapnutá a je to chyba. „Je to jedno“ nedává
              smysl, takže je to obyčejné zaškrtávátko. */}
          <label className="zaskrtavaci radek-cely" data-klic="coopKampan">
            <input type="checkbox" checked={n.coopKampan === true} onChange={(e) => zmen({ coopKampan: e.target.checked })} />
            Co-Op Campaign
          </label>
        </div>

        {/* Věta z herního okna: tohle jsou volby, které se po založení lobby
            už nedají změnit, takže se musí naklikat správně napoprvé. */}
        <p className="prelobby-varovani">These Settings can not be changed after game creation.</p>

        <div className="radky">
          <label className="radek" data-klic="heslo">
            <span>Set Password:</span>
            <span className="prelobby-heslo">
              {/* Dokud server heslo nepřipravil, hvězdičky — ať je vidět, že
                  tam něco bude, a ne prázdné pole. */}
              <input type="text" value={heslo === "" ? "****" : heslo} readOnly data-testid="prelobby-heslo" />
              {onNoveHeslo ? (
                <button type="button" className="kostka" title="Vygenerovat jiné heslo pro další lobby (založené si nechají své)" aria-label="Vygenerovat jiné heslo" onClick={onNoveHeslo}>
                  <Kostka />
                </button>
              ) : null}
            </span>
          </label>
          <div className={dotceny === "povolitDivaky" ? "radek prelobby-dvojice zatrest" : "radek prelobby-dvojice"}>
            {/* Bez diváků nemá Robovo vysílání koho pustit dovnitř, takže tohle
                zaškrtávátko nemá ani „je to jedno“, ani cestu k vypnutí. */}
            <label className="zaskrtavaci" data-klic="povolitDivaky">
              <input
                type="checkbox"
                checked={n.povolitDivaky !== false}
                onChange={(e) => {
                  if (!e.target.checked) {
                    odmitni("povolitDivaky");
                    return;
                  }
                  zmen({ povolitDivaky: true });
                }}
              />
              Allow Spectators
            </label>
            <Zaskrtavatko klic="skrytCivilizace" popis="Hide Civilizations" hodnota={n.skrytCivilizace} onZmena={(v) => zmen({ skrytCivilizace: v })} />
          </div>
          <label className="radek" data-klic="zpozdeniDivaku">
            <span>Spectator Delay:</span>
            <select value={n.zpozdeniDivaku ?? ""} onChange={(e) => zmen({ zpozdeniDivaku: cislo(e.target.value) })}>
              <option value="">–</option>
              {Object.entries(ZPOZDENI_DIVAKU).map(([v, nazev]) => (
                <option key={v} value={v}>
                  {nazev}
                </option>
              ))}
            </select>
          </label>
          <label className="radek" data-klic="server">
            <span>Server:</span>
            <select value={n.server ?? ""} onChange={(e) => zmen({ server: e.target.value === "" ? null : e.target.value })}>
              <option value="">–</option>
              {SERVERY.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="radek" data-klic="dataMod">
            <span>Data Mod:</span>
            {/* Hra nabízí jedinou možnost, takže tu není co nechávat otevřené. */}
            <select value={n.dataMod ?? ""} onChange={(e) => zmen({ dataMod: e.target.value === "" ? null : e.target.value })}>
              {DATA_MODY.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Zaškrtávátko se třemi stavy jako v panelu nastavení: vypnuto → zapnuto → „–“. */
function Zaskrtavatko({
  klic,
  popis,
  hodnota,
  onZmena,
}: {
  klic: string;
  popis: string;
  hodnota: boolean | null;
  onZmena: (v: boolean | null) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = hodnota === null;
  }, [hodnota]);
  return (
    <label className="zaskrtavaci" data-klic={klic}>
      <input
        ref={ref}
        type="checkbox"
        checked={hodnota === true}
        onChange={() => onZmena(hodnota === false ? true : hodnota === true ? null : false)}
      />
      {popis}
      {hodnota === null ? <span className="zaloha jedno-znak">–</span> : null}
    </label>
  );
}

/**
 * Kostka jednou barvou (currentColor), ne emoji: barevné 🎲 se do zlatého
 * panelu netrefí a v každém systému vypadá jinak.
 */
function Kostka() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="18" height="18" rx="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      {[
        [8, 8],
        [16, 8],
        [12, 12],
        [8, 16],
        [16, 16],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.7" fill="currentColor" />
      ))}
    </svg>
  );
}
