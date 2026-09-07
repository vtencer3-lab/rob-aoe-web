import { useEffect, useState } from "react";
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
  ZASKRTAVATKA,
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

/** Číselníky „Dalšího nastavení“: klíč v nastavení, popisek, tabulka hodnot. */
const CISELNIKY: ReadonlyArray<{ klic: "sadaCivilizaci" | "rezim" | "aiObtiznost" | "suroviny" | "odkrytiMapy" | "pocatecniVek" | "konecnyVek"; popis: string; tabulka: Record<number, string> }> = [
  { klic: "sadaCivilizaci", popis: "Civilization Set", tabulka: SADY_CIVILIZACI },
  { klic: "rezim", popis: "Game Mode", tabulka: REZIMY },
  { klic: "aiObtiznost", popis: "AI Difficulty", tabulka: AI_OBTIZNOSTI },
  { klic: "suroviny", popis: "Resources", tabulka: SUROVINY },
  { klic: "odkrytiMapy", popis: "Reveal Map", tabulka: ODKRYTI_MAPY },
  { klic: "pocatecniVek", popis: "Starting Age", tabulka: POCATECNI_VEKY },
  { klic: "konecnyVek", popis: "Ending Age", tabulka: KONECNE_VEKY },
];

function Vyber({ popis, hodnota, tabulka, onZmena }: { popis: string; hodnota: number; tabulka: Record<number, string>; onZmena: (v: number) => void }) {
  return (
    <label>
      {popis}
      <select value={hodnota} onChange={(e) => onZmena(Number(e.target.value))}>
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
 * Očekávané nastavení lobby pro kontrolu: hlavní část (mapa, velikost,
 * rychlost, populace, victory, cheaty) a sbalené „Další nastavení“ se vším
 * ostatním, co seznam lobby vydává. Rob si to nastaví jednou za večer;
 * „Zkontrolovat lobby“ pak u každého zápasu porovná, co host naklikal.
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
      <div className="mrizka">
        <label>
          Mapa
          <select value={n.mapaId ?? ""} onChange={(e) => setN({ ...n, mapaId: cislo(e.target.value) })}>
            <option value="">libovolná</option>
            {MAPY_PODLE_JMENA.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nazev}
              </option>
            ))}
          </select>
        </label>
        <label>
          Velikost
          <select value={n.velikost ?? ""} onChange={(e) => setN({ ...n, velikost: cislo(e.target.value) })}>
            <option value="">podle počtu hráčů</option>
            {Object.entries(VELIKOSTI).map(([v, nazev]) => (
              <option key={v} value={v}>
                {nazev}
              </option>
            ))}
          </select>
        </label>
        <Vyber popis="Rychlost" hodnota={n.rychlost} tabulka={RYCHLOSTI} onZmena={(v) => setN({ ...n, rychlost: v as 1 | 2 | 3 })} />
        <label>
          Populace
          <input type="number" min={25} max={1000} step={25} value={n.populace} onChange={(e) => setN({ ...n, populace: Number(e.target.value) })} />
        </label>
        <Vyber popis="Victory" hodnota={n.vitezstvi} tabulka={VITEZSTVI} onZmena={(v) => setN({ ...n, vitezstvi: v as 1 | 9 })} />
        <label className="zaskrtavaci">
          <input type="checkbox" checked={n.cheaty} onChange={(e) => setN({ ...n, cheaty: e.target.checked })} />
          Cheaty povolené
        </label>
      </div>
      <details className="dalsi-nastaveni" data-testid="dalsi-nastaveni-form">
        <summary>Další nastavení</summary>
        <div className="mrizka">
          {CISELNIKY.map((c) => (
            <Vyber key={c.klic} popis={c.popis} hodnota={n[c.klic]} tabulka={c.tabulka} onZmena={(v) => setN({ ...n, [c.klic]: v })} />
          ))}
          <label>
            Treaty Length (min)
            <input type="number" min={0} max={180} step={5} value={n.primeri} onChange={(e) => setN({ ...n, primeri: Number(e.target.value) })} />
          </label>
        </div>
        <div className="mrizka">
          {ZASKRTAVATKA.map(({ klic, popis }) => (
            <label key={klic} className="zaskrtavaci">
              <input type="checkbox" checked={n[klic]} onChange={(e) => setN({ ...n, [klic]: e.target.checked })} />
              {popis}
            </label>
          ))}
        </div>
      </details>
      <button type="submit">Uložit nastavení lobby</button>
    </form>
  );
}
