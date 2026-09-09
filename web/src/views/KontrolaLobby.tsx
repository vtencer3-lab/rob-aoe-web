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
   * Rodič se dozví verdikt: true = nikde nic červeného, false = něco k
   * opravě, null = bez výsledku (lobby mimo seznam, chyba, ještě neproběhlo).
   */
  onVerdikt?: (vPoradku: boolean | null) => void;
}

function skloňujVeci(n: number): string {
  return `${n} ${n === 1 ? "věc k opravě" : n < 5 ? "věci k opravě" : "věcí k opravě"}`;
}

const ZNAK: Record<Kontrola["stav"], string> = { ok: "✓", spatne: "✗", varovani: "!", jedno: "–" };

/**
 * Sekce „Kontrola lobby“ — stejná pro hosta i režii: server porovná lobby ve
 * hře se sestavou zápasu a očekávaným nastavením akce a vrátí řádky ve
 * čtyřech stavech: zelená fajfka, červený křížek, žluté upozornění (heslo)
 * a šedé „je to jedno“ (Rob nastavil „–“). Rob to čte v přenosu, proto
 * věty, ne tabulka hodnot. Dokud se v lobby sedí, kontrola se sama opakuje,
 * ať host vidí, že opravil, co měl.
 *
 * O velké fajfce v záhlaví rozhoduje jedině to, že není nic červené —
 * v hlavní sekci ani v „Dalším nastavení“. To druhé je rozbalené a
 * pamatuje si, jak si ho kdo sbalil, i přes další kontroly.
 */
export function KontrolaLobby({ zapasId, onKontrola, automaticky = false, intervalMs = INTERVAL_KONTROLY_MS, onVerdikt }: Props) {
  // Poslední výsledek se drží i během další kontroly — seznam nesmí při
  // každém kliknutí zmizet a znovu naskočit.
  const [vysledek, setVysledek] = useState<KontrolaLobbyVysledek | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [kontroluji, setKontroluji] = useState(false);
  const [rozbalene, setRozbalene] = useState(true);
  const probiha = useRef(false);
  const zivy = useRef(true);

  async function zkontroluj(rucne: boolean) {
    if (probiha.current) return;
    probiha.current = true;
    if (rucne) setKontroluji(true);
    try {
      const v = await onKontrola(zapasId);
      if (zivy.current) {
        setVysledek(v);
        setChyba(null);
      }
    } catch (err) {
      if (zivy.current) setChyba(err instanceof Error ? err.message : "Kontrola se nepovedla.");
    } finally {
      probiha.current = false;
      if (zivy.current) setKontroluji(false);
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

  const nalezena = vysledek?.nalezeno ? vysledek : null;
  const hlavni = nalezena?.kontroly.filter((k) => k.sekce === "hlavni") ?? [];
  const dalsi = nalezena?.kontroly.filter((k) => k.sekce === "dalsi") ?? [];
  const kOprave = nalezena?.kontroly.filter((k) => k.stav === "spatne").length ?? 0;
  const vPoradku = nalezena ? lobbyVPoradku(nalezena.kontroly) : null;
  const dalsiJinak = dalsi.filter((k) => k.stav === "spatne").length;

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
        <button type="button" onClick={() => void zkontroluj(true)} disabled={kontroluji}>
          {kontroluji ? "Kontroluji…" : "Zkontrolovat lobby"}
        </button>
        {nalezena ? (
          <span className={vPoradku ? "potvrzeno" : "chyba"} data-testid="kontrola-souhrn">
            {vPoradku ? "Lobby je v pořádku" : skloňujVeci(kOprave)}
          </span>
        ) : null}
      </div>
      {chyba ? (
        <p className="chyba chyba-pole" role="alert">
          {chyba}
        </p>
      ) : null}
      {vysledek && !vysledek.nalezeno ? (
        <p className="zaloha" role="status">
          Lobby teď v seznamu ze hry není — buď hra už běží, nebo lobby zmizela.
        </p>
      ) : null}
      {nalezena ? (
        <>
          <SeznamKontrol kontroly={hlavni} testId="kontroly" />
          {dalsi.length > 0 ? (
            <details
              className="dalsi-nastaveni"
              data-testid="dalsi-nastaveni"
              open={rozbalene}
              onToggle={(e) => setRozbalene(e.currentTarget.open)}
            >
              <summary>
                Další nastavení{" "}
                <span className={dalsiJinak === 0 ? "potvrzeno" : "chyba"}>
                  {dalsiJinak === 0 ? "— vše podle nastavení akce" : `— ${dalsiJinak} jinak než v nastavení akce`}
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
        <li key={k.klic} className={k.stav}>
          <span className="znak" aria-hidden="true">
            {ZNAK[k.stav]}
          </span>{" "}
          {k.text}
        </li>
      ))}
    </ul>
  );
}
