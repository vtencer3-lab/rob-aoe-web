import { useState } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { Role, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { Skladaci } from "../views/Skladaci.js";
import { ZNAK_ROLE } from "./znaky.js";

const PORADI: Role[] = ["nastupce", "garda", "najezdnik", "sasek", "zoldak", "kat"];

/**
 * Pravidla jako rozbalovací tahák; čísla z rozboru verze, kterou zápas hraje
 * (spec §8.2). Sbaluje se stejně jako sekce kontroly lobby (Skladaci) a tělo
 * se vykreslí až po rozbalení: sbalený tahák tak v DOM nenese názvy rolí
 * a karta role vedle něj zůstává jediným místem, kde role hráče je.
 * Věty pravidel drží sloh textů rolí (`POPIS_ROLE`): „vyhrává, když …“,
 * krátce a věcně.
 */
export function PravidlaHry({ verze }: { verze: ScenarVerze | null }) {
  const [otevreno, setOtevreno] = useState(false);
  const r = verze?.rozbor ?? null;
  return (
    <Skladaci className="pravidla-hry" testId="pravidla-hry" hlava="Pravidla hry" otevreno={otevreno} onPrepnout={setOtevreno}>
      {otevreno ? (
        <>
          {/* Kartičky jako cíle u mapy (uživatel 4. 10. 2026). Jen obecná
              pravidla — žádný postup ani role konkrétních hráčů. */}
          <div className="pravidla-mrizka">
            {r ? (
              <section className="pravidla-karta">
                <h4>Start</h4>
                <p>
                  {r.suroviny.jidlo} jídla, {r.suroviny.drevo} dřeva, {r.suroviny.zlato} zlata, {r.suroviny.kamen} kamene; populace {r.suroviny.populace}.
                </p>
                <ul>
                  {r.limity.vesnicane !== null ? <li>Nejvýš {r.limity.vesnicane} vesničanů</li> : null}
                  {r.limity.rybarskeLode !== null ? <li>Nejvýš {r.limity.rybarskeLode} rybářských lodí</li> : null}
                  {r.limity.obchodniVozy !== null ? <li>Nejvýš {r.limity.obchodniVozy} obchodních vozů</li> : null}
                </ul>
              </section>
            ) : null}
            <section className="pravidla-karta">
              <h4>Primární cíle</h4>
              <ul>
                <li>Hráč vyhrává, když drží 7 relikvií 15 herních minut.</li>
                <li>Hráč prohrává, když zemře jeho král.</li>
              </ul>
              {r?.vitezstvi ? <p className="ceka">Vítězství ve scénáři: {r.vitezstvi.popis}.</p> : null}
            </section>
            {r ? (
              <section className="pravidla-karta">
                <h4>Sekundární tajné cíle</h4>
                <p className="ceka">Každému hráči kromě Nástupce jeden losuje hra.</p>
                <ul>
                  {r.cile.map((c) => (
                    <li key={c.text}>{velkym(c.text)}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <h4 className="pravidla-nadpis">Role</h4>
          <div className="pravidla-mrizka role-mrizka">
            {PORADI.map((role) => (
              <section key={role} className="pravidla-karta pravidla-role">
                <img className="znak-role" src={ZNAK_ROLE[role]} alt="" width={56} height={56} />
                <div>
                  <h5>{NAZEV_ROLE[role]}</h5>
                  <p>{POPIS_ROLE[role].cil}</p>
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </Skladaci>
  );
}

/** Cíle ze scénáře jsou malými písmeny („zabij 650 …“); v kartičce s velkým počátečním. */
const velkym = (t: string) => t.charAt(0).toLocaleUpperCase("cs") + t.slice(1);
