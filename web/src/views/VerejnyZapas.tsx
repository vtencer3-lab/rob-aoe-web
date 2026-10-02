import { Fragment, type ReactNode } from "react";
import type { ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, popisFormatu, strany, vyhralHrac } from "../zapas.js";
import { JmenoSBarvou, VitezVeVete } from "./JmenoSBarvou.js";

function popisStavu(zapas: ZapasView): ReactNode {
  if (zapas.stav !== "dohrano") return "běží";
  if (!zapas.vitez) return "dohráno";
  return (
    <>
      dohráno — <VitezVeVete ucastnici={zapas.ucastnici} vitez={zapas.vitez} />
    </>
  );
}

interface Props {
  zapas: ZapasView;
  /** Steam ID diváka, když je přihlášený. Slouží jen k větě „Vyhrál jsi“. */
  ja?: string | null;
  /** Doplněk módu akce pod stranami (Diplomacie: veřejný stav zápasu). */
  doplnek?: ReactNode;
}

/**
 * Zápas očima člověka, který se na něj jen dívá — a to je na streamu většina
 * lidí. Schválně jen kdo proti komu; čísla týmů jsou pokyny pro hráče
 * a divákovi nic neříkají. Barvu u jména ale má (uživatel 2. 10. 2026):
 * ve vysílání se hráč pozná podle barvy dřív než podle jména.
 *
 * Sahá vědomě jen na jména, pořadí, formát a výsledek. Heslo ani číslo lobby
 * se sem nedostanou ani omylem, i kdyby je server jednou poslal nezaslepené.
 */
export function VerejnyZapas({ zapas, ja = null, doplnek }: Props) {
  const stranyZapasu = strany(zapas.ucastnici);
  // Hráč se svůj vlastní dohraný zápas dozvídá právě tímhle řádkem — karta pro
  // něj po dohrání zaniká. Ať se aspoň nemusí domýšlet, jak dopadl; divákovi
  // mimo zápas se nic osobního neříká.
  const hraju = ja !== null && zapas.ucastnici.some((u) => u.hracId === ja);
  const verdikt =
    zapas.stav === "dohrano" && zapas.vitez !== null && ja !== null && hraju
      ? vyhralHrac(zapas.ucastnici, zapas.vitez, ja)
        ? "Vyhrál jsi."
        : "Prohrál jsi."
      : null;

  return (
    <p className="verejny-zapas" data-testid="verejny-zapas">
      <strong>Zápas #{zapas.poradi}</strong> · {popisFormatu(zapas.ucastnici)} · {popisStavu(zapas)}
      <br />
      <span className="strany">
        {stranyZapasu.map((s, i) => (
          <Fragment key={i}>
            {i > 0 ? " vs " : null}
            {s.clenove.map((u, j) => (
              <Fragment key={u.hracId}>
                {j > 0 ? " + " : null}
                <JmenoSBarvou barva={u.barva}>{jmenoHrace(u)}</JmenoSBarvou>
              </Fragment>
            ))}
          </Fragment>
        ))}
      </span>
      {/* Bez doplňku ani zalomení — prázdný řádek by řádek zápasu zbytečně natáhl. */}
      {doplnek ? (
        <>
          <br />
          {doplnek}
        </>
      ) : null}
      {verdikt !== null ? (
        <>
          <br />
          <span className="verdikt">→ {verdikt}</span>
        </>
      ) : null}
    </p>
  );
}
