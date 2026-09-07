import { useState } from "react";
import { zkontrolujSestavu } from "../../../src/shared/sestava.js";
import { popisFormatu } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, BARVY, TYMY, type PlayerView, type SestavaVstup } from "../../../src/shared/types.js";
import type { Skladani as StavSkladani } from "../skladani.js";
import { useTahani } from "../tahani.js";
import { StatistikyHrace } from "./StatistikyHrace.js";
import { VyberCivilizace } from "./VyberCivilizace.js";

interface Props {
  skladani: StavSkladani;
  onVytvoritZapas: (sestava: SestavaVstup[]) => void;
  /** Civilization Set z nastavení akce — omezuje nabídku civilizací. */
  sadaCivilizaci: number | null;
}

/** Další hodnota v kruhu: levé tlačítko dopředu, pravé zpátky. */
function dalsi<T>(hodnoty: readonly T[], aktualni: T, smer: 1 | -1): T {
  const i = hodnoty.indexOf(aktualni);
  return hodnoty[(i + smer + hodnoty.length) % hodnoty.length]!;
}

/**
 * Panel sestavy: jen vybraní hráči, každý s tlačítkem barvy a týmu jako ve
 * hře (levé tlačítko myši další, pravé předchozí). Nevybraní zůstávají v
 * tabulce přihlášených nad tím, odkud se berou tlačítkem „+“. Pořadí tady je
 * pořadí slotů v lobby a dá se přetahovat. Formát se odvodí, nevybírá se.
 */
export function Skladani({ skladani, onVytvoritZapas, sadaCivilizaci }: Props) {
  const tahani = useTahani(skladani.presun);
  // Najetí na jméno ukáže tutéž kartu se statistikami jako v tabulce přihlášených.
  const [nahled, setNahled] = useState<PlayerView | null>(null);
  const vstupy = skladani.vybrani.map((v) => v.vstup);
  const chyba = zkontrolujSestavu(vstupy);
  const format = popisFormatu(vstupy.map((v, poradi) => ({ ...v, poradi })));

  return (
    <div className="skladani">
      <p className="zaloha">Pořadí hráčů můžeš přetáhnout myší.</p>

      <ul className="sestava" data-testid="vybrani">
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
                data-testid="jmeno-vybraneho"
                onMouseEnter={() => setNahled(hrac)}
                onMouseLeave={() => setNahled(null)}
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
      <p className="zaloha" data-testid="souhrn-sestavy">
        {vstupy.length === 0 ? "Nikdo není vybraný." : chyba ? `${format || "Sestava"} — ${chyba}` : `Formát: ${format}`}
      </p>
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
    </div>
  );
}
