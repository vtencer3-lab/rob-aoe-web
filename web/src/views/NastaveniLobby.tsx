import { useEffect, useRef, useState } from "react";
import {
  AI_OBTIZNOSTI,
  doplnNastaveni,
  KONECNE_VEKY,
  ODKRYTI_MAPY,
  POCATECNI_VEKY,
  PRIMERI,
  REZIM_EMPIRE_WARS,
  REZIMY,
  ZASKRTAVATKO_REZIMU,
  RYCHLOSTI,
  SADY_CIVILIZACI,
  SUROVINY,
  VELIKOSTI,
  VITEZSTVI,
  VYCHOZI_NASTAVENI,
  type NastaveniLobby as Nastaveni,
} from "../../../src/shared/lobbyKontrola.js";
import { MAPY } from "../../../src/shared/mapy.js";
import { blikni } from "../historie.js";

interface Props {
  /** Živé nastavení u akce (jen část klíčů); zbytek doplní výchozí hodnoty. */
  zive: Record<string, unknown> | undefined;
  /** Snímek uložený tlačítkem; null nebo undefined = zatím nic. */
  ulozene: Record<string, unknown> | null | undefined;
  /** Každá změna v panelu — propíše se na server a přes SSE všem. */
  onZmena: (nastaveni: Nastaveni) => void;
  /** „Uložit preset lobby“: server si udělá snímek živého nastavení. */
  onUlozit: () => void;
  /** Klíč nastavení ke zvýraznění po změně / zpět / znovu. */
  zvyraznit?: { cil: string | null; cas: number } | null;
}

/**
 * Mají se ukazovat tlačítka na uložení a načtení presetu? Od 9. 9. 2026 ne —
 * schované, ne smazané, aby šla funkce vrátit jedním přepnutím.
 */
const PRESETY_VIDET = false;

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

/** AI podle obtížnosti, ne podle čísla ve hře (to jde obráceně a Extreme má −1). */
const PORADI_AI = [4, 3, 2, 1, 0, -1];

/**
 * Co s nastavením udělá přepnutí na Empire Wars — ověřeno 9. 9. 2026 na
 * živé lobby: `Starting Age` = Feudal, `Victory` = Standard a odškrtnuté
 * modifikátory hry (Empire Wars, Regicide, Allow Cheats, Turbo Mode, Full
 * Tech Tree, Sudden Death). Antiquity zůstává, jak bylo.
 *
 * Zamyká se jedině zaškrtávátko Empire Wars — to už režim obsahuje.
 * S ostatními se dá po přepnutí dál hýbat, tak to dělá i panel.
 */
const NASTAVENI_EMPIRE_WARS = {
  empireWars: false as boolean | null,
  regicide: false as boolean | null,
  cheaty: false,
  turbo: false as boolean | null,
  fullTechTree: false as boolean | null,
  suddenDeath: false as boolean | null,
  pocatecniVek: 3,
  vitezstvi: 9 as 1 | 9,
};

function Vyber({ klic, popis, hodnota, tabulka, jedno, poradi, onZmena }: { klic: string; popis: string; hodnota: number | null; tabulka: Record<string, string>; jedno?: boolean; poradi?: number[]; onZmena: (v: number | null) => void }) {
  const polozky = poradi ? poradi.map((id) => [String(id), tabulka[id]!] as const) : Object.entries(tabulka);
  return (
    <label className="radek" data-klic={klic}>
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
 * jedno): levé tlačítko jde dokola vypnuto → zapnuto → „–“, pravé tlačítko
 * stejný kruh pozpátku (zapnuto → vypnuto, „–“ → zapnuto). Třetí stav kreslí
 * prohlížeč jako neurčité (indeterminate), vedle popisku je i „–“ textem.
 * Allow Cheats „–“ nemá: cheaty patří do hlavní kontroly.
 */
function Zaskrtavatko({ klic, popis, hodnota, jedno, vypnuto = false, onZmena }: { klic: string; popis: string; hodnota: boolean | null; jedno: boolean; vypnuto?: boolean; onZmena: (v: boolean | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = hodnota === null;
  }, [hodnota]);
  const dopredu = () => onZmena(hodnota === false ? true : hodnota === true && jedno ? null : false);
  const pozpatku = () => onZmena(hodnota === true ? false : hodnota === null ? true : jedno ? null : true);
  return (
    <label
      className={vypnuto ? "zaskrtavaci vypnute" : "zaskrtavaci"}
      data-klic={klic}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!vypnuto) pozpatku();
      }}
    >
      <input ref={ref} type="checkbox" disabled={vypnuto} checked={hodnota === true} onChange={dopredu} />
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
 * snímek, ke kterému se „Načíst uložený preset“ vrátí; „Reset“ nasadí výchozí.
 */
export function NastaveniLobby({ zive, ulozene, onZmena, onUlozit, zvyraznit }: Props) {
  const [n, setN] = useState<Nastaveni>(() => doplnNastaveni(zive as Partial<Nastaveni>));
  const casovac = useRef<ReturnType<typeof setTimeout>>(undefined);
  const ceka = useRef(false);
  const formular = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (zvyraznit?.cil) blikni(formular.current?.querySelector(`[data-klic="${zvyraznit.cil}"]`));
  }, [zvyraznit]);

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
  const stejne = (a: Nastaveni, b: Nastaveni) => (Object.keys(a) as Array<keyof Nastaveni>).every((k) => (a[k] ?? null) === (b[k] ?? null));
  const jakoUlozene = ulozene !== null && ulozene !== undefined && stejne(n, doplnNastaveni(ulozene as Partial<Nastaveni>));
  const jakoVychozi = stejne(n, VYCHOZI_NASTAVENI);

  return (
    <form className="nastaveni-lobby" data-testid="nastaveni-lobby" onSubmit={(e) => e.preventDefault()} ref={formular}>
      {/* Nadpis nese záhlaví panelu (SpravaAkce), tady by stál dvakrát. */}
      <div className="radky">
        <div className="radek" role="radiogroup" aria-label="Civilization Set" data-klic="sadaCivilizaci">
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
        {/* Empire Wars si režim nastaví po svém — ověřeno naživo z lobby:
            zaškrtávátko odškrtne a zamkne, Starting Age přehodí na Feudal a
            Victory na Standard. Při odchodu z režimu se nic nevrací, stejně
            jako ve hře: co je nastavené, zůstane. */}
        <Vyber
          klic="rezim"
          popis="Game Mode"
          hodnota={n.rezim}
          tabulka={REZIMY}
          jedno
          onZmena={(v) => {
            if (v === REZIM_EMPIRE_WARS) return zmen({ ...n, ...NASTAVENI_EMPIRE_WARS, rezim: v });
            // Ostatní režimy s vlastním zaškrtávátkem ho jen shodí (Regicide).
            const svoje = v === null ? undefined : ZASKRTAVATKO_REZIMU[v];
            zmen(svoje ? { ...n, rezim: v, [svoje]: false } : { ...n, rezim: v });
          }}
        />
        <label className="radek" data-klic="mapaId">
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
        <label className="radek" data-klic="velikost">
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
        <Vyber klic="aiObtiznost" popis="AI Difficulty" hodnota={n.aiObtiznost} tabulka={AI_OBTIZNOSTI} jedno poradi={PORADI_AI} onZmena={(v) => zmen({ ...n, aiObtiznost: v })} />
        <Vyber klic="suroviny" popis="Resources" hodnota={n.suroviny} tabulka={SUROVINY} jedno onZmena={(v) => zmen({ ...n, suroviny: v })} />
        <label className="radek" data-klic="populace">
          <span>Population:</span>
          <input type="number" min={25} max={1000} step={25} value={n.populace} onChange={(e) => zmen({ ...n, populace: Number(e.target.value) })} />
        </label>
        <Vyber klic="rychlost" popis="Game Speed" hodnota={n.rychlost} tabulka={RYCHLOSTI} onZmena={(v) => zmen({ ...n, rychlost: v as 1 | 2 | 3 })} />
        <Vyber klic="odkrytiMapy" popis="Reveal Map" hodnota={n.odkrytiMapy} tabulka={ODKRYTI_MAPY} jedno onZmena={(v) => zmen({ ...n, odkrytiMapy: v })} />
        <Vyber klic="pocatecniVek" popis="Starting Age" hodnota={n.pocatecniVek} tabulka={POCATECNI_VEKY} jedno onZmena={(v) => zmen({ ...n, pocatecniVek: v })} />
        <Vyber klic="konecnyVek" popis="Ending Age" hodnota={n.konecnyVek} tabulka={KONECNE_VEKY} jedno onZmena={(v) => zmen({ ...n, konecnyVek: v })} />
        <Vyber klic="primeri" popis="Treaty Length" hodnota={n.primeri} tabulka={PRIMERI} jedno onZmena={(v) => zmen({ ...n, primeri: v })} />
        <Vyber klic="vitezstvi" popis="Victory" hodnota={n.vitezstvi} tabulka={VITEZSTVI} onZmena={(v) => zmen({ ...n, vitezstvi: v as 1 | 9 })} />
      </div>

      <div className="sloupce">
        <fieldset>
          <legend>Team Settings</legend>
          {/* Team Positions jde ve hře zaškrtnout jen s Team Together; bez něj
              je zašedlé a kontrola ho bere jako „je to jedno“. */}
          {TEAM_SETTINGS.map(({ klic, popis }) => (
            <Zaskrtavatko
              key={klic}
              klic={klic}
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
              <Zaskrtavatko key={klic} klic={klic} popis={popis} hodnota={n.cheaty} jedno={false} onZmena={(v) => zmen({ ...n, cheaty: v === true })} />
            ) : (
              <Zaskrtavatko
                key={klic}
                klic={klic}
                popis={popis}
                hodnota={n[klic]}
                jedno
                vypnuto={n.rezim !== null && ZASKRTAVATKO_REZIMU[n.rezim] === klic}
                onZmena={(v) => zmen({ ...n, [klic]: v })}
              />
            ),
          )}
        </fieldset>
      </div>
      {/* Preset se v praxi neukázal k ničemu: nastavení stejně žije na akci a
          drží se mezi večery samo, takže snímek k ničemu nepřibyl. Tlačítka
          jsou proto schovaná, ne smazaná — server obě cesty (`onUlozit`,
          `ulozene`) umí dál a stačí přepnout tuhle konstantu zpátky. */}
      {PRESETY_VIDET ? (
        <div className="ovladani">
          <button type="button" onClick={onUlozit}>
            Uložit preset lobby
          </button>
          <button
            type="button"
            disabled={ulozene === null || ulozene === undefined || jakoUlozene}
            title={!ulozene ? "Zatím nic uloženého" : jakoUlozene ? "Nastavení je stejné jako uložené" : undefined}
            onClick={() => zmen(doplnNastaveni(ulozene as Partial<Nastaveni>), true)}
          >
            Načíst uložený preset
          </button>
          <button type="button" disabled={jakoVychozi} title={jakoVychozi ? "Nastavení je výchozí" : undefined} onClick={() => zmen({ ...VYCHOZI_NASTAVENI }, true)}>
            Reset nastavení
          </button>
        </div>
      ) : (
        <div className="ovladani">
          <button type="button" disabled={jakoVychozi} title={jakoVychozi ? "Nastavení je výchozí" : undefined} onClick={() => zmen({ ...VYCHOZI_NASTAVENI }, true)}>
            Reset nastavení
          </button>
        </div>
      )}
    </form>
  );
}
