import { useState } from "react";
import { BARVY, type PlayerView, type SestavaVstup, type Tym } from "../../src/shared/types.js";

export type Skupina = "vybrani" | "nevybrani";

export interface VybranyHrac {
  vstup: SestavaVstup;
  hrac: PlayerView;
}

/** Stav skládání sestavy sdílený tabulkou přihlášených (nevybraní) a panelem sestavy (vybraní). */
export interface Skladani {
  vybrani: VybranyHrac[];
  nevybrani: PlayerView[];
  jeVybrany: (steamId: string) => boolean;
  vyber: (steamId: string) => void;
  odeber: (steamId: string) => void;
  uprav: (steamId: string, zmena: (v: SestavaVstup) => SestavaVstup) => void;
  presun: (skupina: Skupina, odId: string, naId: string) => void;
  vynuluj: () => void;
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

/**
 * Výchozí tým nově vybraného: střídavě 1, 2, 1, 2 podle pořadí výběru. Pro
 * 1v1 to sedí rovnou, u 2v2 stačí prohodit jedno tlačítko. Barva je první
 * volná, takže první dva hráči jsou modrý a červený jako ve hře.
 */
export function vychoziVstup(steamId: string, vybrani: SestavaVstup[]): SestavaVstup {
  const obsazene = new Set(vybrani.map((v) => v.barva));
  const barva = BARVY.find((b) => !obsazene.has(b)) ?? 1;
  const tym: Tym = vybrani.length % 2 === 0 ? 1 : 2;
  return { steamId, tym, barva, civ: null };
}

function presunout<T>(pole: T[], klic: (x: T) => string, odId: string, naId: string): T[] {
  const od = pole.findIndex((x) => klic(x) === odId);
  const na = pole.findIndex((x) => klic(x) === naId);
  if (od === -1 || na === -1 || od === na) return pole;
  const kopie = [...pole];
  const [prvek] = kopie.splice(od, 1);
  kopie.splice(na, 0, prvek!);
  return kopie;
}

/**
 * Jeden stav pro dvě místa na stránce: tabulka přihlášených ukazuje
 * nevybrané (s tlačítkem „+“), panel sestavy vybrané s barvou a týmem.
 * Vybraní se řadí mezi sebou, nevybraní mezi sebou; nikdy křížem. Pořadí
 * nevybraných si drží prohlížeč, pořadí vybraných odchází do zápasu jako
 * pořadí slotů v lobby.
 */
export function useSkladani(prihlaseni: PlayerView[]): Skladani {
  const [vybrani, setVybrani] = useState<SestavaVstup[]>([]);
  const [poradiNevybranych, setPoradiNevybranych] = useState<string[]>(nactiPoradi);

  const podleId = new Map(prihlaseni.map((h) => [h.steamId, h]));
  // Kdo se odhlásil z akce, ze sestavy vypadne sám.
  const platni = vybrani.filter((v) => podleId.has(v.steamId));
  const vybraneId = new Set(platni.map((v) => v.steamId));
  const nevybrani = [...prihlaseni]
    .filter((h) => !vybraneId.has(h.steamId))
    .sort((a, b) => {
      const ia = poradiNevybranych.indexOf(a.steamId);
      const ib = poradiNevybranych.indexOf(b.steamId);
      return (ia === -1 ? Number.MAX_SAFE_INTEGER : ia) - (ib === -1 ? Number.MAX_SAFE_INTEGER : ib);
    });

  const ulozNevybrane = (nove: string[]) => {
    setPoradiNevybranych(nove);
    ulozPoradi(nove);
  };

  return {
    vybrani: platni.map((vstup) => ({ vstup, hrac: podleId.get(vstup.steamId)! })),
    nevybrani,
    jeVybrany: (steamId) => vybraneId.has(steamId),
    vyber: (steamId) => {
      if (vybraneId.has(steamId) || !podleId.has(steamId)) return;
      setVybrani([...platni, vychoziVstup(steamId, platni)]);
    },
    odeber: (steamId) => {
      setVybrani(platni.filter((v) => v.steamId !== steamId));
      // Vyřazený jde na konec nevybraných; kdo v uloženém pořadí nebyl (nově
      // přihlášený), zůstává před ním v pořadí přihlášení.
      ulozNevybrane([...nevybrani.map((h) => h.steamId).filter((id) => id !== steamId), steamId]);
    },
    uprav: (steamId, zmena) => {
      setVybrani(platni.map((v) => (v.steamId === steamId ? zmena(v) : v)));
    },
    presun: (skupina, odId, naId) => {
      if (skupina === "vybrani") setVybrani(presunout(platni, (v) => v.steamId, odId, naId));
      else ulozNevybrane(presunout(nevybrani.map((h) => h.steamId), (id) => id, odId, naId));
    },
    vynuluj: () => setVybrani([]),
  };
}
