import { useRef, useState } from "react";
import { zkontrolujSestavu } from "../../../src/shared/sestava.js";
import { popisFormatu } from "../../../src/shared/strany.js";
import {
  BARVA_NAZEV,
  BARVY,
  TYMY,
  type Barva,
  type PlayerView,
  type SestavaVstup,
  type Tym,
} from "../../../src/shared/types.js";

interface Props {
  prihlaseni: PlayerView[];
  onVytvoritZapas: (sestava: SestavaVstup[]) => void;
}

const KLIC_PORADI = "rezie.poradi-nevybranych";

function nactiPoradi(): string[] {
  try {
    const raw = localStorage.getItem(KLIC_PORADI);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function ulozPoradi(poradi: string[]): void {
  try {
    localStorage.setItem(KLIC_PORADI, JSON.stringify(poradi));
  } catch {
    // Prohlížeč bez úložiště: pořadí prostě nepřežije obnovení stránky.
  }
}

function jmeno(h: PlayerView): string {
  return h.alias ?? h.steamName ?? h.steamId;
}

/** Další hodnota v kruhu: levé tlačítko dopředu, pravé zpátky. */
function dalsi<T>(hodnoty: readonly T[], aktualni: T, smer: 1 | -1): T {
  const i = hodnoty.indexOf(aktualni);
  return hodnoty[(i + smer + hodnoty.length) % hodnoty.length]!;
}

/**
 * Skládání zápasu: Rob klikne na hráče, ten vyskočí nahoru mezi vybrané a
 * dostane tlačítko barvy a týmu jako ve hře (levé tlačítko myši další,
 * pravé předchozí). Pořadí vybraných je pořadí slotů v lobby a dá se
 * přetahovat; nevybraní se řadí zvlášť a nikdy se s vybranými nemíchají.
 * Formát se z toho odvodí, nevybírá se.
 */
export function Skladani({ prihlaseni, onVytvoritZapas }: Props) {
  const [vybrani, setVybrani] = useState<SestavaVstup[]>([]);
  const [poradiNevybranych, setPoradiNevybranych] = useState<string[]>(nactiPoradi);
  const tazeny = useRef<{ steamId: string; skupina: "vybrani" | "nevybrani" } | null>(null);

  const podleId = new Map(prihlaseni.map((h) => [h.steamId, h]));
  // Kdo se odhlásil z akce, ze sestavy vypadne sám.
  const platniVybrani = vybrani.filter((v) => podleId.has(v.steamId));
  const vybraneId = new Set(platniVybrani.map((v) => v.steamId));
  const nevybrani = [...prihlaseni]
    .filter((h) => !vybraneId.has(h.steamId))
    .sort((a, b) => {
      const ia = poradiNevybranych.indexOf(a.steamId);
      const ib = poradiNevybranych.indexOf(b.steamId);
      return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
    });

  function vyber(steamId: string) {
    const obsazene = new Set(platniVybrani.map((v) => v.barva));
    const volna = BARVY.find((b) => !obsazene.has(b)) ?? 1;
    setVybrani([...platniVybrani, { steamId, tym: 0, barva: volna }]);
  }

  function odeber(steamId: string) {
    setVybrani(platniVybrani.filter((v) => v.steamId !== steamId));
    // Vyřazený jde na konec nevybraných; kdo v uloženém pořadí nebyl (nově
    // přihlášený), zůstává před ním v pořadí přihlášení.
    const nove = [...nevybrani.map((h) => h.steamId).filter((id) => id !== steamId), steamId];
    setPoradiNevybranych(nove);
    ulozPoradi(nove);
  }

  function uprav(steamId: string, zmena: (v: SestavaVstup) => SestavaVstup) {
    setVybrani(platniVybrani.map((v) => (v.steamId === steamId ? zmena(v) : v)));
  }

  function presun(skupina: "vybrani" | "nevybrani", odId: string, naId: string) {
    if (odId === naId) return;
    const presunout = <T,>(pole: T[], klic: (x: T) => string): T[] => {
      const od = pole.findIndex((x) => klic(x) === odId);
      const na = pole.findIndex((x) => klic(x) === naId);
      if (od === -1 || na === -1) return pole;
      const kopie = [...pole];
      const [prvek] = kopie.splice(od, 1);
      kopie.splice(na, 0, prvek!);
      return kopie;
    };
    if (skupina === "vybrani") {
      setVybrani(presunout(platniVybrani, (v) => v.steamId));
    } else {
      const nove = presunout(nevybrani.map((h) => h.steamId), (id) => id);
      setPoradiNevybranych(nove);
      ulozPoradi(nove);
    }
  }

  const tahani = (skupina: "vybrani" | "nevybrani", steamId: string) => ({
    draggable: true,
    onDragStart: () => {
      tazeny.current = { steamId, skupina };
    },
    onDragOver: (e: React.DragEvent) => {
      // Přetahovat jde jen v rámci skupiny; cizí tažení se nepřijme.
      if (tazeny.current?.skupina === skupina) e.preventDefault();
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (tazeny.current?.skupina === skupina) presun(skupina, tazeny.current.steamId, steamId);
      tazeny.current = null;
    },
    onDragEnd: () => {
      tazeny.current = null;
    },
  });

  const chyba = zkontrolujSestavu(platniVybrani);
  const format = popisFormatu(platniVybrani.map((v, poradi) => ({ ...v, poradi })));

  return (
    <div className="skladani">
      <p className="zaloha">
        Klikni na hráče, tím ho vybereš. Levé tlačítko myši na barvě nebo týmu jde dopředu, pravé
        zpátky. Pořadí přetáhni myší — je to pořadí slotů v lobby.
      </p>

      <ul className="sestava" data-testid="vybrani">
        {platniVybrani.map((v) => {
          const hrac = podleId.get(v.steamId)!;
          return (
            <li key={v.steamId} className={`radek vybrany barva-${v.barva}`} {...tahani("vybrani", v.steamId)}>
              <span className="uchyt" aria-hidden="true">
                ⋮⋮
              </span>
              <button
                type="button"
                className={`volba volba-barva barva-${v.barva}`}
                aria-label={`Barva ${jmeno(hrac)}: ${BARVA_NAZEV[v.barva]}`}
                title="Levé tlačítko další barva, pravé předchozí"
                onClick={() => uprav(v.steamId, (x) => ({ ...x, barva: dalsi(BARVY, x.barva, 1) }))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  uprav(v.steamId, (x) => ({ ...x, barva: dalsi(BARVY, x.barva, -1) }));
                }}
              >
                {v.barva}
              </button>
              <button
                type="button"
                className="volba volba-tym"
                aria-label={`Tým ${jmeno(hrac)}: ${v.tym === 0 ? "bez týmu" : v.tym}`}
                title="Levé tlačítko další tým, pravé předchozí"
                onClick={() => uprav(v.steamId, (x) => ({ ...x, tym: dalsi(TYMY, x.tym, 1) }))}
                onContextMenu={(e) => {
                  e.preventDefault();
                  uprav(v.steamId, (x) => ({ ...x, tym: dalsi(TYMY, x.tym, -1) }));
                }}
              >
                {v.tym === 0 ? "–" : v.tym}
              </button>
              <button type="button" className="jmeno" onClick={() => odeber(v.steamId)} title="Kliknutím vyřadíš ze sestavy">
                {jmeno(hrac)}
                {hrac.elo1v1 !== null ? <small> ({hrac.elo1v1})</small> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="sestava nevybrani" data-testid="nevybrani">
        {nevybrani.map((hrac) => (
          <li key={hrac.steamId} className="radek nevybrany" {...tahani("nevybrani", hrac.steamId)}>
            <span className="uchyt" aria-hidden="true">
              ⋮⋮
            </span>
            <button type="button" className="jmeno" onClick={() => vyber(hrac.steamId)} title="Kliknutím vybereš do sestavy">
              {jmeno(hrac)}
              {hrac.elo1v1 !== null ? <small> ({hrac.elo1v1})</small> : null}
            </button>
          </li>
        ))}
      </ul>

      <p className="zaloha" data-testid="souhrn-sestavy">
        {platniVybrani.length === 0 ? "Nikdo není vybraný." : chyba ? `${format || "Sestava"} — ${chyba}` : `Formát: ${format}`}
      </p>
      <button
        type="button"
        className="vytvorit"
        disabled={chyba !== null}
        onClick={() => {
          onVytvoritZapas(platniVybrani.map((v) => ({ steamId: v.steamId, tym: v.tym, barva: v.barva })));
          setVybrani([]);
        }}
      >
        Vytvořit zápas ({platniVybrani.length})
      </button>
    </div>
  );
}

export type { Tym };
