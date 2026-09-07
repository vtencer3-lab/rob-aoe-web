interface Props {
  /** Popisek pro čtečky; vlevo a vpravo jsou viditelné texty u obou poloh. */
  popisek: string;
  vlevo: string;
  vpravo: string;
  zapnuto: boolean;
  onZmena: (zapnuto: boolean) => void;
  testId?: string;
}

/**
 * Přepínač s posuvným knoflíkem: vypnuto = knoflík vlevo, zapnuto = vpravo.
 * Pod kapotou je to checkbox s rolí switch, takže funguje klávesnicí i pro
 * čtečky; vzhled dělá CSS (.prepinac).
 */
export function Prepinac({ popisek, vlevo, vpravo, zapnuto, onZmena, testId }: Props) {
  return (
    <label className={zapnuto ? "prepinac zapnuto" : "prepinac"} data-testid={testId}>
      <span className={zapnuto ? "" : "aktivni"}>{vlevo}</span>
      <input type="checkbox" role="switch" aria-label={popisek} checked={zapnuto} onChange={(e) => onZmena(e.target.checked)} />
      <span className="drazka" aria-hidden="true">
        <span className="knoflik" />
      </span>
      <span className={zapnuto ? "aktivni" : ""}>{vpravo}</span>
    </label>
  );
}
