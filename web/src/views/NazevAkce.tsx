import { useState } from "react";

/**
 * Název akce s tužkou. Večer se často jmenuje podle toho, co se zrovna hraje,
 * a přepsat ho jde bez zakládání nové akce.
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
      <h2 data-testid="nazev-akce">
        {nazev}
        {onPrejmenovat ? (
        <button
          type="button"
          className="prejmenovat"
          aria-label="Přejmenovat akci"
          title="Přejmenovat akci"
          onClick={() => {
            setText(nazev);
            setUpravuje(true);
          }}
        >
          ✎
        </button>
        ) : null}
      </h2>
    );
  }

  const uloz = () => {
    setUpravuje(false);
    const cisty = text.trim();
    if (cisty !== "" && cisty !== nazev) onPrejmenovat(cisty);
  };

  return (
    <h2 data-testid="nazev-akce">
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
