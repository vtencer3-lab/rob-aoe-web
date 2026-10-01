import { useState } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { Role, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { Skladaci } from "../views/Skladaci.js";

const PORADI: Role[] = ["nastupce", "garda", "najezdnik", "sasek", "zoldak", "kat"];

/**
 * Pravidla jako rozbalovací tahák; čísla z rozboru verze, kterou zápas hraje
 * (spec §8.2). Sbaluje se stejně jako sekce kontroly lobby (Skladaci) a tělo
 * se vykreslí až po rozbalení: sbalený tahák tak v DOM nenese názvy rolí
 * a karta role vedle něj zůstává jediným místem, kde role hráče je.
 */
export function PravidlaHry({ verze }: { verze: ScenarVerze | null }) {
  const [otevreno, setOtevreno] = useState(false);
  const r = verze?.rozbor ?? null;
  return (
    <Skladaci className="pravidla-hry" testId="pravidla-hry" hlava="Pravidla hry" otevreno={otevreno} onPrepnout={setOtevreno}>
      {otevreno ? (
        <>
          {r ? (
            <>
              <h4>Start</h4>
              <p>
                {r.suroviny.jidlo} jídla, {r.suroviny.drevo} dřeva, {r.suroviny.zlato} zlata, {r.suroviny.kamen} kamene; populace {r.suroviny.populace}.
              </p>
              <ul>
                {r.limity.vesnicane !== null ? <li>Nejvýš {r.limity.vesnicane} vesničanů</li> : null}
                {r.limity.rybarskeLode !== null ? <li>Nejvýš {r.limity.rybarskeLode} rybářských lodí</li> : null}
                {r.limity.obchodniVozy !== null ? <li>Nejvýš {r.limity.obchodniVozy} obchodních vozů</li> : null}
              </ul>
              <h4>Sekundární tajné cíle (losuje hra)</h4>
              <ul>
                {r.cile.map((c) => (
                  <li key={c.text}>{c.text}</li>
                ))}
              </ul>
            </>
          ) : null}
          <h4>Primární cíle</h4>
          <ul>
            <li>Držet 7 relikvií po dobu 15 herních minut.</li>
            <li>Smrt vlastního krále znamená okamžitou prohru.</li>
          </ul>
          {r?.vitezstvi ? <p>Vítězství ve scénáři: {r.vitezstvi.popis}.</p> : null}
          <h4>Role</h4>
          {PORADI.map((role) => (
            <section key={role}>
              <h5>{NAZEV_ROLE[role]}</h5>
              <p>{POPIS_ROLE[role].cil}</p>
            </section>
          ))}
        </>
      ) : null}
    </Skladaci>
  );
}
