import { DRZENI_K_VITEZSTVI_S, minutySekundy, popisCile, popisStari, type HraZapasu } from "../../../src/shared/diplomacie/hra.js";
import type { ReactNode } from "react";
import type { UcastnikView } from "../../../src/shared/types.js";
import { useTed } from "../useTed.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";
import { ZNAK_RELIKVIE } from "./znaky.js";

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

/** Jak čerstvá data ze hry jsou a odkud: „ze hry (GM) před 4 s“, „ze hry (divák) před 4 s“, po delším tichu „hra mlčí 2 min“. */
export function StariHry({ hra }: { hra: HraZapasu | undefined }) {
  // Stáří roste samo — bez tikání by „před 4 s“ viselo do příští zprávy.
  const ted = useTed(1000);
  if (!hra) return null;
  return (
    <>
      <p className="stari-hry" data-testid="stari-hry">
        {popisStari((ted - Date.parse(hra.prijato)) / 1000, hra.zdroj)} · herní čas {herniCas(hra.cas)}
      </p>
      {/* Data nesedí k zápasu (jiný scénář, verze bez výpisu cílů): GM má vědět, proč se podle nich nic nenastavilo. */}
      {hra.varovani ? (
        <p className="varovani" data-testid="varovani-hry">
          {hra.varovani}
        </p>
      ) : null}
    </>
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
 * Drobný řádek pod hráčem v tabulce GM: sekundární cíl s postupem a relikvie.
 * Vyřazení ukazuje tabulka přeškrtnutým jménem (`TabulkaRoli`). Vlastní řádek tabulky přes celou šířku, ne text v buňce: na
 * telefonu má poslední sloupec 88 px a věta by se v něm lámala do pěti řádků.
 */
export function RadekHry({ hra, hracId }: { hra: HraZapasu | undefined; hracId: string }) {
  const h = hra?.hraci.find((x) => x.hracId === hracId);
  if (!hra || !h) return null;
  // Dokud hra cíle nerozdává, „bez cíle“ by platilo o všech a nic neříkalo.
  const cil: ReactNode = h.cil ? <TucneHodnoty text={popisCile(h.cil)} /> : hra.rozdano ? "bez cíle" : null;
  if (cil === null && h.relikvie === null) return null;
  // Dva pevné sloupce — cíl a relikvie —, ať jsou relikvie všech hráčů pod
  // sebou (uživatel 3. 10. 2026); obrázek relikvie místo slova, slovo čtečkám.
  return (
    <tr className="radek-hry" data-testid="radek-hry">
      <td colSpan={4}>
        <div className="radek-hry-obsah">
          <span className="cil-hry">{cil}</span>
          {h.relikvie === null ? null : (
            <span className="relikvie">
              <img src={ZNAK_RELIKVIE} alt="" width={90} height={95} />
              <span className="sr-only"> · relikvie </span>
              <strong>{h.relikvie}</strong>
              {/* Držení 7 relikvií (odpočet k vítězství), jakmile kdy začalo. */}
              {h.drzeni ? (
                <span className="drzeni-gm">
                  {" "}
                  · <strong>{minutySekundy(Math.min(h.drzeni, DRZENI_K_VITEZSTVI_S))}</strong>/{minutySekundy(DRZENI_K_VITEZSTVI_S)}
                </span>
              ) : null}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

/** Text cíle s čísly tučně („zabito: **3/650** jednotek“), ať postup jde přečíst na první pohled. */
export function TucneHodnoty({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\d+(?:\/\d+)?)/).map((kus, i) => (i % 2 === 1 ? <strong key={i}>{kus}</strong> : kus))}
    </>
  );
}
