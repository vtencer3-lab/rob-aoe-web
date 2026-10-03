import { DRZENI_K_VITEZSTVI_S, minutySekundy, popisCile, RELIKVII_K_VITEZSTVI } from "../../../src/shared/diplomacie/hra.js";
import type { MojeHra, Role } from "../../../src/shared/diplomacie/typy.js";
import type { UcastnikView } from "../../../src/shared/types.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";
import { TucneHodnoty } from "./HraZive.js";
import { ZNAK_RELIKVIE } from "./znaky.js";

/**
 * Cíle hráče vedle mapy na kartě role (uživatel 3. 10. 2026, „tak jak má GM
 * tabulku“): primární cíl — relikvie a 15minutové držení —, sekundární cíl
 * s postupem a stav hráčů, na kterých výhra role závisí. Data jsou jen
 * hráčova (`mojeHra`, redakce v viditelnost.ts).
 */
export function MojeCile({ hra, role, ucastnici }: { hra: MojeHra | undefined; role: Role; ucastnici: readonly UcastnikView[] }) {
  if (!hra) {
    return (
      <div className="moje-cile" data-testid="moje-cile">
        <p className="ceka">Postup cílů se ukáže, až poběží hra a web od ní dostane data.</p>
      </div>
    );
  }
  const relikvie = hra.relikvie ?? 0;
  // Odpočet běží, jen dokud má hráč 7 relikvií; při ztrátě se zastaví
  // (hra ho nuluje, sonda ne) — do té doby je řádek ztmavený.
  const bezi = relikvie >= RELIKVII_K_VITEZSTVI;
  return (
    <div className="moje-cile" data-testid="moje-cile">
      <h5>Primární cíl</h5>
      <p className="radek-cile">
        <strong>
          {relikvie}/{RELIKVII_K_VITEZSTVI}
        </strong>{" "}
        <img className="znak-relikvie" src={ZNAK_RELIKVIE} alt="" width={90} height={95} /> Relikvií
      </p>
      <p className={bezi ? "radek-cile" : "radek-cile ztlumeny"} data-testid="drzeni">
        <strong>{hra.drzeni === null ? "—" : minutySekundy(Math.min(hra.drzeni, DRZENI_K_VITEZSTVI_S))}</strong> / {minutySekundy(DRZENI_K_VITEZSTVI_S)}
        <span className="sr-only"> s 7 relikviemi</span>
      </p>
      {/* Nástupce může vyhrát jen relikviemi — sekundární cíl nemá. */}
      {role === "nastupce" ? null : (
        <>
          <h5>Sekundární cíl</h5>
          <p className="radek-cile" data-testid="sekundarni-cil">
            {hra.cil ? <TucneHodnoty text={popisCile(hra.cil)} /> : <span className="ceka">{hra.rozdano ? "Hra ti cíl nedala." : "Hra cíle ještě nerozdala."}</span>}
          </p>
        </>
      )}
      {hra.sledovani.map((s) => (
        <p key={s.hracId} className="radek-cile" data-testid="sledovany">
          {POPIS_SLEDOVANEHO[role] ?? "Hráč"}{" "}
          <strong>
            <JmenoUcastnika ucastnici={ucastnici} hracId={s.hracId} />
          </strong>
          : {s.zije === null ? "?" : s.zije ? "žije" : <strong className="padl">padl</strong>}
        </p>
      ))}
    </div>
  );
}

/** Koho role sleduje (viditelnost.ts, `koho`): oběť Kata, pouto Žoldáka, Nástupce u Gardy a Nájezdníka. */
const POPIS_SLEDOVANEHO: Partial<Record<Role, string>> = {
  kat: "Oběť",
  zoldak: "Pokrevní pouto",
  garda: "Nástupce",
  najezdnik: "Nástupce",
};
