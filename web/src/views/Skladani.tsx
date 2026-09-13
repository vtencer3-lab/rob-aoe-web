import { useEffect, useRef, useState } from "react";
import { blikni } from "../historie.js";
import { jeAi } from "../../../src/shared/aiHraci.js";
import { MAX_HRACU, zkontrolujSestavu } from "../../../src/shared/sestava.js";
import { popisFormatu } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, BARVY, TYMY, type PlayerView, type SestavaVstup, type Tym } from "../../../src/shared/types.js";
import type { VybranyHrac } from "../skladani.js";
import type { Skladani as StavSkladani } from "../skladani.js";
import { jmenoPodKurzorem, KONEC_TAHU, tahneSe, useTahani } from "../tahani.js";
import { StatistikyHrace } from "./StatistikyHrace.js";
import { VyberCivilizace } from "./VyberCivilizace.js";

interface Props {
  skladani: StavSkladani;
  onVytvoritZapas: (sestava: SestavaVstup[]) => void;
  /** Civilization Set z nastavení akce — omezuje nabídku civilizací. */
  sadaCivilizaci: number | null;
  /** Řádek (steamId) ke zvýraznění po změně / zpět / znovu; `cas` odliší opakování. */
  zvyraznit?: { cil: string | null; cas: number } | null;
  /**
   * První AI v sestavě. Volá se proto, aby šlo upozornit na AI Difficulty:
   * dokud v lobby žádný počítač nesedí, je „–“ v pořádku, s prvním už ne.
   */
  onPrvniAi?: () => void;
  /** Bez tlačítka „Vytvořit zápas“ — při úpravě zápasu se sestava propisuje sama (hook `odesli`). */
  bezTlacitka?: boolean;
}

/** Další hodnota v kruhu: levé tlačítko dopředu, pravé zpátky. */
function dalsi<T>(hodnoty: readonly T[], aktualni: T, smer: 1 | -1): T {
  const i = hodnoty.indexOf(aktualni);
  return hodnoty[(i + smer + hodnoty.length) % hodnoty.length]!;
}

/** Součet 1v1 ELO za tým (1 až 4) s hráči, kteří ELO nemají a do součtu nejdou. */
export function eloTymu(vybrani: VybranyHrac[]): Array<{ tym: Tym; soucet: number; bezEla: string[] }> {
  const vysledek: Array<{ tym: Tym; soucet: number; bezEla: string[] }> = [];
  for (const tym of TYMY) {
    if (tym === 0) continue;
    const clenove = vybrani.filter((v) => v.vstup.tym === tym);
    if (clenove.length === 0) continue;
    // AI do součtu nevstupuje a nepatří ani mezi „bez ELA“: tam se vypisují
    // lidé, kterým se statistiky nestáhly, a to je jiná informace. Tým, který
    // je celý AI, se ale v souhrnu ukáže — jinak by strany zmizely.
    const lide = clenove.filter((v) => !jeAi(v.hrac.steamId));
    vysledek.push({
      tym,
      soucet: lide.reduce((s, v) => s + (v.hrac.elo1v1 ?? 0), 0),
      bezEla: lide.filter((v) => v.hrac.elo1v1 === null).map((v) => v.hrac.alias ?? v.hrac.steamName ?? v.hrac.steamId),
    });
  }
  return vysledek;
}

/**
 * Panel sestavy: jen vybraní hráči, každý s tlačítkem barvy a týmu jako ve
 * hře (levé tlačítko myši další, pravé předchozí). Nevybraní zůstávají v
 * tabulce přihlášených nad tím, odkud se berou tlačítkem „+“. Pořadí tady je
 * pořadí slotů v lobby a dá se přetahovat. Formát se odvodí, nevybírá se.
 */
export function Skladani({ skladani, onVytvoritZapas, sadaCivilizaci, zvyraznit, onPrvniAi, bezTlacitka }: Props) {
  const tahani = useTahani(skladani.presun);
  const seznam = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (zvyraznit?.cil) blikni(seznam.current?.querySelector(`[data-tah-id="${zvyraznit.cil}"]`));
  }, [zvyraznit]);
  // Najetí na jméno ukáže tutéž kartu se statistikami jako v tabulce přihlášených.
  const [nahled, setNahled] = useState<PlayerView | null>(null);
  useEffect(() => {
    const srovnej = (e: Event) => {
      const id = jmenoPodKurzorem(e, seznam.current);
      const hrac = id ? (skladani.vybrani.find((v) => v.hrac.steamId === id)?.hrac ?? null) : null;
      setNahled(hrac && jeAi(hrac.steamId) ? null : hrac);
    };
    window.addEventListener(KONEC_TAHU, srovnej);
    return () => window.removeEventListener(KONEC_TAHU, srovnej);
  }, [skladani.vybrani]);
  const vstupy = skladani.vybrani.map((v) => v.vstup);
  const chyba = zkontrolujSestavu(vstupy);
  const format = popisFormatu(vstupy.map((v, poradi) => ({ ...v, poradi })));

  return (
    <div className="skladani">
      {/* AI se nebere z tabulky přihlášených — počítač se do akce nehlásí,
          přisedne rovnou k sestavě, jako když si ho host naklikne v lobby. */}
      <div className="hlavicka-sestavy">
        <p className="zaloha">Pořadí hráčů můžeš přetáhnout myší.</p>
        <button
          type="button"
          className="pridat-ai"
          disabled={vstupy.length >= MAX_HRACU}
          aria-label="Přidat AI do sestavy"
          title={vstupy.length >= MAX_HRACU ? "Lobby je plná" : "Přisadí k sestavě počítačového protivníka"}
          onClick={() => {
            const prvni = !vstupy.some((v) => jeAi(v.steamId));
            skladani.pridejAi();
            if (prvni) onPrvniAi?.();
          }}
        >
          + AI
        </button>
      </div>

      <ul className="sestava" data-testid="vybrani" ref={seznam}>
        {skladani.vybrani.map(({ vstup: v, hrac }) => {
          const jmeno = hrac.alias ?? hrac.steamName ?? hrac.steamId;
          return (
            <li key={v.steamId} className={`radek vybrany barva-${v.barva}`} {...tahani("vybrani", v.steamId)}>
              <span className="uchyt" aria-hidden="true">
                ⋮⋮
              </span>
              <button
                type="button"
                className={`volba volba-barva barva-${v.barva}`}
                aria-label={`Barva ${jmeno}: ${BARVA_NAZEV[v.barva]}`}
                title="Levé tlačítko další barva, pravé předchozí"
                onClick={() => skladani.uprav(v.steamId, (x) => ({ ...x, barva: dalsi(BARVY, x.barva, 1) }))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  skladani.uprav(v.steamId, (x) => ({ ...x, barva: dalsi(BARVY, x.barva, -1) }));
                }}
              >
                {v.barva}
              </button>
              <button
                type="button"
                className="volba volba-tym"
                aria-label={`Tým ${jmeno}: ${v.tym === 0 ? "bez týmu" : v.tym}`}
                title="Levé tlačítko další tým, pravé předchozí"
                onClick={() => skladani.uprav(v.steamId, (x) => ({ ...x, tym: dalsi(TYMY, x.tym, 1) }))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  skladani.uprav(v.steamId, (x) => ({ ...x, tym: dalsi(TYMY, x.tym, -1) }));
                }}
              >
                {v.tym === 0 ? "–" : v.tym}
              </button>
              <span
                className="jmeno jmeno-hrace"
                data-jmeno-hrace={hrac.steamId}
                data-testid="jmeno-vybraneho"
                onPointerEnter={() => {
                  // Počítač žádné žebříčky nemá, karta by u něj byla prázdná.
                  if (!tahneSe() && !jeAi(hrac.steamId)) setNahled(hrac);
                }}
                onPointerLeave={() => {
                  if (!tahneSe()) setNahled(null);
                }}
              >
                {jmeno}
              </span>
              {/* ELO ve vlastním sloupci s pevnou šířkou, ať se řádky zarovnají. */}
              <span className="elo">{hrac.elo1v1 !== null ? <small>({hrac.elo1v1})</small> : null}</span>
              {/* Civilizace je volitelná: „libovolná“ nechá výběr na hráči, konkrétní
                  se ukáže na jeho kartě a kontrola lobby ji porovná. */}
              <VyberCivilizace
                popisek={`Civilizace ${jmeno}`}
                sada={sadaCivilizaci}
                hodnota={v.civ ?? null}
                onZmena={(civ) => skladani.uprav(v.steamId, (x) => ({ ...x, civ }))}
              />
              <button
                type="button"
                className="odebrat"
                aria-label={`Vyřadit ${jmeno} ze sestavy`}
                title="Vyřadit ze sestavy"
                onClick={() => skladani.odeber(v.steamId)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      {nahled ? <StatistikyHrace hrac={nahled} /> : null}
      {/* Součet ELO za tým pod seznamem: Rob vidí, jestli jsou strany vyrovnané. */}
      {eloTymu(skladani.vybrani).length > 0 ? (
        <div className="elo-tymu" data-testid="elo-tymu">
          {eloTymu(skladani.vybrani).map(({ tym, soucet, bezEla }) => (
            <div key={tym} className="tym">
              <h4>Tým {tym}</h4>
              <strong>{soucet}</strong>
              {bezEla.length > 0 ? <small title={`Bez ELO: ${bezEla.join(", ")}`}>bez ELO: {bezEla.join(", ")}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
      <p className="zaloha souhrn" data-testid="souhrn-sestavy">
        {vstupy.length === 0 ? "Nikdo není vybraný." : chyba ? `${format || "Sestava"} — ${chyba}` : `Formát: ${format}`}
      </p>
      {bezTlacitka ? null : (
        <button
          type="button"
          className="vytvorit"
          disabled={chyba !== null}
          onClick={() => {
            onVytvoritZapas(vstupy.map((v) => ({ steamId: v.steamId, tym: v.tym, barva: v.barva, civ: v.civ ?? null })));
            skladani.vynuluj();
          }}
        >
          Vytvořit zápas ({vstupy.length})
        </button>
      )}
    </div>
  );
}
