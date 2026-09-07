import { useState } from "react";
import type { AkceView } from "../../../src/shared/types.js";

interface Props {
  akce: AkceView | null;
  onZalozit: (nazev: string) => void;
  onStav: (stav: string) => void;
  /** Jen na vývojové verzi: přidávání a odebírání zkušebních hráčů. */
  zkusebni?: { onPridat: () => void; onOdebrat: () => void };
}

export function SpravaAkce({ akce, onZalozit, onStav, zkusebni }: Props) {
  if (!akce) return <ZalozeniAkce onZalozit={onZalozit} />;

  return (
    <section className="sprava-akce">
      <div className="ovladani">
        <button
          onClick={() => {
            // Jediné tlačítko na úrovni akce, a nevratné: po „konec“ akce zmizí
            // všem naráz ze streamu, včetně rozehraných zápasů. Proto potvrzení.
            if (window.confirm(`Ukončit akci „${akce.nazev}“? Zpátky to nejde.`)) onStav("konec");
          }}
        >
          Ukončit akci
        </button>
        {/* Zkušební hráči: Rob si složí plnou sestavu bez čtyř lidí. Kreslí se
            jen tam, kde to server povolil (vývojová verze). */}
        {zkusebni ? (
          <>
            <button onClick={zkusebni.onPridat} title="Přihlásí do akce dalšího zkušebního hráče">
              + Zkušební hráč
            </button>
            <button onClick={zkusebni.onOdebrat} title="Odhlásí z akce všechny zkušební hráče">
              Odebrat zkušební
            </button>
          </>
        ) : null}
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
