import { useState } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { Role, ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { Skladaci } from "../views/Skladaci.js";
import { TextSIkonami } from "./TextSIkonami.js";
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
            {/* Shrnutí, o co ve hře jde (uživatel 4. 10. 2026). */}
            <section className="pravidla-karta">
              <h4>Cíl hry</h4>
              <ul>
                <li>Splnit primární cíl.</li>
                <li>
                  <TextSIkonami text="Splnit sekundární cíl (vyjma Nástupce císaře)." />
                </li>
              </ul>
            </section>
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
                <li>
                  <TextSIkonami text="Hráč vyhrává, když drží 7 relikvií 15 herních minut." />
                </li>
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
            {/* Celý popis role v bodech — cíl, výhody, nevýhody — ať každý ví,
                co mohou ostatní role (uživatel 4. 10. 2026). Obecná pravidla,
                nic o konkrétních hráčích. */}
            {PORADI.map((role) => {
              const popis = POPIS_ROLE[role];
              return (
                <section key={role} className="pravidla-karta pravidla-role">
                  <header>
                    <img className="znak-role" src={ZNAK_ROLE[role]} alt="" width={56} height={56} />
                    <h5>{NAZEV_ROLE[role]}</h5>
                  </header>
                  <ul>
                    <li className="cil">
                      <TextSIkonami text={popis.cil} />
                    </li>
                    {popis.informace?.map((v) => (
                      <li key={v} className="informace-role">
                        <TextSIkonami text={v} />
                      </li>
                    ))}
                  </ul>
                  {popis.vyhody.length > 0 ? (
                    <>
                      <h6>Výhody</h6>
                      <ul>
                        {popis.vyhody.map((v) => (
                          <li key={v}>
                            <TextSIkonami text={v} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                  {popis.nevyhody.length > 0 ? (
                    <>
                      <h6>Nevýhody</h6>
                      <ul>
                        {popis.nevyhody.map((v) => (
                          <li key={v}>
                            <TextSIkonami text={v} />
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </section>
              );
            })}
          </div>
        </>
      ) : null}
    </Skladaci>
  );
}

/** Cíle ze scénáře jsou malými písmeny („zabij 650 …“); v kartičce s velkým počátečním. */
const velkym = (t: string) => t.charAt(0).toLocaleUpperCase("cs") + t.slice(1);
