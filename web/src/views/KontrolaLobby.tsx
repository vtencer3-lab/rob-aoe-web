import { useEffect, useRef, useState } from "react";
import { lobbyVPoradku, type Kontrola, type KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";

/** Jak často se kontrola opakuje sama, dokud se v lobby sedí. */
export const INTERVAL_KONTROLY_MS = 5_000;

interface Props {
  zapasId: number;
  onKontrola: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
  /** Dokud je zapnuté, kontroluje se samo; vypíná se, jakmile hra běží. */
  automaticky?: boolean;
  intervalMs?: number;
  /**
   * Rodič se dozví verdikt: true = hlavní sekce bez chyb, false = něco k
   * opravě, null = bez výsledku (lobby mimo seznam, chyba, ještě neproběhlo).
   */
  onVerdikt?: (vPoradku: boolean | null) => void;
}

type Stav =
  | { druh: "klid" }
  | { druh: "kontroluji" }
  | { druh: "vysledek"; vysledek: KontrolaLobbyVysledek }
  | { druh: "chyba"; text: string };

function skloňujVeci(n: number): string {
  return `${n} ${n === 1 ? "věc k opravě" : n < 5 ? "věci k opravě" : "věcí k opravě"}`;
}

/**
 * Sekce „Kontrola lobby“ — stejná pro hosta i režii: server porovná lobby ve
 * hře se sestavou zápasu a očekávaným nastavením akce a vrátí řádky fajfka /
 * křížek. Rob to čte v přenosu, proto věty, ne tabulka hodnot. Dokud se v
 * lobby sedí, kontrola se sama opakuje, ať host vidí, že opravil, co měl.
 *
 * Hlavní sekce rozhoduje o verdiktu (velká fajfka v záhlaví); chybějící
 * heslo je jen upozornění a „Další nastavení“ mají vlastní sbalený seznam.
 */
export function KontrolaLobby({ zapasId, onKontrola, automaticky = false, intervalMs = INTERVAL_KONTROLY_MS, onVerdikt }: Props) {
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

  const vysledek = stav.druh === "vysledek" && stav.vysledek.nalezeno ? stav.vysledek : null;
  const hlavni = vysledek?.kontroly.filter((k) => k.sekce === "hlavni") ?? [];
  const dalsi = vysledek?.kontroly.filter((k) => k.sekce === "dalsi") ?? [];
  const kOprave = hlavni.filter((k) => !k.ok && !k.varovani).length;
  const vPoradku = vysledek ? lobbyVPoradku(vysledek.kontroly) : null;
  const dalsiJinak = dalsi.filter((k) => !k.ok).length;

  useEffect(() => {
    onVerdikt?.(vPoradku);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vPoradku]);

  return (
    <section className={vPoradku ? "sekce-kontrola hotovo" : "sekce-kontrola"} data-testid="kontrola-lobby">
      <header className="zahlavi-sekce">
        <h3>Kontrola lobby</h3>
        {vPoradku ? (
          <span className="fajfka" data-testid="fajfka-kontrola" aria-label="Lobby je v pořádku">
            ✓
          </span>
        ) : null}
      </header>
      <div className="ovladani">
        <button type="button" onClick={() => void zkontroluj(true)} disabled={stav.druh === "kontroluji"}>
          {stav.druh === "kontroluji" ? "Kontroluji…" : "Zkontrolovat lobby"}
        </button>
        {vysledek ? (
          <span className={vPoradku ? "potvrzeno" : "chyba"} data-testid="kontrola-souhrn">
            {vPoradku ? "Lobby je v pořádku" : skloňujVeci(kOprave)}
          </span>
        ) : null}
      </div>
      {stav.druh === "chyba" ? (
        <p className="chyba chyba-pole" role="alert">
          {stav.text}
        </p>
      ) : null}
      {stav.druh === "vysledek" && !stav.vysledek.nalezeno ? (
        <p className="zaloha" role="status">
          Lobby teď v seznamu ze hry není — buď hra už běží, nebo lobby zmizela.
        </p>
      ) : null}
      {vysledek ? (
        <>
          <SeznamKontrol kontroly={hlavni} testId="kontroly" />
          {dalsi.length > 0 ? (
            <details className="dalsi-nastaveni" data-testid="dalsi-nastaveni">
              <summary>
                Další nastavení{" "}
                <span className={dalsiJinak === 0 ? "potvrzeno" : "varovani"}>
                  {dalsiJinak === 0 ? "— vše podle očekávání" : `— ${dalsiJinak} jinak, než Rob nastavil`}
                </span>
              </summary>
              <SeznamKontrol kontroly={dalsi} testId="kontroly-dalsi" />
            </details>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function SeznamKontrol({ kontroly, testId }: { kontroly: Kontrola[]; testId: string }) {
  return (
    <ul className="kontroly" data-testid={testId}>
      {kontroly.map((k) => (
        <li key={k.klic} className={k.ok ? "ok" : k.varovani ? "varovani" : "spatne"}>
          <span className="znak" aria-hidden="true">
            {k.ok ? "✓" : k.varovani ? "!" : "✗"}
          </span>{" "}
          {k.text}
        </li>
      ))}
    </ul>
  );
}
