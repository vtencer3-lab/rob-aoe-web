import { useSyncExternalStore } from "react";
import type { Barva, ZapasView } from "../../../src/shared/types.js";
import { kdoMluvi, naZmenuMluvcich } from "../hlas.js";
import { JmenoSBarvou } from "./JmenoSBarvou.js";
import { IkonaReproduktor } from "./PushToTalk.js";

interface Props {
  /** Zápasy ze stavu: z nich se pozná, na jaké barvě mluvčí sedí. */
  zapasy: ZapasView[];
  /** Háček módu: titul slotu podle barvy (Diplomacie: šedá = „GM“). */
  popisSlotu?: (barva: Barva) => string | null;
}

/**
 * Štítek „kdo právě mluví“ (uživatel 2. 10. 2026): hlas se přehrává celé
 * stránce, ať je zrovna vidět kterákoli karta, a bez štítku nebylo poznat,
 * čí je. Mluvčí s titulem od módu ho má před jménem — „GM Pepa“ — a kdo
 * v zápase sedí, má u jména čtvereček své barvy jako všude jinde; admin
 * z režie, který v zápase není, jen jméno.
 */
export function MluviTed({ zapasy, popisSlotu }: Props) {
  const mluvici = useSyncExternalStore(naZmenuMluvcich, kdoMluvi);
  if (mluvici.length === 0) return null;
  return (
    <div className="mluvi-ted" role="status" data-testid="mluvi-ted">
      {mluvici.map((m) => {
        const barva = zapasy.find((z) => z.id === m.zapasId)?.ucastnici.find((u) => u.hracId === m.kdo)?.barva;
        const titul = barva === undefined ? null : (popisSlotu?.(barva) ?? null);
        return (
          <span key={m.klic} className="mluvci">
            <IkonaReproduktor ztlumeno={false} />
            <span>
              <strong>
                <JmenoSBarvou barva={barva}>{titul ? `${titul} ${m.jmeno}` : m.jmeno}</JmenoSBarvou>
              </strong>{" "}
              mluví
            </span>
          </span>
        );
      })}
    </div>
  );
}
