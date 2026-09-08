import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Zvedne verzi na obou místech naráz: v `package.json` (npm) a v
 * `src/shared/verze.ts` (běžící kód, patička, `/api/health`).
 *
 * **Dva tvary verze.** Větve `main` a `dev` mají obyčejné `X.Y.Z`. Větev
 * `experimental` má navíc pomlčku a vlastní dvojčíslí: `X.Y.Z-A.B`, kde
 * `X.Y.Z` je verze `dev`, ze které pokus vyšel, a `A.B` je vlastní
 * verzování pokusu. Pokus **nikdy nemění první číslo** — to smí jen release
 * do `main`, a ten se dělá výhradně z `dev`.
 *
 * Pokusné verzování začíná zdvojením: `0.16.3` → `0.16.3-16.3`. Pak už se
 * hýbe jen dvojčíslí za pomlčkou (`16.4`, `16.5`, … a při velké změně `17.0`),
 * takže z verze je pořád vidět, odkud pokus vyšel a jak daleko došel. Po mergi
 * zpátky do devu se pokus **přezaloží z nové verze devu** — z devu `0.19.0` je
 * `0.19.0-19.0` — a další kolo pokusů začíná zase od zdvojení.
 *
 * Použití:
 *   npm run verze                       poslední číslo o jedna (0.16.3 → 0.16.4,
 *                                       na pokusu 0.16.3-16.4 → 0.16.3-16.5)
 *   npm run verze -- minor              prostřední číslo (0.16.3 → 0.17.0,
 *                                       na pokusu 0.16.3-16.4 → 0.16.3-17.0)
 *   npm run verze -- major              první číslo (jen mimo pokus)
 *   npm run verze -- experiment [V]     založí (nebo po mergi přezaloží) pokusné
 *                                       verzování ze základu V; bez argumentu
 *                                       z vlastní verze, a je-li už pokusná,
 *                                       z verze větve dev
 *   npm run verze -- z-experimentu [V]  po mergi experimental → dev, viz `verzePoMergi`
 *   npm run verze -- 1.2.3              přesně tahle
 */

const TVAR_ZAKLADNI = /^(\d+)\.(\d+)\.(\d+)$/;
const TVAR_POKUSNY = /^(\d+)\.(\d+)\.(\d+)-(\d+)\.(\d+)$/;

export interface Verze {
  /** `X.Y.Z` — na pokusné větvi verze devu, ze které pokus vyšel. */
  zaklad: [number, number, number];
  /** `A.B` za pomlčkou, nebo `null` u obyčejné verze. */
  pokus: [number, number] | null;
}

export function rozeber(verze: string): Verze {
  const pokusny = TVAR_POKUSNY.exec(verze);
  if (pokusny) {
    const [, x, y, z, a, b] = pokusny.map(Number) as unknown as number[];
    return { zaklad: [x!, y!, z!], pokus: [a!, b!] };
  }
  const zakladni = TVAR_ZAKLADNI.exec(verze);
  if (!zakladni) throw new Error(`Verze „${verze}“ nemá tvar X.Y.Z ani X.Y.Z-A.B.`);
  const [, x, y, z] = zakladni.map(Number) as unknown as number[];
  return { zaklad: [x!, y!, z!], pokus: null };
}

export function napis({ zaklad: [x, y, z], pokus }: Verze): string {
  return pokus ? `${x}.${y}.${z}-${pokus[0]}.${pokus[1]}` : `${x}.${y}.${z}`;
}

/**
 * Další verze podle pokynu. Pokyny znamenají pořád totéž („jak velká změna“),
 * jen se podle tvaru verze zapíšou jinam: na pokusné větvi do dvojčíslí za
 * pomlčkou, jinde do `X.Y.Z`.
 */
export function dalsiVerze(soucasna: string, pokyn: string): string {
  if (TVAR_ZAKLADNI.test(pokyn) || TVAR_POKUSNY.test(pokyn)) return pokyn;

  const { zaklad, pokus } = rozeber(soucasna);
  const [x, y, z] = zaklad;

  if (pokyn === "experiment") {
    if (pokus) {
      throw new Error(`Ze základu „${soucasna}“ pokus založit nejde — základ je vždycky verze devu, tedy X.Y.Z.`);
    }
    // Zdvojení: dvojčíslí pokusu začíná tam, kde je dev. Z verze je pak vidět
    // jak výchozí bod (před pomlčkou), tak posun pokusu (za ní).
    return napis({ zaklad, pokus: [y, z] });
  }

  if (pokus) {
    const [a, b] = pokus;
    if (pokyn === "patch") return napis({ zaklad, pokus: [a, b + 1] });
    if (pokyn === "minor") return napis({ zaklad, pokus: [a + 1, 0] });
    if (pokyn === "major") {
      throw new Error("Pokusná větev první číslo verze nemění — to smí jen release z dev do main.");
    }
    throw new Error(`Neznámý pokyn „${pokyn}“ — čekám patch, minor, experiment, z-experimentu nebo X.Y.Z.`);
  }

  if (pokyn === "patch") return napis({ zaklad: [x, y, z + 1], pokus: null });
  if (pokyn === "minor") return napis({ zaklad: [x, y + 1, 0], pokus: null });
  if (pokyn === "major") return napis({ zaklad: [x + 1, 0, 0], pokus: null });
  throw new Error(`Neznámý pokyn „${pokyn}“ — čekám patch, minor, major, experiment, z-experimentu nebo X.Y.Z.`);
}

/**
 * Verze pro `dev` po mergi pokusné větve. Rozhoduje **jediná otázka: zvedl
 * pokus svoje první číslo?**
 *
 * - Nezvedl (`0.16.3-16.28`, základ má taky 16) → v devu se přičte poslední
 *   číslo: z `0.16.3` je `0.16.4`, z `0.18.1` je `0.18.2`.
 * - Zvedl (`0.16.3-17.9` proti základu 16) → v devu se zvedne prostřední
 *   číslo: z `0.16.3` je `0.17.0`, z `0.18.1` je `0.19.0`.
 *
 * Počítá se vždycky z **aktuální verze devu**, ne z čísel pokusu. Dev mohl
 * mezitím ujet dopředu a jeho verze nikdy nesmí klesnout.
 */
export function verzePoMergi(verzeDev: string, verzeExperimentu: string): string {
  const dev = rozeber(verzeDev);
  if (dev.pokus) throw new Error(`Verze devu „${verzeDev}“ je pokusná — nejdřív vyřeš konflikt ve prospěch devu.`);

  const experiment = rozeber(verzeExperimentu);
  if (!experiment.pokus) {
    throw new Error(`Verze „${verzeExperimentu}“ není pokusná (chybí -A.B), takže není co slučovat.`);
  }
  const zvedlPrvniCislo = experiment.pokus[0] > experiment.zaklad[1];
  return dalsiVerze(verzeDev, zvedlPrvniCislo ? "minor" : "patch");
}

/**
 * Proč se v téhle větvi nesmí verze zvednout obvyklým způsobem, jinak `null`.
 *
 * Pokusná verze mimo pokusnou větev znamená nedodělaný merge: konflikt ve verzi
 * po mergi git často vyřeší sám ve prospěch experimentu a nikoho se nezeptá.
 * Kdyby se tady jen přičetlo číslo, jelo by se dál s cizím verzováním.
 *
 * Výslovně zadaná verze se nezakazuje — je to jediná cesta ven. Verze devu se
 * musí nastavit ručně, teprve pak dává `z-experimentu` smysl.
 */
export function duvodOdmitnuti(soucasna: string, pokyn: string, vetev: string | null): string | null {
  const vyslovna = TVAR_ZAKLADNI.test(pokyn) || TVAR_POKUSNY.test(pokyn);
  if (vyslovna || vetev === null || vetev === "experimental") return null;
  if (!rozeber(soucasna).pokus) return null;
  return `Ve větvi ${vetev} je pokusná verze ${soucasna}. Vezmi verzi z devu a spusť npm run verze -- z-experimentu ${soucasna}.`;
}

/** Verze z package.json v jiné větvi. Vrací `null`, když se ji nepovede přečíst. */
function verzeVetve(vetev: string): string | null {
  try {
    const pkg = execFileSync("git", ["show", `${vetev}:package.json`], { encoding: "utf8" });
    return (JSON.parse(pkg) as { version: string }).version;
  } catch {
    return null;
  }
}

function vetevHead(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
}

function zapis(nova: string): void {
  const koren = join(import.meta.dirname, "..");
  const cestaPkg = join(koren, "package.json");
  const cestaVerze = join(koren, "src", "shared", "verze.ts");

  const pkg = JSON.parse(readFileSync(cestaPkg, "utf8")) as { version: string };
  const stara = pkg.version;
  pkg.version = nova;
  writeFileSync(cestaPkg, JSON.stringify(pkg, null, 2) + "\n");

  const verzeTs = readFileSync(cestaVerze, "utf8");
  writeFileSync(cestaVerze, verzeTs.replace(/VERZE = "[^"]+"/, `VERZE = "${nova}"`));
  console.log(`verze ${stara} → ${nova}`);
}

function spust(): void {
  const koren = join(import.meta.dirname, "..");
  const soucasna = (JSON.parse(readFileSync(join(koren, "package.json"), "utf8")) as { version: string }).version;
  const pokyn = process.argv[2] ?? "patch";
  const vetev = vetevHead();

  if (pokyn === "experiment") {
    if (vetev !== null && vetev !== "experimental") {
      throw new Error(`Pokusné verzování patří do větve experimental, ne do ${vetev}.`);
    }
    // Po mergi zpátky do devu se pokus zakládá znovu, a to z nové verze devu:
    // vlastní verze je v tu chvíli ještě ta stará pokusná, tak se základ vezme
    // z větve dev.
    const jeUzPokusna = rozeber(soucasna).pokus !== null;
    const zaklad = process.argv[3] ?? (jeUzPokusna ? verzeVetve("dev") : soucasna);
    if (!zaklad) {
      throw new Error("Nepovedlo se přečíst verzi větve dev — předej základ jako argument: npm run verze -- experiment 0.19.0");
    }
    zapis(dalsiVerze(zaklad, "experiment"));
    return;
  }

  if (pokyn === "z-experimentu") {
    const verzeExperimentu = process.argv[3] ?? verzeVetve("experimental");
    if (!verzeExperimentu) {
      throw new Error("Nepovedlo se přečíst verzi větve experimental — předej ji jako argument: npm run verze -- z-experimentu 0.16.3-17.9");
    }
    zapis(verzePoMergi(soucasna, verzeExperimentu));
    return;
  }

  const duvod = duvodOdmitnuti(soucasna, pokyn, vetev);
  if (duvod) throw new Error(duvod);

  zapis(dalsiVerze(soucasna, pokyn));
}

// Testy si soubor importují kvůli funkcím výše; zapisovat při tom nesmí.
if (process.argv[1]?.endsWith("verze.ts")) spust();
