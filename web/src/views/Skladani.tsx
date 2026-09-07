import { CIVILIZACE } from "../../../src/shared/civilizace.js";
import { zkontrolujSestavu } from "../../../src/shared/sestava.js";
import { popisFormatu } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, BARVY, TYMY, type SestavaVstup } from "../../../src/shared/types.js";
import type { Skladani as StavSkladani } from "../skladani.js";
import { useTahani } from "../tahani.js";

interface Props {
  skladani: StavSkladani;
  onVytvoritZapas: (sestava: SestavaVstup[]) => void;
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
const CIVILIZACE_PODLE_JMENA = Object.entries(CIVILIZACE)
  .map(([id, nazev]) => ({ id: Number(id), nazev }))
  .sort((a, b) => a.nazev.localeCompare(b.nazev, "cs"));

export function Skladani({ skladani, onVytvoritZapas }: Props) {
  const tahani = useTahani(skladani.presun);
  const vstupy = skladani.vybrani.map((v) => v.vstup);
  const chyba = zkontrolujSestavu(vstupy);
  const format = popisFormatu(vstupy.map((v, poradi) => ({ ...v, poradi })));

  return (
    <div className="skladani">
      <p className="zaloha">
        Hráče přidáš tlačítkem „+“ v tabulce nahoře. Levé tlačítko myši na barvě nebo týmu jde
        dopředu, pravé zpátky. Pořadí přetáhni myší — je to pořadí slotů v lobby.
      </p>

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
              <span className="jmeno">
                {jmeno}
                {hrac.elo1v1 !== null ? <small> ({hrac.elo1v1})</small> : null}
              </span>
              {/* Civilizace je volitelná: „libovolná“ nechá výběr na hráči, konkrétní
                  se ukáže na jeho kartě a kontrola lobby ji porovná. */}
              <select
                className="volba-civ"
                aria-label={`Civilizace ${jmeno}`}
                value={v.civ ?? ""}
                onChange={(e) => skladani.uprav(v.steamId, (x) => ({ ...x, civ: e.target.value === "" ? null : Number(e.target.value) }))}
              >
                <option value="">libovolná civ.</option>
                {CIVILIZACE_PODLE_JMENA.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nazev}
                  </option>
                ))}
              </select>
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
