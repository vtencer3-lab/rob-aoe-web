import type { Barva } from "../types.js";
import { overovace } from "./overeni.js";

/**
 * Data z běžící hry (most ke hře, podprojekt 2). XS sonda přibalená do
 * scénáře píše stav hry do souboru, most na PC GM ho posílá na web a web
 * z něj odvodí, kdo je Nástupce císaře a jak jsou hráči daleko s cíli.
 * Tady jsou jen čisté funkce a tvary — bez sítě a databáze.
 */

/** Proměnná 200 + slot scénáře nese číslo proměnné-počitadla přiděleného cíle (0 = bez cíle). */
export const PROMENNA_CILE = 200;
export const POCET_PROMENNYCH = 256;

/** Jeden sekundární cíl jednoho slotu, jak ho při přibalení sondy vytáhl sonda.py z triggerů. */
export interface CilSondy {
  /** Proměnná-počitadlo cíle. */
  promenna: number;
  /** Slot scénáře 1–8 (= barva v sestavě zápasu). */
  slot: number;
  /** Popis z triggeru cíle se zástupkou „{}“ místo hodnoty počitadla. */
  text: string;
  limit: number;
}

/** Co se o sondě ukládá k verzi scénáře (`diplo_scenar.sonda`). */
export interface SondaScenare {
  cile: CilSondy[];
  /** Kolik triggerů přidělení cíle dostalo zápis do proměnné 200 + slot. */
  oznaceno: number;
  /** Proč se sondu nepodařilo přibalit; null = kopie se sondou existuje. */
  chyba: string | null;
}

/**
 * Co o sondě verze jde do stavu pro prohlížeče: výpis cílů (u LLC 42
 * položek) potřebuje jen server při vyhodnocení snímku, a stav se rozesílá
 * celý každému při každé změně.
 */
export interface SouhrnSondy {
  /** Kolik cílů sonda ve scénáři našla. */
  cilu: number;
  oznaceno: number;
  /** Proč se sondu nepodařilo přibalit; null = kopie se sondou existuje. */
  chyba: string | null;
}

export function souhrnSondy(sonda: SondaScenare): SouhrnSondy {
  return { cilu: sonda.cile.length, oznaceno: sonda.oznaceno, chyba: sonda.chyba };
}

/** Ověří tvar výstupu sonda.py i JSON z databáze. */
export function prectiSondu(json: unknown): SondaScenare {
  const { celeCislo, text, pole, objekt } = overovace("Sonda");
  const o = objekt(json, "výsledek");
  return {
    cile: pole(o["cile"], "cile").map((x, i) => {
      const c = objekt(x, `cíl ${i}`);
      return { promenna: celeCislo(c["promenna"], "cíl.promenna"), slot: celeCislo(c["slot"], "cíl.slot"), text: text(c["text"], "cíl.text"), limit: celeCislo(c["limit"], "cíl.limit") };
    }),
    oznaceno: celeCislo(o["oznaceno"], "oznaceno"),
    chyba: o["chyba"] === undefined || o["chyba"] === null ? null : text(o["chyba"], "chyba"),
  };
}

/** Záznam hráče ve hře podle čísla hráče (pořadí v lobby, ne slot scénáře). */
export interface HracVeHre {
  cislo: number;
  jmeno: string;
  /** Značka barvy ze hry (`xsGetPlayerColorTag`), jen pro kontrolu člověkem. */
  barva: string;
  relikvie: number;
  zije: boolean;
}

/** Tělo `POST /api/diplo/hra` — jedno platné čtení souboru sondy (formát 3). */
export interface SnimekHry {
  /** `hracId` GM; most posílá jméno složky profilu hry (Steam ID nebo XUID). */
  gm: string;
  /** Jméno scénáře podle jména souboru sondy. */
  scenar: string;
  /** Herní čas v sekundách. */
  cas: number;
  /** `sloty[i]` = číslo hráče ve hře na slotu scénáře `i + 1`. */
  sloty: number[];
  hraci: HracVeHre[];
  diplomacie: number[][];
  promenne: number[];
}

/** Ověří tělo od mostu; chyba je česká věta pro odpověď 400. */
export function prectiSnimek(telo: unknown): SnimekHry {
  const { cislo, celeCislo, text, pole, objekt } = overovace("Data ze hry");
  const o = objekt(telo, "tělo");
  if (o["v"] !== 1) throw new Error("Data ze hry: neznámá verze zprávy (čekána 1).");
  const delka = (v: unknown, kde: string, n: number): unknown[] => {
    const p = pole(v, kde);
    if (p.length !== n) throw new Error(`Data ze hry: ${kde} má mít ${n} položek.`);
    return p;
  };
  const kratky = (v: unknown, kde: string, max: number): string => {
    const t = text(v, kde);
    if (t.length > max) throw new Error(`Data ze hry: ${kde} je moc dlouhé.`);
    return t;
  };
  const gm = kratky(o["gm"], "gm", 64);
  if (gm === "") throw new Error("Data ze hry: chybí gm.");
  const hraci = pole(o["hraci"], "hraci");
  if (hraci.length > 8) throw new Error("Data ze hry: hráčů je nejvýš 8.");
  return {
    gm,
    scenar: kratky(o["scenar"], "scenar", 200),
    cas: celeCislo(o["cas"], "cas"),
    sloty: delka(o["sloty"], "sloty", 8).map((x) => celeCislo(x, "slot")),
    hraci: hraci.map((x, i) => {
      const h = objekt(x, `hráč ${i}`);
      if (typeof h["zije"] !== "boolean") throw new Error("Data ze hry: hráč.zije není ano/ne.");
      return { cislo: celeCislo(h["cislo"], "hráč.cislo"), jmeno: kratky(h["jmeno"], "hráč.jmeno", 100), barva: kratky(h["barva"], "hráč.barva", 40), relikvie: cislo(h["relikvie"], "hráč.relikvie"), zije: h["zije"] };
    }),
    diplomacie: delka(o["diplomacie"], "diplomacie", 8).map((r) => delka(r, "řádek diplomacie", 8).map((x) => celeCislo(x, "postoj"))),
    promenne: delka(o["promenne"], "promenne", POCET_PROMENNYCH).map((x) => celeCislo(x, "proměnná")),
  };
}

/** Přidělený sekundární cíl hráče s postupem. Text a limit chybí, když verze scénáře nemá výpis cílů. */
export interface CilHrace {
  text: string | null;
  limit: number | null;
  hodnota: number;
}

export interface HracHry {
  hracId: string;
  /** Null = hra mu cíl nedala (zatím, nebo je to Nástupce). */
  cil: CilHrace | null;
  /** Null = slot ve hře nikdo neobsadil (hra o něm nic neposlala). */
  relikvie: number | null;
  zije: boolean | null;
}

/** Co GM vidí ze hry u svého zápasu (`rezim.data.zapasy[i].hra`; ostatním redakce maže). */
export interface HraZapasu {
  /** Herní čas v sekundách. */
  cas: number;
  /** Kdy server snímek přijal (ISO) — pult z toho počítá stáří dat. */
  prijato: string;
  /** Hra už cíle rozdává: aspoň jeden hráč nějaký má. */
  rozdano: boolean;
  /** Nástupce podle hry; null, dokud to není jednoznačné. */
  nastupceHracId: string | null;
  /** Hráči zápasu bez GM, v pořadí, v jakém je dostala `vyhodnotHru`. */
  hraci: HracHry[];
}

/**
 * Ze snímku hry odvodí stav hráčů zápasu. `hraci` jsou účastníci bez GM;
 * slot scénáře je jejich barva v sestavě. **Nástupce je jediný hráč bez
 * cíle** poté, co hra začala cíle rozdávat — při nule nebo víc hráčích bez
 * cíle je to nejednoznačné a nehádá se (null).
 */
export function vyhodnotHru(snimek: Pick<SnimekHry, "cas" | "sloty" | "hraci" | "promenne">, hraci: { hracId: string; barva: Barva }[], cile: CilSondy[], prijato: string): HraZapasu {
  const radky = hraci.map((h): HracHry => {
    const pocitadlo = snimek.promenne[PROMENNA_CILE + h.barva] ?? 0;
    // XS čísluje hráče podle pořadí v lobby: slot → číslo ve hře → záznam hráče.
    const cislo = snimek.sloty[h.barva - 1];
    const veHre = snimek.hraci.find((x) => x.cislo === cislo);
    const popis = cile.find((c) => c.promenna === pocitadlo && c.slot === h.barva) ?? cile.find((c) => c.promenna === pocitadlo);
    return {
      hracId: h.hracId,
      cil: pocitadlo === 0 ? null : { text: popis?.text ?? null, limit: popis?.limit ?? null, hodnota: snimek.promenne[pocitadlo] ?? 0 },
      relikvie: veHre ? veHre.relikvie : null,
      zije: veHre ? veHre.zije : null,
    };
  });
  const bezCile = radky.filter((r) => r.cil === null);
  const rozdano = bezCile.length < radky.length;
  return { cas: snimek.cas, prijato, rozdano, nastupceHracId: rozdano && bezCile.length === 1 ? bezCile[0]!.hracId : null, hraci: radky };
}

/** Postup cíle jednou řádkou: „zabito: 3/650 jednotek“. */
export function popisCile(cil: CilHrace): string {
  const hodnota = String(cil.hodnota);
  const veta = cil.text?.includes("{}") ? cil.text.replace("{}", hodnota) : `${cil.text ?? "cíl"}: ${hodnota}${cil.limit === null ? "" : `/${cil.limit}`}`;
  // Autor píše „zabito : 3 /650“ — mezery před dvojtečkou a lomítkem pryč.
  return veta.replace(/\s+([:/])/g, "$1").replace(/\/\s+/g, "/");
}

/** Po kolika sekundách bez snímku se o hře řekne, že mlčí (most posílá tep nejpozději po 15 s). */
export const HRA_MLCI_PO_S = 45;

/** Stáří dat ze hry: „ze hry před 4 s“, nebo „hra mlčí 2 min“. */
export function popisStari(sekund: number): string {
  const s = Math.max(0, Math.round(sekund));
  if (s < HRA_MLCI_PO_S) return `ze hry před ${s} s`;
  return s < 120 ? `hra mlčí ${s} s` : `hra mlčí ${Math.floor(s / 60)} min`;
}
