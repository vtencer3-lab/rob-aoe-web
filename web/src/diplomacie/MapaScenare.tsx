import type { CSSProperties } from "react";
import { BARVA_NAZEV, type Barva } from "../../../src/shared/types.js";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { PolohaVeHre } from "../../../src/shared/diplomacie/hra.js";
import { naMinimapu } from "../../../src/shared/diplomacie/minimapa.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { diploApi } from "./api.js";
import { ZNAK_ROLE } from "./znaky.js";

/**
 * Čím je start pro toho, kdo se na mapu dívá: jeho vlastní, druhý Nájezdník,
 * oběť Kata, pokrevní pouto Žoldáka, Nástupce císaře. Jeden start může nést
 * víc druhů naráz (vlastní start Nástupce, oběť, která je Nástupcem).
 */
export type DruhPopisku = "ja" | "spojenec" | "obet" | "pouto" | "nastupce";

/** Co u startu stojí a čím je; bez druhů je to obyčejný popisek (jméno u GM, název barvy ve správě scénáře). */
export interface PopisekStartu {
  text: string;
  druhy?: readonly DruhPopisku[];
}

/** Popisky podle barvy startu; barva bez záznamu se na mapě nekreslí vůbec. */
export type PopiskyStartu = Partial<Record<Barva, PopisekStartu>>;

/** Král z běžící hry na minimapě: barva hráče a místo 0–1 (`kralNaMape`). */
export interface KralNaMape {
  barva: Barva;
  x: number;
  y: number;
}

/**
 * Poloha krále ze hry (dílce) → značka na minimapě verze. Null, když verze
 * nemá rozbor (neznáme velikost mapy) nebo hráč barvu v zápase.
 */
export function kralNaMape(verze: ScenarVerze, barva: Barva | undefined, poloha: PolohaVeHre | null | undefined): KralNaMape | null {
  if (!verze.rozbor || barva === undefined || !poloha) return null;
  return { barva, ...naMinimapu(poloha.x, poloha.y, verze.rozbor.velikostMapy) };
}

interface Props {
  verze: ScenarVerze;
  /** Které starty ukázat a co u nich stojí; bez popisků je mapa jen obrázek. */
  popisky?: PopiskyStartu;
  velikost?: "mala" | "velka";
  /** Najetí na start (pult GM ukáže vztahy toho hráče); null = kurzor odjel. */
  onNajeti?: (barva: Barva | null) => void;
  /** Start, na kterém je kurzor (z mapy nebo z řádku tabulky) — zvýrazní se. */
  najeto?: Barva | null;
  /** Králové z běžící hry: GM vidí všechny, hráč jen svého (redakce). */
  kralove?: readonly KralNaMape[];
}

/**
 * Popisek u každého startu scénáře: jméno, kdo na barvě sedí, jinak název
 * barvy. Tak mapu kreslí pult GM (se jmény) i správa scénáře (bez nich).
 */
export function popiskyStartu(verze: ScenarVerze, jmena: Partial<Record<Barva, string>> = {}): PopiskyStartu {
  return Object.fromEntries((verze.rozbor?.starty ?? []).map((s) => [s.barva, { text: jmena[s.barva] ?? BARVA_NAZEV[s.barva] }]));
}

/** Pořadí druhů v bublině a ve třídách značky — nejdřív to, co vidí každý. */
const PORADI_DRUHU: readonly DruhPopisku[] = ["nastupce", "obet", "pouto", "spojenec", "ja"];

/** Jak druh pojmenovat v bublině popisku; vlastní start se popisuje sám („Tady začínáš“). */
const NAZEV_DRUHU: Record<Exclude<DruhPopisku, "ja">, string> = {
  nastupce: NAZEV_ROLE.nastupce,
  obet: "tvá oběť",
  pouto: "pokrevní pouto",
  spojenec: "druhý Nájezdník",
};

const serazene = (druhy: readonly DruhPopisku[]) => PORADI_DRUHU.filter((d) => druhy.includes(d));

/** Nájezdníci můžou být i tři (GM smí rozeslat nestandardní složení): pak je spojenec „další“, ne „druhý“. */
const nazevDruhu = (d: Exclude<DruhPopisku, "ja">, spojencu: number) => (d === "spojenec" && spojencu > 1 ? "další Nájezdník" : NAZEV_DRUHU[d]);

/** Bublina popisku: text a za pomlčkou, čím hráč pro diváka je. */
function bublina(p: PopisekStartu, spojencu: number): string {
  const cim = serazene(p.druhy ?? []).flatMap((d) => (d === "ja" ? [] : [nazevDruhu(d, spojencu)]));
  return cim.length > 0 ? `${p.text} — ${cim.join(", ")}` : p.text;
}

/**
 * Minimapa scénáře z rozboru (spec §5.4). Obrázek je jeden pro všechny,
 * starty jsou překryv — souřadnice 0–1 z rozboru, takže sedí při každé
 * velikosti. Barvy značek jsou třídy `barva-N` z palety, ne čísla napevno.
 * Vlastní mapa (obrázek ze hry, `minimapaVlastni`) má kosočtverce hráčů už
 * v sobě: značky zůstávají kvůli popiskům, kolečko schová CSS (`.vlastni`).
 *
 * Co se u kterého startu ukáže, říká volající jedním způsobem pro všechna
 * místa (`popisky`): karta role dává vlastní start a hráče, ke kterým má
 * divák vztah, pult GM a správa scénáře všechny starty (`popiskyStartu`).
 * Druh popisku je třída `druh-*` na značce — vzhled je v CSS; Nástupce
 * císaře má nad značkou korunu (znak role), u vlastní mapy nad kosočtvercem.
 */
export function MapaScenare({ verze, popisky = {}, velikost = "mala", onNajeti, najeto = null, kralove = [] }: Props) {
  if (!verze.rozbor) return null;
  const viditelne = verze.rozbor.starty.flatMap((s) => {
    const popisek = popisky[s.barva];
    return popisek ? [{ ...s, popisek, druhy: serazene(popisek.druhy ?? []) }] : [];
  });
  const spojencu = viditelne.filter((s) => s.druhy.includes("spojenec")).length;
  return (
    <figure className={`mapa-scenare ${velikost}${verze.minimapaVlastni ? " vlastni" : ""}`}>
      <img src={diploApi.minimapaUrl(verze.id, verze.minimapaOtisk)} alt={`Mapa scénáře ${verze.jmenoSouboru}`} width={verze.rozbor.minimapa.sirka} height={verze.rozbor.minimapa.vyska} />
      {viditelne.map((s) => (
        <span
          key={s.barva}
          data-testid="start"
          className={`start barva-${s.barva}${s.druhy.map((d) => ` druh-${d}`).join("")}${najeto === s.barva ? " najeto" : ""}`}
          onMouseEnter={onNajeti ? () => onNajeti(s.barva) : undefined}
          onMouseLeave={onNajeti ? () => onNajeti(null) : undefined}
          // `--x` čte CSS: popisek drží osu značky, dokud se vejde do mapy, jinak se posune dovnitř.
          style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, "--x": s.x } as CSSProperties}
          title={BARVA_NAZEV[s.barva]}
        >
          {s.druhy.includes("nastupce") ? <img className="koruna" src={ZNAK_ROLE.nastupce} alt={NAZEV_ROLE.nastupce} width={208} height={208} /> : null}
          <span className="popisek" title={bublina(s.popisek, spojencu)}>
            {s.popisek.text}
          </span>
        </span>
      ))}
      {kralove.map((k) => (
        <span
          key={`kral-${k.barva}`}
          data-testid="kral"
          className={`kral barva-${k.barva}`}
          style={{ left: `${k.x * 100}%`, top: `${k.y * 100}%` }}
          title={`Král — ${BARVA_NAZEV[k.barva]}`}
        >
          ♚
        </span>
      ))}
    </figure>
  );
}
