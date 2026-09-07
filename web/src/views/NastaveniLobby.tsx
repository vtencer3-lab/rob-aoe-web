import { useEffect, useState } from "react";
import {
  doplnNastaveni,
  RYCHLOSTI,
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

/**
 * Očekávané nastavení lobby pro kontrolu: mapa, velikost, rychlost, populace,
 * victory, cheaty. Rob si to nastaví jednou za večer; „Zkontrolovat lobby“
 * pak u každého zápasu porovná, co host ve hře naklikal.
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
        <label>
          Rychlost
          <select value={n.rychlost} onChange={(e) => setN({ ...n, rychlost: Number(e.target.value) as 1 | 2 | 3 })}>
            {Object.entries(RYCHLOSTI).map(([v, nazev]) => (
              <option key={v} value={v}>
                {nazev}
              </option>
            ))}
          </select>
        </label>
        <label>
          Populace
          <input type="number" min={25} max={1000} step={25} value={n.populace} onChange={(e) => setN({ ...n, populace: Number(e.target.value) })} />
        </label>
        <label>
          Victory
          <select value={n.vitezstvi} onChange={(e) => setN({ ...n, vitezstvi: Number(e.target.value) as 1 | 9 })}>
            {Object.entries(VITEZSTVI).map(([v, nazev]) => (
              <option key={v} value={v}>
                {nazev}
              </option>
            ))}
          </select>
        </label>
        <label className="zaskrtavaci">
          <input type="checkbox" checked={n.cheaty} onChange={(e) => setN({ ...n, cheaty: e.target.checked })} />
          Cheaty povolené
        </label>
      </div>
      <button type="submit">Uložit nastavení lobby</button>
    </form>
  );
}
