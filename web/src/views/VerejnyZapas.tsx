import type { Format, Tym, ZapasView } from "../../../src/shared/types.js";
import { jmenoHrace } from "../zapas.js";

const FORMAT_NAZEV: Record<Format, string> = {
  "1v1": "1v1",
  coop_kings_2v2: "Coop Kings",
};

function popisStavu(zapas: ZapasView): string {
  if (zapas.stav !== "dohrano") return "běží";
  return zapas.viteznyTym ? `dohráno — vyhrál tým ${zapas.viteznyTym}` : "dohráno";
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
  const strana = (tym: Tym) =>
    zapas.ucastnici
      .filter((u) => u.tym === tym)
      .map(jmenoHrace)
      .join(" + ");

  // Hráč se svůj vlastní dohraný zápas dozvídá právě tímhle řádkem — karta pro
  // něj po dohrání zaniká. Ať se aspoň nemusí domýšlet, který tým byl jeho.
  const muj = ja === null ? undefined : zapas.ucastnici.find((u) => u.steamId === ja);
  const verdikt =
    zapas.stav === "dohrano" && zapas.viteznyTym !== null && muj !== undefined
      ? muj.tym === zapas.viteznyTym
        ? "Vyhrál jsi."
        : "Prohrál jsi."
      : null;

  return (
    <p className="verejny-zapas" data-testid="verejny-zapas">
      <strong>Zápas #{zapas.poradi}</strong> · {FORMAT_NAZEV[zapas.format]} · {popisStavu(zapas)}
      <br />
      <span className="strany">
        {strana(1)} vs {strana(2)}
      </span>
      {verdikt !== null ? (
        <>
          <br />
          <span className="verdikt">→ {verdikt}</span>
        </>
      ) : null}
    </p>
  );
}
