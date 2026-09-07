import { useEffect, useRef, useState } from "react";
import type { HledaniLobbyVysledek } from "../../../src/shared/types.js";

/** Jak často se web sám ptá, dokud lobby nenajde. Server má stejně dlouhou cache. */
export const INTERVAL_HLEDANI_MS = 5_000;

interface Props {
  zapasId: number;
  onHledat: (zapasId: number) => Promise<HledaniLobbyVysledek>;
  /** Text tlačítka: host „Vyhledat teď“, čekající hráč „Vyhledat hru“. */
  popisek?: string;
  /**
   * Dokud je zapnuté, hledá se samo každých pár vteřin. Vypíná se zvenčí ve
   * chvíli, kdy zápas číslo lobby má — dozví se to přes SSE, ne z odpovědi.
   */
  automaticky?: boolean;
  intervalMs?: number;
}

type Stav =
  | { druh: "klid" }
  | { druh: "hledam" }
  | { druh: "vysledek"; vysledek: HledaniLobbyVysledek }
  | { druh: "chyba"; text: string };

/**
 * Hledání lobby v seznamu otevřených her podle Steam ID lidí ze zápasu.
 * Host díky němu nemusí kopírovat odkaz; čekající hráč díky němu vidí odkaz
 * ve chvíli, kdy host lobby založí, aniž by kdokoliv cokoliv klikal. Tlačítko
 * zůstává pro netrpělivé. Výsledek se ukazuje tady, ne nahoře na stránce.
 */
export function HledaniLobby({
  zapasId,
  onHledat,
  popisek = "Vyhledat hru",
  automaticky = false,
  intervalMs = INTERVAL_HLEDANI_MS,
}: Props) {
  const [stav, setStav] = useState<Stav>({ druh: "klid" });
  // Souběh: automatický tik nesmí spustit druhé hledání, dokud první běží,
  // a odpověď, která dorazí po odpojení, nesmí sahat na stav.
  const probiha = useRef(false);
  const zivy = useRef(true);

  async function hledej(rucne: boolean) {
    if (probiha.current) return;
    probiha.current = true;
    if (rucne) setStav({ druh: "hledam" });
    try {
      const vysledek = await onHledat(zapasId);
      if (zivy.current) setStav({ druh: "vysledek", vysledek });
    } catch (err) {
      if (zivy.current) {
        setStav({ druh: "chyba", text: err instanceof Error ? err.message : "Hledání se nepovedlo." });
      }
    } finally {
      probiha.current = false;
    }
  }

  useEffect(() => {
    zivy.current = true;
    return () => {
      zivy.current = false;
    };
  }, []);

  useEffect(() => {
    if (!automaticky) return;
    void hledej(false);
    const casovac = setInterval(() => void hledej(false), intervalMs);
    return () => clearInterval(casovac);
    // hledej se mění s každým renderem; smyčku řídí jen automaticky/interval.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticky, intervalMs, zapasId]);

  return (
    <div className="hledani-lobby" data-testid="hledani-lobby">
      <button type="button" onClick={() => void hledej(true)} disabled={stav.druh === "hledam"}>
        {stav.druh === "hledam" ? "Hledám…" : popisek}
      </button>
      <Hlaska stav={stav} automaticky={automaticky} />
    </div>
  );
}

function Hlaska({ stav, automaticky }: { stav: Stav; automaticky: boolean }) {
  const dal = automaticky ? " Hledám dál, každých pár vteřin." : "";
  if (stav.druh === "klid" || stav.druh === "hledam") {
    return automaticky ? (
      <p className="zaloha" role="status">
        Hledám lobby automaticky…
      </p>
    ) : null;
  }
  if (stav.druh === "chyba") {
    return (
      <p className="chyba chyba-pole" role="alert">
        {stav.text}
        {dal}
      </p>
    );
  }
  const v = stav.vysledek;
  if (!v.nalezeno) {
    return (
      <p className="zaloha" role="status">
        Lobby zatím není vidět. Musí být založená a <strong>veřejná</strong> (Visibility: Public).
        {dal}
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
