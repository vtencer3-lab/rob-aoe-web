import { useEffect, useRef, useState } from "react";
import { AI_HRACI, jeAi } from "../../src/shared/aiHraci.js";
import { MAX_HRACU } from "../../src/shared/sestava.js";
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
  /** Přidá do sestavy počítačového protivníka; nad osm slotů už neudělá nic. */
  pridejAi: () => void;
  odeber: (steamId: string) => void;
  uprav: (steamId: string, zmena: (v: SestavaVstup) => SestavaVstup) => void;
  presun: (skupina: Skupina, odId: string, naId: string) => void;
  vynuluj: () => void;
  /** Nasadí celou sestavu (zpět/znovu) — bez hlášení jako uživatelská změna. */
  nastavCelou: (sestava: SestavaVstup[]) => void;
}

/**
 * Rozpracovaná sestava žije na serveru u akce, ať ji vidí všichni admini
 * naráz: `hodnota` je to, co přišlo přes SSE, `odesli` ji po každé změně
 * pošle zpátky. Bez tohohle parametru je sestava jen v prohlížeči (testy).
 */
export interface SdileneSkladani {
  hodnota: SestavaVstup[];
  odesli: (sestava: SestavaVstup[]) => Promise<unknown>;
  /** Každá uživatelská změna (ne zpět/znovu): před a po, pro historii kroků. */
  naZmenu?: (pred: SestavaVstup[], po: SestavaVstup[]) => void;
}

/** Jak dlouho se čeká na další klik, než se rozpracovaná sestava pošle na server. */
export const ODKLAD_ODESLANI_MS = 200;

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

function stejnaSestava(a: SestavaVstup[], b: SestavaVstup[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.steamId === y.steamId && x.tym === y.tym && x.barva === y.barva && (x.civ ?? null) === (y.civ ?? null);
  });
}

/**
 * Jeden stav pro dvě místa na stránce: tabulka přihlášených ukazuje
 * nevybrané (s tlačítkem „+“), panel sestavy vybrané s barvou a týmem.
 * Vybraní se řadí mezi sebou, nevybraní mezi sebou; nikdy křížem. Pořadí
 * nevybraných si drží prohlížeč, pořadí vybraných odchází do zápasu jako
 * pořadí slotů v lobby.
 *
 * Se sdíleným stavem platí: co přijde ze serveru, je pravda; po vlastním
 * kliknutí se ukazuje lokální kopie jen do chvíle, než ji server potvrdí
 * (dorazí stejná přes SSE), nebo než doběhne odeslání. Druhý admin tak
 * nikdy nepřepíše rozkliknutou změnu v půlce, a naopak jeho změny se
 * ukážou hned, jakmile tady nic nečeká.
 */
export function useSkladani(prihlaseni: PlayerView[], sdilene?: SdileneSkladani): Skladani {
  const [lokalni, setLokalni] = useState<SestavaVstup[] | null>(sdilene ? null : []);
  const [poradiNevybranych, setPoradiNevybranych] = useState<string[]>(nactiPoradi);
  const casovac = useRef<ReturnType<typeof setTimeout>>(undefined);
  const kOdeslani = useRef<SestavaVstup[] | null>(null);
  const letici = useRef(0);
  const zeServeru = sdilene?.hodnota ?? [];

  useEffect(() => {
    if (!sdilene || lokalni === null) return;
    const nicNeceka = kOdeslani.current === null && letici.current === 0;
    if (nicNeceka || stejnaSestava(lokalni, zeServeru)) setLokalni(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sdilene?.hodnota]);

  useEffect(() => () => clearTimeout(casovac.current), []);

  const vybrani = lokalni ?? zeServeru;
  // AI se do akce nehlásí, takže v přihlášených nikdy není. Do mapy patří
  // přesto: podle ní se poznává, kdo ze sestavy vypadl, a počítač z ní
  // vypadnout nesmí.
  const podleId = new Map([...prihlaseni, ...AI_HRACI].map((h) => [h.steamId, h]));
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

  const nastav = (navrzene: SestavaVstup[], hlasit = true) => {
    // Kdo už není přihlášený, do sestavy nepatří — ani při zpět/znovu, kdy
    // by ho starý snímek vrátil natvrdo.
    const nove = navrzene.filter((v) => podleId.has(v.steamId));
    if (hlasit) sdilene?.naZmenu?.(platni, nove);
    setLokalni(nove);
    if (!sdilene) return;
    kOdeslani.current = nove;
    clearTimeout(casovac.current);
    casovac.current = setTimeout(() => {
      const sestava = kOdeslani.current;
      kOdeslani.current = null;
      if (!sestava) return;
      letici.current++;
      void sdilene.odesli(sestava).catch(() => {}).finally(() => {
        letici.current--;
      });
    }, ODKLAD_ODESLANI_MS);
  };

  const ulozNevybrane = (nove: string[]) => {
    setPoradiNevybranych(nove);
    ulozPoradi(nove);
  };

  return {
    vybrani: platni.map((vstup) => ({ vstup, hrac: podleId.get(vstup.steamId)! })),
    nevybrani,
    jeVybrany: (steamId) => vybraneId.has(steamId),
    vyber: (steamId) => {
      if (vybraneId.has(steamId) || !podleId.has(steamId) || platni.length >= MAX_HRACU) return;
      nastav([...platni, vychoziVstup(steamId, platni)]);
    },
    pridejAi: () => {
      if (platni.length >= MAX_HRACU) return;
      // První AI, která v sestavě ještě není: odebráním se id uvolní a použije
      // se znovu, takže čísla nerostou do nesmyslu.
      const volna = AI_HRACI.find((a) => !vybraneId.has(a.steamId));
      if (!volna) return;
      nastav([...platni, vychoziVstup(volna.steamId, platni)]);
    },
    odeber: (steamId) => {
      nastav(platni.filter((v) => v.steamId !== steamId));
      // Vyřazený jde na konec nevybraných; kdo v uloženém pořadí nebyl (nově
      // přihlášený), zůstává před ním v pořadí přihlášení. AI mezi nevybrané
      // nepatří — ta se nebere z tabulky přihlášených, ale vlastním tlačítkem.
      if (jeAi(steamId)) return;
      ulozNevybrane([...nevybrani.map((h) => h.steamId).filter((id) => id !== steamId), steamId]);
    },
    uprav: (steamId, zmena) => {
      nastav(platni.map((v) => (v.steamId === steamId ? zmena(v) : v)));
    },
    presun: (skupina, odId, naId) => {
      if (skupina === "vybrani") nastav(presunout(platni, (v) => v.steamId, odId, naId));
      else ulozNevybrane(presunout(nevybrani.map((h) => h.steamId), (id) => id, odId, naId));
    },
    vynuluj: () => nastav([]),
    nastavCelou: (sestava) => nastav(sestava, false),
  };
}
