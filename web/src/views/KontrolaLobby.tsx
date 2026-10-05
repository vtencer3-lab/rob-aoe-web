import { useEffect, useRef, useState } from "react";
import { lobbyVPoradku, type Kontrola, type KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import { Skladaci } from "./Skladaci.js";

/** Jak často se kontrola opakuje sama, dokud se v lobby sedí. */
export const INTERVAL_KONTROLY_MS = 5_000;

interface Props {
  zapasId: number;
  onKontrola: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
  /** Dokud je zapnuté, kontroluje se samo; vypíná se, jakmile hra běží. */
  automaticky?: boolean;
  intervalMs?: number;
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
 * O verdiktu rozhoduje jedině to, že není nic červené — v hlavní sekci ani
 * v „Dalším nastavení“. To druhé je rozbalené a pamatuje si, jak si ho kdo
 * sbalil, i přes další kontroly.
 *
 * Verdikt (velký zelený/červený nápis) stojí za tlačítkem „Zkontrolovat
 * lobby“, hned nad celým výpisem — host se dívá nahoru na streamu a spěchá,
 * dole ho musel odrolovat (uživatel 17. 9. 2026). Mluví o výpisu pod sebou,
 * tak má sedět těsně nad ním, ne za záhlavím odstrčený tlačítkem (uživatel
 * 17. 9. 2026, doplnění). V záhlaví bývala ještě zelená fajfka; po přesunu
 * říkala totéž co nápis pod ní, tak šla pryč (uživatel 17. 9. 2026). Sekce
 * si třídu `hotovo` drží dál — na tu se váže vzhled celého panelu, ne ten
 * znak. Dokud `vPoradku` je `null` (kontrola
 * ještě neproběhla, lobby mimo seznam, chyba serveru), verdikt se neukazuje
 * vůbec — „zatím nevíme“ není totéž co „je to špatně“.
 */
export function KontrolaLobby({ zapasId, onKontrola, automaticky = false, intervalMs = INTERVAL_KONTROLY_MS }: Props) {
  // Poslední výsledek se drží i během další kontroly — seznam nesmí při
  // každém kliknutí zmizet a znovu naskočit.
  const [vysledek, setVysledek] = useState<KontrolaLobbyVysledek | null>(null);
  const [chyba, setChyba] = useState<string | null>(null);
  const [kontroluji, setKontroluji] = useState(false);
  // Každá ze tří sekcí si pamatuje, jak si ji kdo sbalil (prohlížeč), i přes
  // další kontroly a obnovení stránky; totéž platí uvnitř „Nastavení hry“.
  const [prelobbyOtevrene, setPrelobbyOtevrene] = useUlozenyStav("kontrola.sekce.prelobby", true);
  const [hlavniOtevrene, setHlavniOtevrene] = useUlozenyStav("kontrola.sekce.hlavni", true);
  const [dalsiOtevrene, setDalsiOtevrene] = useUlozenyStav("kontrola.sekce.dalsi", true);
  // „Nastavení hry“ (poslední známý stav po zmizení lobby) je sbalené vždy
  // napoprvé; nepamatuje se.
  const [nastaveniHryOtevrene, setNastaveniHryOtevrene] = useState(false);
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
    // I mimo automatický režim (hra běží) se jednou zkontroluje: jinak by po
    // obnovení stránky nebo novém připojení komponenty chybělo „Nastavení
    // hry“ — poslední známý stav je na serveru, ne ve stavu komponenty
    // (uživatel 13. 9. 2026: „chci, aby bylo vždy dostupné“).
    void zkontroluj(false);
    if (!automaticky) return;
    const casovac = setInterval(() => void zkontroluj(false), intervalMs);
    return () => clearInterval(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticky, intervalMs, zapasId]);

  const nalezena = vysledek?.nalezeno ? vysledek : null;
  const hlavni = nalezena?.kontroly.filter((k) => k.sekce === "hlavni") ?? [];
  const dalsi = nalezena?.kontroly.filter((k) => k.sekce === "dalsi") ?? [];
  const kOprave = nalezena?.kontroly.filter((k) => k.stav === "spatne").length ?? 0;
  const vPoradku = nalezena ? lobbyVPoradku(nalezena.kontroly) : null;
  const prelobby = nalezena?.kontroly.filter((k) => k.sekce === "prelobby") ?? [];

  return (
    <section className={vPoradku ? "sekce-kontrola hotovo" : "sekce-kontrola"} data-testid="kontrola-lobby">
      <header className="zahlavi-sekce">
        <h3>Kontrola lobby</h3>
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
      {vPoradku !== null ? (
        // Za tlačítkem, ne hned pod záhlavím: verdikt mluví o výpisu
        // nastavení pod sebou, tak má sedět těsně nad ním, ne být od něj
        // odstrčený tlačítkem (uživatel 17. 9. 2026).
        <p className={`verdikt-lobby ${vPoradku ? "v-poradku" : "k-oprave"}`} data-testid="verdikt-lobby">
          <span className="znak-verdiktu" aria-hidden="true">
            {vPoradku ? "✓" : "✗"}
          </span>{" "}
          {vPoradku ? "Výborně, můžete hrát!" : "Opravte Lobby, než půjdete hrát!"}
        </p>
      ) : null}
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
      {vysledek && !vysledek.nalezeno && vysledek.posledni && vysledek.posledni.kontroly.length > 0 ? (
        // „Nastavení hry“ (uživatel 13. 9. 2026): poslední známý stav před
        // zmizením lobby, sbalený; uvnitř tytéž tři sekce jako u živé
        // kontroly, rozbalené tak, jak si je kdo nechal.
        <Skladaci
          testId="posledni-nastaveni"
          otevreno={nastaveniHryOtevrene}
          onPrepnout={setNastaveniHryOtevrene}
          hlava={
            <>
              Nastavení hry{" "}
              <span className="zaloha">
                — poslední známé, z {new Date(vysledek.posledni.kdy).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </>
          }
        >
          <Sekce
            nazev="Pre-Lobby"
            kontroly={vysledek.posledni.kontroly.filter((k) => k.sekce === "prelobby")}
            testId="posledni-prelobby"
            seznamTestId="posledni-kontroly-prelobby"
            otevreno={prelobbyOtevrene}
            onPrepnout={setPrelobbyOtevrene}
          />
          <Sekce
            nazev="Nastavení Lobby"
            kontroly={vysledek.posledni.kontroly.filter((k) => k.sekce === "hlavni")}
            testId="posledni-hlavni"
            seznamTestId="posledni-kontroly-hlavni"
            otevreno={hlavniOtevrene}
            onPrepnout={setHlavniOtevrene}
          />
          <Sekce
            nazev="Další nastavení"
            kontroly={vysledek.posledni.kontroly.filter((k) => k.sekce === "dalsi")}
            testId="posledni-dalsi"
            seznamTestId="posledni-kontroly-dalsi"
            otevreno={dalsiOtevrene}
            onPrepnout={setDalsiOtevrene}
          />
        </Skladaci>
      ) : null}
      {nalezena ? (
        <>
          {/* Pre-Lobby: co se naklikalo v okně zakládání lobby. Po založení
              se s tím už nedá hnout, takže sedí zvlášť od herního panelu. */}
          <Sekce nazev="Pre-Lobby" kontroly={prelobby} testId="prelobby-nastaveni" seznamTestId="kontroly-prelobby" otevreno={prelobbyOtevrene} onPrepnout={setPrelobbyOtevrene} />
          <Sekce nazev="Nastavení Lobby" kontroly={hlavni} testId="hlavni-nastaveni" seznamTestId="kontroly" otevreno={hlavniOtevrene} onPrepnout={setHlavniOtevrene} />
          <Sekce nazev="Další nastavení" kontroly={dalsi} testId="dalsi-nastaveni" seznamTestId="kontroly-dalsi" otevreno={dalsiOtevrene} onPrepnout={setDalsiOtevrene} />
        </>
      ) : null}
    </section>
  );
}

/**
 * Zapamatovaný stav ano/ne v prohlížeči (localStorage); bez úložiště platí
 * výchozí jen do obnovení stránky.
 */
function useUlozenyStav(klic: string, vychozi: boolean): [boolean, (v: boolean) => void] {
  const [hodnota, setHodnota] = useState(() => {
    try {
      const ulozeno = localStorage.getItem(klic);
      return ulozeno === null ? vychozi : ulozeno === "1";
    } catch {
      return vychozi;
    }
  });
  return [
    hodnota,
    (v) => {
      setHodnota(v);
      try {
        localStorage.setItem(klic, v ? "1" : "0");
      } catch {
        // Bez úložiště se stav po obnovení stránky vrátí na výchozí.
      }
    },
  ];
}

/**
 * Jedna sekce kontroly: název, kolik v ní sedí jinak, a seznam řádků. Všechny
 * tři sekce vypadají stejně, takže se kreslí jedním kusem kódu; každá si
 * pamatuje, jestli je zabalená.
 */
function Sekce({
  nazev,
  kontroly,
  testId,
  seznamTestId,
  otevreno,
  onPrepnout,
}: {
  nazev: string;
  kontroly: Kontrola[];
  testId: string;
  seznamTestId: string;
  otevreno: boolean;
  onPrepnout: (otevreno: boolean) => void;
}) {
  if (kontroly.length === 0) return null;
  const jinak = kontroly.filter((k) => k.stav === "spatne").length;
  return (
    <Skladaci
      testId={testId}
      otevreno={otevreno}
      onPrepnout={onPrepnout}
      hlava={
        <>
          {nazev}{" "}
          <span className={jinak === 0 ? "potvrzeno" : "chyba"}>
            {jinak === 0 ? "— vše podle nastavení akce" : `— ${jinak} jinak než v nastavení akce`}
          </span>
        </>
      }
    >
      <SeznamKontrol kontroly={kontroly} testId={seznamTestId} />
    </Skladaci>
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
