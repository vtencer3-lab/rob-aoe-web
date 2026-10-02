import { popisCile, popisStari, type HraZapasu } from "../../../src/shared/diplomacie/hra.js";
import type { UcastnikView } from "../../../src/shared/types.js";
import { useTed } from "../useTed.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";

/**
 * Data z běžící hry v pultu GM (most ke hře): server je posílá jen GM
 * zápasu ve větvi `hra` a bez nich tyhle komponenty nekreslí nic — pult se
 * pak chová jako před mostem.
 */

/** Herní čas jako ve hře: „1:02:03“, do hodiny „12:34“. */
function herniCas(s: number): string {
  const dve = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${dve(m)}:${dve(s % 60)}` : `${m}:${dve(s % 60)}`;
}

/** Jak čerstvá data ze hry jsou: „ze hry před 4 s“, po delším tichu „hra mlčí 2 min“. */
export function StariHry({ hra }: { hra: HraZapasu | undefined }) {
  // Stáří roste samo — bez tikání by „před 4 s“ viselo do příští zprávy.
  const ted = useTed(1000);
  if (!hra) return null;
  return (
    <p className="stari-hry" data-testid="stari-hry">
      {popisStari((ted - Date.parse(hra.prijato)) / 1000)} · herní čas {herniCas(hra.cas)}
    </p>
  );
}

/** V přípravě: koho hra nechala bez sekundárního cíle. Server ho rovnou nastavil, GM ho může přepsat dlaždicí. */
export function NastupceZeHry({ hra, ucastnici }: { hra: HraZapasu | undefined; ucastnici: readonly UcastnikView[] }) {
  if (!hra || hra.nastupceHracId === null) return null;
  return (
    <p className="nastupce-ze-hry" data-testid="nastupce-ze-hry">
      Nástupce určila hra:{" "}
      <strong>
        <JmenoUcastnika ucastnici={ucastnici} hracId={hra.nastupceHracId} />
      </strong>
    </p>
  );
}

/**
 * Drobný řádek pod hráčem v tabulce GM: sekundární cíl s postupem, relikvie,
 * vyřazení. Vlastní řádek tabulky přes celou šířku, ne text v buňce: na
 * telefonu má poslední sloupec 88 px a věta by se v něm lámala do pěti řádků.
 */
export function RadekHry({ hra, hracId }: { hra: HraZapasu | undefined; hracId: string }) {
  const h = hra?.hraci.find((x) => x.hracId === hracId);
  if (!hra || !h) return null;
  const casti = [
    // Dokud hra cíle nerozdává, „bez cíle“ by platilo o všech a nic neříkalo.
    h.cil ? popisCile(h.cil) : hra.rozdano ? "bez cíle" : null,
    h.relikvie === null ? null : `relikvie ${h.relikvie}`,
    h.zije === false ? "vyřazen" : null,
  ].filter((c): c is string => c !== null);
  if (casti.length === 0) return null;
  return (
    <tr className="radek-hry" data-testid="radek-hry">
      <td colSpan={4}>{casti.join(" · ")}</td>
    </tr>
  );
}
