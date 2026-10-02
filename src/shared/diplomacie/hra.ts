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
  /**
   * Otisk kódu sondy (sonda.xs), který kopie nese. Chybí u sond přibalených
   * před 2. 10. 2026 — ty zapisují soubor u každého hráče a jsou zastaralé.
   */
  revize?: string | null;
  /** Co na nalezených cílech nevypadá jako úplné rozdání (věty z sonda.py). */
  varovani?: string[];
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
  /**
   * Kopie nese jiný kód sondy, než má web teď (např. sondu z doby, kdy se
   * soubor zapisoval u každého hráče) — chce to „Přibalit sondu“ znovu.
   */
  zastarala: boolean;
  /** Co na nalezených cílech nevypadá jako úplné rozdání. */
  varovani: string[];
}

/** `aktualniRevize` je otisk dnešního sonda.xs; null = web ho neumí zjistit a nic za zastaralé neoznačí. */
export function souhrnSondy(sonda: SondaScenare, aktualniRevize: string | null): SouhrnSondy {
  return {
    cilu: sonda.cile.length,
    oznaceno: sonda.oznaceno,
    chyba: sonda.chyba,
    zastarala: sonda.chyba === null && aktualniRevize !== null && (sonda.revize ?? null) !== aktualniRevize,
    varovani: sonda.varovani ?? [],
  };
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
    // Starší záznamy v databázi revizi ani varování nemají.
    revize: o["revize"] === undefined || o["revize"] === null ? null : text(o["revize"], "revize"),
    varovani: o["varovani"] === undefined ? [] : pole(o["varovani"], "varovani").map((x) => text(x, "varování")),
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
  /**
   * Kdo snímek posílá: most posílá jméno složky profilu hry (Steam ID nebo
   * XUID) počítače, na kterém běží — GM, nebo divák. Starší most posílal
   * totéž pod jménem `gm`.
   */
  odesilatel: string;
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
  // `gm` je jméno pole ze starších verzí mostu.
  const odesilatel = kratky(o["odesilatel"] ?? o["gm"], "odesilatel", 64);
  if (odesilatel === "") throw new Error("Data ze hry: chybí odesilatel.");
  const hraci = pole(o["hraci"], "hraci");
  if (hraci.length > 8) throw new Error("Data ze hry: hráčů je nejvýš 8.");
  return {
    odesilatel,
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

/**
 * Odkud snímek přišel: z PC GM zápasu („gm“), nebo z PC diváka („divak“) —
 * sonda píše soubor na každém počítači ve hře. Divák vidí hru se zpožděním
 * pro diváky, jeho data jsou o to starší.
 */
export type ZdrojHry = "gm" | "divak";

/** Snímek diváka se nepoužije, když od GM téhož zápasu přišel snímek před méně než tolika ms. */
export const DIVAK_USTUPUJE_GM_MS = 20_000;

/** Běžící zápas Diplomacie otevřené akce, jak ho vidí příjem snímků. */
export interface BeziciZapasDiplo {
  zapasId: number;
  /** Kdo sedí na šedé (GM); null = šedou nikdo neobsadil. */
  gmHracId: string | null;
  /** Jméno souboru verze scénáře, kterou si zápas otiskl; null = bez scénáře. */
  jmenoScenare: string | null;
}

/** Jméno scénáře bez přípony, malými: sonda ho hlásí podle jména svého souboru. */
const zakladJmena = (jmeno: string) => jmeno.replace(/\.aoe2scenario$/i, "").toLowerCase();

/** Jde o tentýž scénář? Velikost písmen a přípona `.aoe2scenario` se nepočítají. */
export function stejnyScenar(a: string, b: string): boolean {
  return zakladJmena(a) === zakladJmena(b);
}

/**
 * Ke kterému zápasu snímek patří. `bezici` jsou běžící zápasy Diplomacie
 * otevřené akce od nejnověji založeného, `odesilatel` možná id odesílatele
 * (Steam ID a totéž s předponou `xbox:`).
 *
 * (a) Odesílatel je GM běžícího zápasu → ten (u víc nejnovější), zdroj „gm“.
 * (b) Jinak je to divák: zápas se pozná jen tehdy, když běží **jediný**
 *     a hraje scénář, který hra hlásí — zdroj „divak“. U víc běžících
 *     zápasů by se data diváka nedala přiřadit bez hádání.
 * Jinak null.
 */
export function vyberZapasSnimku(bezici: readonly BeziciZapasDiplo[], odesilatel: readonly string[], scenar: string): { zapasId: number; zdroj: ZdrojHry } | null {
  const gmuv = bezici.find((z) => z.gmHracId !== null && odesilatel.includes(z.gmHracId));
  if (gmuv) return { zapasId: gmuv.zapasId, zdroj: "gm" };
  const jediny = bezici.length === 1 ? bezici[0]! : null;
  if (jediny && jediny.jmenoScenare !== null && stejnyScenar(jediny.jmenoScenare, scenar)) return { zapasId: jediny.zapasId, zdroj: "divak" };
  return null;
}

/** Česká věta pro 404, když `vyberZapasSnimku` zápas nenašel. */
export function procBezZapasu(bezici: readonly BeziciZapasDiplo[], odesilatel: string, scenar: string): string {
  if (bezici.length === 0) return "Na webu teď neběží žádný zápas Diplomacie.";
  if (bezici.length > 1)
    return `${odesilatel} není GM žádného běžícího zápasu Diplomacie a zápasů běží víc (${bezici.length}) — data diváka nejde přiřadit. Pusť most na PC GM.`;
  const hraje = bezici[0]!.jmenoScenare;
  return hraje === null
    ? `${odesilatel} není GM běžícího zápasu Diplomacie a zápas nemá scénář — data diváka nejde přiřadit.`
    : `${odesilatel} není GM běžícího zápasu Diplomacie a hra hlásí scénář „${scenar}“, zápas ale hraje „${hraje}“ — data diváka nejde přiřadit.`;
}

/**
 * Přednost GM: snímek diváka se nepoužije, dokud od GM téhož zápasu chodí
 * data (poslední před méně než `DIVAK_USTUPUJE_GM_MS`). GM vidí hru bez
 * zpoždění pro diváky; divák je jen záloha, když GM most nepouští.
 */
export function divakUstupuje(zdroj: ZdrojHry, posledniOdGmMs: number | null, tedMs: number): boolean {
  return zdroj === "divak" && posledniOdGmMs !== null && tedMs - posledniOdGmMs < DIVAK_USTUPUJE_GM_MS;
}

/** Co GM vidí ze hry u svého zápasu (`rezim.data.zapasy[i].hra`; ostatním redakce maže). */
export interface HraZapasu {
  /** Herní čas v sekundách. */
  cas: number;
  /** Kdy server snímek přijal (ISO) — pult z toho počítá stáří dat. */
  prijato: string;
  /** Odkud snímek přišel; chybí u dat přijatých před 2. 10. 2026 (jen z PC GM). */
  zdroj?: ZdrojHry;
  /** Hra už cíle rozdává: aspoň jeden hráč nějaký má. */
  rozdano: boolean;
  /**
   * Nástupce podle hry; null, dokud to není jednoznačné. `vyhodnotHru` sem
   * dává odpověď jednoho snímku, server ji před uložením nahradí odpovědí
   * potvrzenou dvěma snímky (`posunKandidata`).
   */
  nastupceHracId: string | null;
  /** Hráči zápasu bez GM, v pořadí, v jakém je dostala `vyhodnotHru`. */
  hraci: HracHry[];
  /** Česká věta, když data nesedí k zápasu (jiný scénář, verze bez výpisu cílů). */
  varovani?: string;
}

/**
 * Jak dlouho (v herních sekundách) musí hra jmenovat téhož Nástupce, než se
 * mu věří. Cíle se rozdávají postupně: ve chvíli, kdy je má šest hráčů ze
 * sedmi, vypadá sedmý jako Nástupce, i když svůj cíl dostane o pár sekund
 * později.
 */
export const STALOST_NASTUPCE_S = 4;
/** Herní čas klesl o víc než tolik sekund = nová hra, ne přeházené doručení. */
export const NOVA_HRA_POKLES_S = 30;

/** Koho hra právě jmenuje a od kterého herního času bez přerušení. */
export interface KandidatNastupce {
  hracId: string;
  odCasu: number;
}

/**
 * Posune kandidáta o jeden snímek. Potvrzený je ten, koho hra jmenovala ve
 * dvou po sobě jdoucích snímcích aspoň `STALOST_NASTUPCE_S` herních sekund
 * od sebe; jiné jméno nebo žádné počítání ruší a začíná znovu.
 */
export function posunKandidata(kandidat: KandidatNastupce | null, odpoved: string | null, cas: number): { kandidat: KandidatNastupce | null; potvrzeny: string | null } {
  if (odpoved === null) return { kandidat: null, potvrzeny: null };
  const dalsi = kandidat !== null && kandidat.hracId === odpoved ? kandidat : { hracId: odpoved, odCasu: cas };
  return { kandidat: dalsi, potvrzeny: cas - dalsi.odCasu >= STALOST_NASTUPCE_S ? odpoved : null };
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

/** Stáří dat ze hry: „ze hry (GM) před 4 s“, „ze hry (divák) před 4 s“, nebo „hra mlčí 2 min“. */
export function popisStari(sekund: number, zdroj?: ZdrojHry): string {
  const s = Math.max(0, Math.round(sekund));
  const odkud = zdroj === "gm" ? " (GM)" : zdroj === "divak" ? " (divák)" : "";
  if (s < HRA_MLCI_PO_S) return `ze hry${odkud} před ${s} s`;
  return s < 120 ? `hra mlčí ${s} s` : `hra mlčí ${Math.floor(s / 60)} min`;
}
