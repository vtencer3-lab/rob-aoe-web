import { useState } from "react";

/**
 * Název akce. Večer se často jmenuje podle toho, co se zrovna hraje, a přepsat
 * ho jde bez zakládání nové akce: adminovi je celý nadpis tlačítko. Tužka vedle
 * něj byla drobný terč vedle velkého nápisu, na který se stejně chtělo klikat.
 *
 * Uloží se odchodem z pole nebo Enterem, Escape změnu zahodí. Prázdný název
 * se neuloží — server by ho stejně odmítl a Rob by koukal na chybu místo na
 * to, že se prostě nic nestalo.
 */
export function NazevAkce({ nazev, onPrejmenovat }: { nazev: string; onPrejmenovat?: (nazev: string) => void }) {
  const [upravuje, setUpravuje] = useState(false);
  const [text, setText] = useState(nazev);

  // Bez obsluhy (hráč) je to obyčejný nadpis — přejmenovat smí jen admin.
  if (!upravuje || !onPrejmenovat) {
    return (
      <h2 className="nadpis-akce" data-testid="nazev-akce">
        {onPrejmenovat ? (
          <button
            type="button"
            className="nazev-akce-tlacitko"
            title="Upravit název akce"
            onClick={() => {
              setText(nazev);
              setUpravuje(true);
            }}
          >
            {nazev}
          </button>
        ) : (
          nazev
        )}
      </h2>
    );
  }

  const uloz = () => {
    setUpravuje(false);
    const cisty = text.trim();
    if (cisty !== "" && cisty !== nazev) onPrejmenovat(cisty);
  };

  return (
    <h2 className="nadpis-akce" data-testid="nazev-akce">
      <input
        className="nazev-akce-pole"
        aria-label="Název akce"
        value={text}
        autoFocus
        maxLength={120}
        onChange={(e) => setText(e.target.value)}
        onBlur={uloz}
        onKeyDown={(e) => {
          if (e.key === "Enter") uloz();
          if (e.key === "Escape") setUpravuje(false);
        }}
      />
    </h2>
  );
}
