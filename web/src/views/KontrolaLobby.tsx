import { useEffect, useRef, useState } from "react";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";

/** Jak často se kontrola opakuje sama, dokud se v lobby sedí. */
export const INTERVAL_KONTROLY_MS = 5_000;

interface Props {
  zapasId: number;
  onKontrola: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
  /** Dokud je zapnuté, kontroluje se samo; vypíná se, jakmile hra běží. */
  automaticky?: boolean;
  intervalMs?: number;
}

type Stav =
  | { druh: "klid" }
  | { druh: "kontroluji" }
  | { druh: "vysledek"; vysledek: KontrolaLobbyVysledek }
  | { druh: "chyba"; text: string };

/**
 * „Zkontrolovat lobby“: server porovná lobby ve hře se sestavou zápasu a
 * očekávaným nastavením akce a vrátí řádky fajfka / křížek. Rob to čte v
 * přenosu, proto věty, ne tabulka hodnot. Dokud se v lobby sedí, kontrola
 * se sama opakuje, ať host vidí, že opravil, co měl.
 */
export function KontrolaLobby({ zapasId, onKontrola, automaticky = false, intervalMs = INTERVAL_KONTROLY_MS }: Props) {
  const [stav, setStav] = useState<Stav>({ druh: "klid" });
  const probiha = useRef(false);
  const zivy = useRef(true);

  async function zkontroluj(rucne: boolean) {
    if (probiha.current) return;
    probiha.current = true;
    if (rucne) setStav({ druh: "kontroluji" });
    try {
      const vysledek = await onKontrola(zapasId);
      if (zivy.current) setStav({ druh: "vysledek", vysledek });
    } catch (err) {
      if (zivy.current) setStav({ druh: "chyba", text: err instanceof Error ? err.message : "Kontrola se nepovedla." });
    } finally {
      probiha.current = false;
    }
  }

  useEffect(() => {
    zivy.current = true;
    return () => {
      zivy.current = false;
    };
  }, []);

  useEffect(() => {
    if (!automaticky) return;
    void zkontroluj(false);
    const casovac = setInterval(() => void zkontroluj(false), intervalMs);
    return () => clearInterval(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticky, intervalMs, zapasId]);

  const vysledek = stav.druh === "vysledek" ? stav.vysledek : null;
  const spatne = vysledek?.kontroly.filter((k) => !k.ok).length ?? 0;

  return (
    <div className="kontrola-lobby" data-testid="kontrola-lobby">
      <div className="ovladani">
        <button type="button" onClick={() => void zkontroluj(true)} disabled={stav.druh === "kontroluji"}>
          {stav.druh === "kontroluji" ? "Kontroluji…" : "Zkontrolovat lobby"}
        </button>
        {vysledek && vysledek.nalezeno ? (
          <span className={spatne === 0 ? "potvrzeno" : "chyba"} data-testid="kontrola-souhrn">
            {spatne === 0 ? "Lobby je v pořádku" : `${spatne} ${spatne === 1 ? "věc k opravě" : spatne < 5 ? "věci k opravě" : "věcí k opravě"}`}
          </span>
        ) : null}
      </div>
      {stav.druh === "chyba" ? (
        <p className="chyba chyba-pole" role="alert">
          {stav.text}
        </p>
      ) : null}
      {vysledek && !vysledek.nalezeno ? (
        <p className="zaloha" role="status">
          Lobby teď v seznamu ze hry není — buď hra už běží, nebo lobby zmizela.
        </p>
      ) : null}
      {vysledek && vysledek.nalezeno ? (
        <ul className="kontroly" data-testid="kontroly">
          {vysledek.kontroly.map((k) => (
            <li key={k.klic} className={k.ok ? "ok" : "spatne"}>
              <span className="znak" aria-hidden="true">
                {k.ok ? "✓" : "✗"}
              </span>{" "}
              {k.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
