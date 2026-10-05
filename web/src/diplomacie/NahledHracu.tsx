import { useState } from "react";
import { redigujDiplo } from "../../../src/shared/diplomacie/viditelnost.js";
import type { DiploData } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";
import { Rozbalovaci } from "../views/Rozbalovaci.js";
import { Skladaci } from "../views/Skladaci.js";
import { diploZapasu, KartaRole } from "./KartaRole.js";
import { PultGm } from "./PultGm.js";

/** Náhled je jen ke čtení: akce z karty ani z pultu nikam nejdou. */
const bezAkci = async () => {};

/**
 * Náhled zápasu (uživatel 4. 10. 2026): kdo má právo `DIPLO_NAHLED`,
 * dostane od serveru celý zápas zvlášť (`nahled`) — i když v něm sám hraje,
 * aby mohl moderovat jako GM. Tady si vybere, čí pohled vidět: kartu hráče
 * přesně tak, jak ji vidí on (táž redakce, jen spuštěná u nás), nebo pult
 * GM. Panel je ve výchozím stavu sbalený a obsah se vykreslí až po
 * rozbalení — hrající si tak nic nevyzradí omylem.
 */
export function NahledHracu({ zapas, data }: { zapas: ZapasView; data: DiploData }) {
  const [otevreno, setOtevreno] = useState(false);
  const [kdo, setKdo] = useState<string | null>(null);
  const plny = diploZapasu(data, zapas.id)?.nahled;
  if (!plny) return null;
  // Data, jak je vidí GM: tenhle zápas celý, ostatní beze změny.
  const plnaData: DiploData = { ...data, zapasy: data.zapasy.map((z) => (z.zapasId === zapas.id ? plny : z)) };
  return (
    <section className="nahled-hracu" data-testid="nahled-hracu">
      <Skladaci className="nahled-skladaci" testId="nahled-skladaci" hlava={`Náhled zápasu #${zapas.poradi} (moderování)`} otevreno={otevreno} onPrepnout={setOtevreno}>
        {otevreno ? (
          <>
            <p className="ceka">Jen ke čtení — vidíš přesně to, co vybraný hráč, nebo pult GM. Nic se tu neodklikne.</p>
            <Rozbalovaci<string | null>
              trida="vyber-hrace"
              popisek="Čí pohled zobrazit"
              polozky={[null, ...zapas.ucastnici.map((u) => u.hracId)]}
              hodnota={kdo}
              onZmena={setKdo}
              klic={(h) => h ?? "nikdo"}
              obsah={(h) =>
                h === null ? (
                  <span>Vyber hráče</span>
                ) : (
                  <span>
                    <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={h} />
                    {h === plny.gmHracId ? " (GM)" : ""}
                  </span>
                )
              }
            />
            {kdo === null ? null : kdo === plny.gmHracId ? (
              <PultGm key={kdo} zapas={zapas} data={plnaData} hlidej={bezAkci} />
            ) : (
              <KartaRole key={kdo} zapas={zapas} data={redigujDiplo(plnaData, kdo)} ja={kdo} hlidej={bezAkci} />
            )}
          </>
        ) : null}
      </Skladaci>
    </section>
  );
}
