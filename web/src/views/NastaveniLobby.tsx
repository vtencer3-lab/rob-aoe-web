import { useEffect, useRef, useState } from "react";
import {
  AI_OBTIZNOSTI,
  doplnNastaveni,
  KONECNE_VEKY,
  ODKRYTI_MAPY,
  POCATECNI_VEKY,
  REZIMY,
  RYCHLOSTI,
  SADY_CIVILIZACI,
  SUROVINY,
  VELIKOSTI,
  VITEZSTVI,
  VYCHOZI_NASTAVENI,
  type NastaveniLobby as Nastaveni,
} from "../../../src/shared/lobbyKontrola.js";
import { MAPY } from "../../../src/shared/mapy.js";

interface Props {
  /** Živé nastavení u akce (jen část klíčů); zbytek doplní výchozí hodnoty. */
  zive: Record<string, unknown> | undefined;
  /** Snímek uložený tlačítkem; null nebo undefined = zatím nic. */
  ulozene: Record<string, unknown> | null | undefined;
  /** Každá změna v panelu — propíše se na server a přes SSE všem. */
  onZmena: (nastaveni: Nastaveni) => void;
  /** „Uložit nastavení lobby“: server si udělá snímek živého nastavení. */
  onUlozit: () => void;
}

/** Jak dlouho se čeká na další klik, než se změna pošle na server. */
export const ODKLAD_ZMENY_MS = 300;

const MAPY_PODLE_JMENA = Object.entries(MAPY)
  .map(([id, nazev]) => ({ id: Number(id), nazev }))
  .sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));

type KlicTrojstavu = "lockTeams" | "teamTogether" | "teamPositions" | "sharedExploration" | "lockSpeed" | "turbo" | "fullTechTree" | "empireWars" | "suddenDeath" | "regicide" | "antiquity" | "recordGame";

/** Zaškrtávátka přesně v pořadí a rozdělení, jak je má herní panel. */
const TEAM_SETTINGS: ReadonlyArray<{ klic: KlicTrojstavu; popis: string }> = [
  { klic: "lockTeams", popis: "Lock Teams" },
  { klic: "teamTogether", popis: "Team Together" },
  { klic: "teamPositions", popis: "Team Positions" },
  { klic: "sharedExploration", popis: "Shared Exploration" },
];
const ADVANCED_SETTINGS: ReadonlyArray<{ klic: KlicTrojstavu | "cheaty"; popis: string }> = [
  { klic: "lockSpeed", popis: "Lock Speed" },
  { klic: "cheaty", popis: "Allow Cheats" },
  { klic: "turbo", popis: "Turbo Mode" },
  { klic: "fullTechTree", popis: "Full Tech Tree" },
  { klic: "empireWars", popis: "Empire Wars Mode" },
  { klic: "suddenDeath", popis: "Sudden Death Mode" },
  { klic: "regicide", popis: "Regicide Mode" },
  { klic: "antiquity", popis: "Antiquity Mode" },
  { klic: "recordGame", popis: "Record Game" },
];

/** AI podle obtížnosti, ne podle čísla ve hře (to jde obráceně a Extreme má 5). */
const PORADI_AI = [4, 3, 2, 1, 0, 5];

function Vyber({ popis, hodnota, tabulka, jedno, poradi, onZmena }: { popis: string; hodnota: number | null; tabulka: Record<string, string>; jedno?: boolean; poradi?: number[]; onZmena: (v: number | null) => void }) {
  const polozky = poradi ? poradi.map((id) => [String(id), tabulka[id]!] as const) : Object.entries(tabulka);
  return (
    <label className="radek">
      <span>{popis}:</span>
      <select value={hodnota ?? ""} onChange={(e) => onZmena(e.target.value === "" ? null : Number(e.target.value))}>
        {jedno ? <option value="">–</option> : null}
        {polozky.map(([v, nazev]) => (
          <option key={v} value={v}>
            {nazev}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Zaškrtávátko se třemi stavy jako u herního panelu, jen navíc s „–“ (je to
 * jedno): kliknutí jde dokola vypnuto → zapnuto → „–“. Třetí stav kreslí
 * prohlížeč jako neurčité (indeterminate), vedle popisku je i „–“ textem.
 * Allow Cheats „–“ nemá: cheaty patří do hlavní kontroly.
 */
function Zaskrtavatko({ popis, hodnota, jedno, vypnuto = false, onZmena }: { popis: string; hodnota: boolean | null; jedno: boolean; vypnuto?: boolean; onZmena: (v: boolean | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = hodnota === null;
  }, [hodnota]);
  return (
    <label className={vypnuto ? "zaskrtavaci vypnute" : "zaskrtavaci"}>
      <input
        ref={ref}
        type="checkbox"
        disabled={vypnuto}
        checked={hodnota === true}
        onChange={() => onZmena(hodnota === false ? true : hodnota === true && jedno ? null : false)}
      />
      {popis}
      {hodnota === null ? <span className="zaloha jedno-znak">–</span> : null}
    </label>
  );
}

/**
 * Očekávané nastavení lobby pro kontrolu, rozložené stejně jako herní panel
 * Game Settings: řádky ve stejném pořadí, pod nimi Team Settings a Advanced
 * Settings ve dvou sloupcích. Host tak srovnává jedna ku jedné. U voleb
 * mimo hlavní kontrolu jde vybrat „–“: je to jedno, kontrola hodnotu jen
 * vypíše a nikdy ji neoznačí za chybu.
 *
 * Každá změna se propíše hned (s krátkým odkladem, ať psaní do čísla nepálí
 * požadavek na každou číslici) a přes SSE ji uvidí všichni. „Uložit“ dělá
 * snímek, ke kterému se „Načíst uložené“ vrátí; „Reset“ nasadí výchozí.
 */
export function NastaveniLobby({ zive, ulozene, onZmena, onUlozit }: Props) {
  const [n, setN] = useState<Nastaveni>(() => doplnNastaveni(zive as Partial<Nastaveni>));
  const casovac = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ceka = useRef(false);

  // Když přijde nový stav ze serveru (druhý admin něco přepnul), převzít ho —
  // pokud tu zrovna nečeká vlastní neodeslaná změna.
  useEffect(() => {
    if (!ceka.current) setN(doplnNastaveni(zive as Partial<Nastaveni>));
  }, [zive]);

  useEffect(() => () => clearTimeout(casovac.current), []);

  const zmen = (nove: Nastaveni, hned = false) => {
    setN(nove);
    clearTimeout(casovac.current);
    if (hned) {
      ceka.current = false;
      onZmena(nove);
      return;
    }
    ceka.current = true;
    casovac.current = setTimeout(() => {
      ceka.current = false;
      onZmena(nove);
    }, ODKLAD_ZMENY_MS);
  };

  const cislo = (v: string) => (v === "" ? null : Number(v));

  return (
    <form className="nastaveni-lobby" data-testid="nastaveni-lobby" onSubmit={(e) => e.preventDefault()}>
      <h3>Nastavení Lobby</h3>
      <div className="radky">
        <div className="radek" role="radiogroup" aria-label="Civilization Set">
          <span>Civilization Set:</span>
          <div className="prepinace">
            {[["", "–"], ...Object.entries(SADY_CIVILIZACI)].map(([v, nazev]) => (
              <label key={v}>
                <input
                  type="radio"
                  name="sadaCivilizaci"
                  value={v}
                  checked={(n.sadaCivilizaci ?? "") === (v === "" ? "" : Number(v))}
                  onChange={() => zmen({ ...n, sadaCivilizaci: cislo(v!) })}
                />
                {nazev}
              </label>
            ))}
          </div>
        </div>
        <Vyber popis="Game Mode" hodnota={n.rezim} tabulka={REZIMY} jedno onZmena={(v) => zmen({ ...n, rezim: v })} />
        <label className="radek">
          <span>Location:</span>
          <select value={n.mapaId ?? ""} onChange={(e) => zmen({ ...n, mapaId: cislo(e.target.value) })}>
            <option value="">libovolná</option>
            {MAPY_PODLE_JMENA.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nazev}
              </option>
            ))}
          </select>
        </label>
        <label className="radek">
          <span>Map Size:</span>
          <select value={n.velikost ?? ""} onChange={(e) => zmen({ ...n, velikost: cislo(e.target.value) })}>
            <option value="">podle počtu hráčů</option>
            {Object.entries(VELIKOSTI).map(([v, nazev]) => (
              <option key={v} value={v}>
                {nazev}
              </option>
            ))}
          </select>
        </label>
        <Vyber popis="AI Difficulty" hodnota={n.aiObtiznost} tabulka={AI_OBTIZNOSTI} jedno poradi={PORADI_AI} onZmena={(v) => zmen({ ...n, aiObtiznost: v })} />
        <Vyber popis="Resources" hodnota={n.suroviny} tabulka={SUROVINY} jedno onZmena={(v) => zmen({ ...n, suroviny: v })} />
        <label className="radek">
          <span>Population:</span>
          <input type="number" min={25} max={1000} step={25} value={n.populace} onChange={(e) => zmen({ ...n, populace: Number(e.target.value) })} />
        </label>
        <Vyber popis="Game Speed" hodnota={n.rychlost} tabulka={RYCHLOSTI} onZmena={(v) => zmen({ ...n, rychlost: v as 1 | 2 | 3 })} />
        <Vyber popis="Reveal Map" hodnota={n.odkrytiMapy} tabulka={ODKRYTI_MAPY} jedno onZmena={(v) => zmen({ ...n, odkrytiMapy: v })} />
        <Vyber popis="Starting Age" hodnota={n.pocatecniVek} tabulka={POCATECNI_VEKY} jedno onZmena={(v) => zmen({ ...n, pocatecniVek: v })} />
        <Vyber popis="Ending Age" hodnota={n.konecnyVek} tabulka={KONECNE_VEKY} jedno onZmena={(v) => zmen({ ...n, konecnyVek: v })} />
        <label className="radek">
          <span>Treaty Length:</span>
          <input type="number" min={0} max={180} step={5} value={n.primeri ?? ""} placeholder="– (je to jedno)" onChange={(e) => zmen({ ...n, primeri: cislo(e.target.value) })} />
        </label>
        <Vyber popis="Victory" hodnota={n.vitezstvi} tabulka={VITEZSTVI} onZmena={(v) => zmen({ ...n, vitezstvi: v as 1 | 9 })} />
      </div>

      <div className="sloupce">
        <fieldset>
          <legend>Team Settings</legend>
          {/* Team Positions jde ve hře zaškrtnout jen s Team Together; bez něj
              je zašedlé a kontrola ho bere jako „je to jedno“. */}
          {TEAM_SETTINGS.map(({ klic, popis }) => (
            <Zaskrtavatko
              key={klic}
              popis={popis}
              hodnota={n[klic]}
              jedno
              vypnuto={klic === "teamPositions" && n.teamTogether === false}
              onZmena={(v) => zmen(klic === "teamTogether" && v === false ? { ...n, teamTogether: false, teamPositions: null } : { ...n, [klic]: v })}
            />
          ))}
        </fieldset>
        <fieldset>
          <legend>Advanced Settings</legend>
          {ADVANCED_SETTINGS.map(({ klic, popis }) =>
            klic === "cheaty" ? (
              <Zaskrtavatko key={klic} popis={popis} hodnota={n.cheaty} jedno={false} onZmena={(v) => zmen({ ...n, cheaty: v === true })} />
            ) : (
              <Zaskrtavatko key={klic} popis={popis} hodnota={n[klic]} jedno onZmena={(v) => zmen({ ...n, [klic]: v })} />
            ),
          )}
        </fieldset>
      </div>
      {/* Uložit = snímek na serveru; Načíst uložené a Reset jen nasadí jiné
          živé nastavení (hned, bez odkladu). */}
      <div className="ovladani">
        <button type="button" onClick={onUlozit}>
          Uložit nastavení lobby
        </button>
        <button type="button" onClick={() => zmen({ ...VYCHOZI_NASTAVENI }, true)}>
          Reset nastavení
        </button>
        <button
          type="button"
          disabled={ulozene === null || ulozene === undefined}
          title={ulozene ? undefined : "Zatím nic uloženého"}
          onClick={() => zmen(doplnNastaveni(ulozene as Partial<Nastaveni>), true)}
        >
          Načíst uložené
        </button>
      </div>
    </form>
  );
}
