import { useState, type ReactNode } from "react";
import type { NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import type { AkceView } from "../../../src/shared/types.js";
import { NastaveniLobby } from "./NastaveniLobby.js";

interface Props {
  akce: AkceView | null;
  onZalozit: (nazev: string) => void;
  /** Živá změna nastavení lobby (každé kliknutí). */
  onNastaveniLobby: (nastaveni: Nastaveni) => void;
  /** „Uložit preset lobby“: snímek na serveru. */
  onUlozitNastaveni: () => void;
  /** Levá půlka panelu: rozpracovaná sestava (Skladani), jako seznam hráčů v herní lobby. */
  children?: ReactNode;
  /** Klíč nastavení ke zvýraznění (historie kroků). */
  zvyraznitNastaveni?: { cil: string | null; cas: number } | null;
}

/**
 * Panel akce rozložený jako herní lobby: název akce v záhlaví, vlevo
 * vybraní hráči (sestava), vpravo Game Settings. Tlačítka debug módu stojí
 * nahoře u tabulky přihlášených — týkají se toho, kdo je v seznamu.
 */
export function SpravaAkce({ akce, onZalozit, onNastaveniLobby, onUlozitNastaveni, children, zvyraznitNastaveni }: Props) {
  if (!akce) return <ZalozeniAkce onZalozit={onZalozit} />;

  return (
    <section className="sprava-akce">
      {/* Panel se jmenuje po tom, co v něm je. Název akce odsud odešel nahoru
          nad tabulku přihlášených: patří k celému večeru, ne k nastavení hry. */}
      <header className="hlavicka-akce">
        <h2>Nastavení Lobby</h2>
      </header>
      <div className="lobby-rozlozeni">
        <div className="leva">{children}</div>
        <NastaveniLobby zive={akce.nastaveniLobby} ulozene={akce.ulozeneNastaveniLobby} onZmena={onNastaveniLobby} onUlozit={onUlozitNastaveni} zvyraznit={zvyraznitNastaveni} />
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
