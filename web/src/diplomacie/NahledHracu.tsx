import { useState } from "react";
import { redigujDiplo } from "../../../src/shared/diplomacie/viditelnost.js";
import type { DiploData } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";
import { Rozbalovaci } from "../views/Rozbalovaci.js";
import { diploZapasu, KartaRole } from "./KartaRole.js";
import { PultGm } from "./PultGm.js";

/** Náhled je jen ke čtení: akce z karty ani z pultu nikam nejdou. */
const bezAkci = async () => {};

/**
 * Náhled do cizího zápasu (uživatel 4. 10. 2026): kdo má právo
 * `DIPLO_NAHLED` a v zápase nehraje, dostane od serveru zápas celý
 * (`nahled`) a tady si vybere, čí pohled vidět — kartu hráče přesně tak,
 * jak ji vidí on (táž redakce, jen spuštěná u nás), nebo pult GM.
 */
export function NahledHracu({ zapas, data }: { zapas: ZapasView; data: DiploData }) {
  const [kdo, setKdo] = useState<string | null>(null);
  const d = diploZapasu(data, zapas.id);
  if (!d?.nahled) return null;
  return (
    <section className="nahled-hracu" data-testid="nahled-hracu">
      <h3 className="nadpis-seznamu">Náhled zápasu #{zapas.poradi}</h3>
      <p className="ceka">Jen ke čtení — vidíš přesně to, co vybraný hráč. Nic se tu neodklikne.</p>
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
              {h === d.gmHracId ? " (GM)" : ""}
            </span>
          )
        }
      />
      {kdo === null ? null : kdo === d.gmHracId ? (
        <PultGm key={kdo} zapas={zapas} data={data} hlidej={bezAkci} />
      ) : (
        <KartaRole key={kdo} zapas={zapas} data={redigujDiplo(data, kdo)} ja={kdo} hlidej={bezAkci} />
      )}
    </section>
  );
}
