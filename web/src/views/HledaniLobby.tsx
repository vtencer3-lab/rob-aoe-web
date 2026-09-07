import { useEffect, useRef, useState } from "react";
import type { HledaniLobbyVysledek } from "../../../src/shared/types.js";
import { Kopirovatelne } from "./Kopirovatelne.js";

/** Jak často se web sám ptá, dokud lobby nenajde. Server má krátkou cache. */
export const INTERVAL_HLEDANI_MS = 4_000;

interface Props {
  zapasId: number;
  onHledat: (zapasId: number) => Promise<HledaniLobbyVysledek>;
  /**
   * Zápas už číslo lobby má a lobby stojí: tlačítko je zašedlé a vedle něj
   * svítí „Lobby nalezena“. Když lobby ze seznamu zmizí, rodič to přepne
   * zpátky a tlačítko zase ožije.
   */
  nalezena: boolean;
  /** Odkaz do lobby k ručnímu sdílení (ikona vedle stavu); null bez lobby. */
  odkaz?: string | null;
  /** Dokud je zapnuté a lobby není nalezená, hledá se samo každých pár vteřin. */
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
 * ve chvíli, kdy host lobby založí, aniž by kdokoliv cokoliv klikal. Stav se
 * ukazuje vedle tlačítka, ne nahoře na stránce.
 */
export function HledaniLobby({
  zapasId,
  onHledat,
  nalezena,
  odkaz = null,
  automaticky = false,
  intervalMs = INTERVAL_HLEDANI_MS,
}: Props) {
  const [stav, setStav] = useState<Stav>({ druh: "klid" });
  // Název lobby zná jen odpověď hledání; drží se, aby po nálezu nezmizel.
  const [nazev, setNazev] = useState<string | null>(null);
  const probiha = useRef(false);
  const zivy = useRef(true);

  async function hledej(rucne: boolean) {
    if (probiha.current) return;
    probiha.current = true;
    if (rucne) setStav({ druh: "hledam" });
    try {
      const vysledek = await onHledat(zapasId);
      if (zivy.current) {
        setStav({ druh: "vysledek", vysledek });
        if (vysledek.nalezeno) setNazev(vysledek.nazev);
      }
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
    if (!automaticky || nalezena) return;
    void hledej(false);
    const casovac = setInterval(() => void hledej(false), intervalMs);
    return () => clearInterval(casovac);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automaticky, nalezena, intervalMs, zapasId]);

  return (
    <div className="hledani-lobby" data-testid="hledani-lobby">
      <div className="ovladani">
        <button type="button" onClick={() => void hledej(true)} disabled={nalezena || stav.druh === "hledam"}>
          {stav.druh === "hledam" ? "Hledám…" : "Vyhledat lobby"}
        </button>
        {nalezena ? (
          <span className="potvrzeno stav-lobby" role="status" data-testid="lobby-nalezena">
            Lobby nalezena{nazev ? ` („${nazev}“)` : ""}
            {odkaz ? <Kopirovatelne hodnota={odkaz} popis="odkaz do lobby" jenIkona /> : null}
          </span>
        ) : (
          <Hlaska stav={stav} automaticky={automaticky} />
        )}
      </div>
    </div>
  );
}

function Hlaska({ stav, automaticky }: { stav: Stav; automaticky: boolean }) {
  if (stav.druh === "chyba") {
    return (
      <span className="chyba" role="alert">
        {stav.text}
      </span>
    );
  }
  if (stav.druh === "vysledek" && !stav.vysledek.nalezeno) {
    return (
      <span className="zaloha" role="status">
        Lobby zatím není vidět, musí být <strong>veřejná</strong>.{automaticky ? " Hledám dál." : ""}
      </span>
    );
  }
  if (stav.druh === "vysledek" && stav.vysledek.nalezeno) {
    // Nalezeno, rodič ještě nepřepnul (stav ze serveru dorazí přes SSE).
    return (
      <span className="potvrzeno" role="status">
        Lobby nalezena
      </span>
    );
  }
  return automaticky ? (
    <span className="zaloha" role="status">
      Hledám lobby…
    </span>
  ) : null;
}
