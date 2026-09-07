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
  type NastaveniLobby as Nastaveni,
} from "../../../src/shared/lobbyKontrola.js";
import { MAPY } from "../../../src/shared/mapy.js";

interface Props {
  /** Co je u akce uložené (jen část klíčů); zbytek doplní výchozí hodnoty. */
  ulozene: Record<string, unknown> | undefined;
  onUlozit: (nastaveni: Nastaveni) => void;
}

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

function Vyber({ popis, hodnota, tabulka, jedno, onZmena }: { popis: string; hodnota: number | null; tabulka: Record<string, string>; jedno?: boolean; onZmena: (v: number | null) => void }) {
  return (
    <label className="radek">
      <span>{popis}:</span>
      <select value={hodnota ?? ""} onChange={(e) => onZmena(e.target.value === "" ? null : Number(e.target.value))}>
        {jedno ? <option value="">–</option> : null}
        {Object.entries(tabulka).map(([v, nazev]) => (
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
function Zaskrtavatko({ popis, hodnota, jedno, onZmena }: { popis: string; hodnota: boolean | null; jedno: boolean; onZmena: (v: boolean | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = hodnota === null;
  }, [hodnota]);
  return (
    <label className="zaskrtavaci">
      <input
        ref={ref}
        type="checkbox"
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
 * vypíše a nikdy ji neoznačí za chybu. Rob si to nastaví jednou za večer.
 */
export function NastaveniLobby({ ulozene, onUlozit }: Props) {
  const [n, setN] = useState<Nastaveni>(() => doplnNastaveni(ulozene as Partial<Nastaveni>));
  // Když přijde nový stav ze serveru (jiné okno uložilo), převzít ho.
  useEffect(() => {
    setN(doplnNastaveni(ulozene as Partial<Nastaveni>));
  }, [ulozene]);

  const cislo = (v: string) => (v === "" ? null : Number(v));

  return (
    <form
      className="nastaveni-lobby"
      data-testid="nastaveni-lobby"
      onSubmit={(e) => {
        e.preventDefault();
        onUlozit(n);
      }}
    >
      <h3>Jak má vypadat lobby</h3>
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
                  onChange={() => setN({ ...n, sadaCivilizaci: cislo(v!) })}
                />
                {nazev}
              </label>
            ))}
          </div>
        </div>
        <Vyber popis="Game Mode" hodnota={n.rezim} tabulka={REZIMY} jedno onZmena={(v) => setN({ ...n, rezim: v })} />
        <label className="radek">
          <span>Location:</span>
          <select value={n.mapaId ?? ""} onChange={(e) => setN({ ...n, mapaId: cislo(e.target.value) })}>
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
          <select value={n.velikost ?? ""} onChange={(e) => setN({ ...n, velikost: cislo(e.target.value) })}>
            <option value="">podle počtu hráčů</option>
            {Object.entries(VELIKOSTI).map(([v, nazev]) => (
              <option key={v} value={v}>
                {nazev}
              </option>
            ))}
          </select>
        </label>
        <Vyber popis="AI Difficulty" hodnota={n.aiObtiznost} tabulka={AI_OBTIZNOSTI} jedno onZmena={(v) => setN({ ...n, aiObtiznost: v })} />
        <Vyber popis="Resources" hodnota={n.suroviny} tabulka={SUROVINY} jedno onZmena={(v) => setN({ ...n, suroviny: v })} />
        <label className="radek">
          <span>Population:</span>
          <input type="number" min={25} max={1000} step={25} value={n.populace} onChange={(e) => setN({ ...n, populace: Number(e.target.value) })} />
        </label>
        <Vyber popis="Game Speed" hodnota={n.rychlost} tabulka={RYCHLOSTI} onZmena={(v) => setN({ ...n, rychlost: v as 1 | 2 | 3 })} />
        <Vyber popis="Reveal Map" hodnota={n.odkrytiMapy} tabulka={ODKRYTI_MAPY} jedno onZmena={(v) => setN({ ...n, odkrytiMapy: v })} />
        <Vyber popis="Starting Age" hodnota={n.pocatecniVek} tabulka={POCATECNI_VEKY} jedno onZmena={(v) => setN({ ...n, pocatecniVek: v })} />
        <Vyber popis="Ending Age" hodnota={n.konecnyVek} tabulka={KONECNE_VEKY} jedno onZmena={(v) => setN({ ...n, konecnyVek: v })} />
        <label className="radek">
          <span>Treaty Length:</span>
          <input type="number" min={0} max={180} step={5} value={n.primeri ?? ""} placeholder="– (je to jedno)" onChange={(e) => setN({ ...n, primeri: cislo(e.target.value) })} />
        </label>
        <Vyber popis="Victory" hodnota={n.vitezstvi} tabulka={VITEZSTVI} onZmena={(v) => setN({ ...n, vitezstvi: v as 1 | 9 })} />
      </div>

      <div className="sloupce">
        <fieldset>
          <legend>Team Settings</legend>
          {TEAM_SETTINGS.map(({ klic, popis }) => (
            <Zaskrtavatko key={klic} popis={popis} hodnota={n[klic]} jedno onZmena={(v) => setN({ ...n, [klic]: v })} />
          ))}
        </fieldset>
        <fieldset>
          <legend>Advanced Settings</legend>
          {ADVANCED_SETTINGS.map(({ klic, popis }) =>
            klic === "cheaty" ? (
              <Zaskrtavatko key={klic} popis={popis} hodnota={n.cheaty} jedno={false} onZmena={(v) => setN({ ...n, cheaty: v === true })} />
            ) : (
              <Zaskrtavatko key={klic} popis={popis} hodnota={n[klic]} jedno onZmena={(v) => setN({ ...n, [klic]: v })} />
            ),
          )}
        </fieldset>
      </div>
      <p className="zaloha">„–“ = je to jedno: kontrola hodnotu jen vypíše. Zaškrtávátko se kliknutím přepíná vypnuto → zapnuto → „–“.</p>
      <button type="submit">Uložit nastavení lobby</button>
    </form>
  );
}
