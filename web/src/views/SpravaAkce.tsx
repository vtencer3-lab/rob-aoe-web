import { useState } from "react";
import type { AkceView } from "../../../src/shared/types.js";

/**
 * Postup večerem, v pořadí, v jakém ho Rob proklikává. `konec` tu schválně
 * není — ten má vlastní tlačítko s potvrzením, protože je nevratný: akce se
 * tím zavře všem a další už půjde jen založit novou.
 */
const KROKY: readonly { stav: string; popisek: string }[] = [
  { stav: "prihlasovani", popisek: "Otevřít přihlašování" },
  { stav: "zavreno", popisek: "Zavřít přihlašování" },
  { stav: "bezi", popisek: "Spustit hry" },
];

export const POPIS_STAVU: Readonly<Record<string, string>> = {
  priprava: "příprava — hráči se zatím nemůžou hlásit",
  prihlasovani: "přihlašování je otevřené",
  zavreno: "přihlašování zavřené",
  bezi: "hry běží",
  konec: "akce skončila",
};

interface Props {
  akce: AkceView | null;
  onZalozit: (nazev: string) => void;
  onStav: (stav: string) => void;
}

export function SpravaAkce({ akce, onZalozit, onStav }: Props) {
  if (!akce) return <ZalozeniAkce onZalozit={onZalozit} />;

  return (
    <section className="sprava-akce">
      <p className="stavovy-radek">Stav akce: {POPIS_STAVU[akce.stav] ?? akce.stav}</p>
      <div className="ovladani">
        {KROKY.map(({ stav, popisek }) => (
          <button key={stav} disabled={akce.stav === stav} onClick={() => onStav(stav)}>
            {popisek}
          </button>
        ))}
        <button
          onClick={() => {
            // Nevratné: po „konec“ zmizí akce ze streamu všem naráz, včetně
            // rozehraných zápasů, a zpátky se nedá. Jedno chybné kliknutí
            // vedle „Spustit hry“ by ukončilo večer.
            if (window.confirm(`Ukončit akci „${akce.nazev}“? Zpátky to nejde.`)) onStav("konec");
          }}
        >
          Ukončit akci
        </button>
      </div>
    </section>
  );
}

function ZalozeniAkce({ onZalozit }: Pick<Props, "onZalozit">) {
  const [nazev, setNazev] = useState("");

  return (
    <form
      className="zalozeni-akce"
      onSubmit={(e) => {
        e.preventDefault();
        if (nazev.trim() === "") return;
        onZalozit(nazev.trim());
        setNazev("");
      }}
    >
      <label>
        Název akce{" "}
        <input
          value={nazev}
          onChange={(e) => setNazev(e.target.value)}
          placeholder="Komunitní čtvrtek"
        />
      </label>
      <button type="submit" disabled={nazev.trim() === ""}>
        Založit akci
      </button>
    </form>
  );
}
