import { stejnyVitez, stranaHrace } from "../../../src/shared/strany.js";
import type { ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace, popisFormatu, strany, vitezVeVete } from "../zapas.js";

function popisStavu(zapas: ZapasView): string {
  if (zapas.stav !== "dohrano") return "běží";
  return zapas.vitez ? `dohráno — ${vitezVeVete(zapas.ucastnici, zapas.vitez)}` : "dohráno";
}

interface Props {
  zapas: ZapasView;
  /** Steam ID diváka, když je přihlášený. Slouží jen k větě „Vyhrál jsi“. */
  ja?: string | null;
}

/**
 * Zápas očima člověka, který se na něj jen dívá — a to je na streamu většina
 * lidí. Schválně jen kdo proti komu: barvy a týmy jsou pokyny pro hráče,
 * divákovi nic neříkají.
 *
 * Sahá vědomě jen na jména, pořadí, formát a výsledek. Heslo ani číslo lobby
 * se sem nedostanou ani omylem, i kdyby je server jednou poslal nezaslepené.
 */
export function VerejnyZapas({ zapas, ja = null }: Props) {
  const stranyText = strany(zapas.ucastnici)
    .map((s) => s.clenove.map(jmenoHrace).join(" + "))
    .join(" vs ");
  // Hráč se svůj vlastní dohraný zápas dozvídá právě tímhle řádkem — karta pro
  // něj po dohrání zaniká. Ať se aspoň nemusí domýšlet, která strana byla jeho.
  const moje = ja === null ? null : stranaHrace(zapas.ucastnici, ja);
  const verdikt =
    zapas.stav === "dohrano" && zapas.vitez !== null && moje !== null
      ? stejnyVitez(moje, zapas.vitez)
        ? "Vyhrál jsi."
        : "Prohrál jsi."
      : null;

  return (
    <p className="verejny-zapas" data-testid="verejny-zapas">
      <strong>Zápas #{zapas.poradi}</strong> · {popisFormatu(zapas.ucastnici)} · {popisStavu(zapas)}
      <br />
      <span className="strany">{stranyText}</span>
      {verdikt !== null ? (
        <>
          <br />
          <span className="verdikt">→ {verdikt}</span>
        </>
      ) : null}
    </p>
  );
}
