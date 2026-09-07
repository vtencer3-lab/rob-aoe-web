import { useState } from "react";
import type { HledaniLobbyVysledek } from "../../../src/shared/types.js";

interface Props {
  zapasId: number;
  onHledat: (zapasId: number) => Promise<HledaniLobbyVysledek>;
  /** Text tlačítka: host „Vyhledat moji lobby“, čekající hráč „Vyhledat hru“. */
  popisek?: string;
}

type Stav =
  | { druh: "klid" }
  | { druh: "hledam" }
  | { druh: "vysledek"; vysledek: HledaniLobbyVysledek }
  | { druh: "chyba"; text: string };

/**
 * Tlačítko, kterým si web sám najde lobby v seznamu otevřených her podle
 * Steam ID lidí ze zápasu. Host díky němu nemusí kopírovat odkaz; čekající
 * hráč si jím může pomoct, když host na kopírování zapomněl. Výsledek se
 * ukazuje tady u tlačítka, ne nahoře na stránce — člověk se dívá sem.
 */
export function HledaniLobby({ zapasId, onHledat, popisek = "Vyhledat hru" }: Props) {
  const [stav, setStav] = useState<Stav>({ druh: "klid" });

  async function hledej() {
    setStav({ druh: "hledam" });
    try {
      setStav({ druh: "vysledek", vysledek: await onHledat(zapasId) });
    } catch (err) {
      setStav({ druh: "chyba", text: err instanceof Error ? err.message : "Hledání se nepovedlo." });
    }
  }

  return (
    <div className="hledani-lobby" data-testid="hledani-lobby">
      <button type="button" onClick={() => void hledej()} disabled={stav.druh === "hledam"}>
        {stav.druh === "hledam" ? "Hledám…" : popisek}
      </button>
      <Hlaska stav={stav} />
    </div>
  );
}

function Hlaska({ stav }: { stav: Stav }) {
  if (stav.druh === "klid" || stav.druh === "hledam") return null;
  if (stav.druh === "chyba") {
    return (
      <p className="chyba chyba-pole" role="alert">
        {stav.text}
      </p>
    );
  }
  const v = stav.vysledek;
  if (!v.nalezeno) {
    return (
      <p className="zaloha" role="status">
        Lobby zatím není vidět. Musí být založená a <strong>veřejná</strong> (Visibility: Public);
        pak to zkus znovu.
      </p>
    );
  }
  // Tvrdé varování jen u diváků: bez nich se Rob nedostane dovnitř. Heslo je
  // na hostovi, ale ať ví, že ho nemá.
  return (
    <p className="potvrzeno" role="status">
      Lobby nalezena{v.nazev ? ` („${v.nazev}“)` : ""}, odkazy naskočily všem.
      {v.povolujeDivaky === false ? (
        <>
          {" "}
          <span className="chyba">Nepovoluje diváky — zaškrtni Allow Spectators, jinak se Rob nedostane dovnitř.</span>
        </>
      ) : null}
      {v.maHeslo === false ? <> Lobby nemá heslo.</> : null}
    </p>
  );
}
