import { useState, type ReactNode } from "react";
import { doplnNastaveni, type NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import type { AkceView, RezimId } from "../../../src/shared/types.js";
import { NastaveniLobby } from "./NastaveniLobby.js";
import { PreLobby } from "./PreLobby.js";
import { Prepinac } from "./Prepinac.js";

interface Props {
  akce: AkceView | null;
  onZalozit: (nazev: string, rezim: RezimId) => void;
  /** Živá změna nastavení lobby (každé kliknutí). */
  onNastaveniLobby: (nastaveni: Nastaveni) => void;
  /** „Uložit preset lobby“: snímek na serveru. */
  onUlozitNastaveni: () => void;
  /** Levá půlka panelu: rozpracovaná sestava (Skladani), jako seznam hráčů v herní lobby. */
  children?: ReactNode;
  /** Klíč nastavení ke zvýraznění (historie kroků). */
  zvyraznitNastaveni?: { cil: string | null; cas: number } | null;
  /** Kostka u hesla v okně Pre-Lobby: server vygeneruje nové. */
  onNoveHeslo?: () => void;
  /** Custom Scenario: podmínky vítězství z rozboru scénáře (dodá mód). */
  scenar?: { vitezstvi: string | null };
}

/**
 * Panel akce rozložený jako herní lobby: název akce v záhlaví, vlevo
 * vybraní hráči (sestava), vpravo Game Settings. Tlačítka debug módu stojí
 * nahoře u tabulky přihlášených — týkají se toho, kdo je v seznamu.
 */
export function SpravaAkce({ akce, onZalozit, onNastaveniLobby, onUlozitNastaveni, children, zvyraznitNastaveni, onNoveHeslo, scenar }: Props) {
  const [preLobbyVidet, setPreLobbyVidet] = useState(false);
  if (!akce) return <ZalozeniAkce onZalozit={onZalozit} />;

  return (
    <section className="sprava-akce">
      {/* Panel se jmenuje po tom, co v něm je. Název akce odsud odešel nahoru
          nad tabulku přihlášených: patří k celému večeru, ne k nastavení hry.
          Vedle nadpisu stojí zakládání lobby — krok, který přijde před vším
          ostatním a odehraje se v samostatném okně jako ve hře. */}
      <header className="hlavicka-akce">
        <h2>Nastavení Lobby</h2>
        {akce.rezim === "diplomacie" ? <span className="stitek-rezimu">Diplomacie</span> : null}
        <button type="button" className="prelobby-tlacitko" onClick={() => setPreLobbyVidet(true)}>
          Pre-Lobby Nastavení
        </button>
      </header>
      {preLobbyVidet ? (
        <PreLobby
          nastaveni={doplnNastaveni(akce.nastaveniLobby as Partial<Nastaveni>)}
          nazevLobby={akce.pristiNazevLobby ?? ""}
          heslo={akce.pristiHeslo ?? ""}
          onZmena={onNastaveniLobby}
          onNoveHeslo={() => onNoveHeslo?.()}
          onZavrit={() => setPreLobbyVidet(false)}
        />
      ) : null}
      <div className="lobby-rozlozeni">
        <div className="leva">{children}</div>
        <NastaveniLobby zive={akce.nastaveniLobby} ulozene={akce.ulozeneNastaveniLobby} onZmena={onNastaveniLobby} onUlozit={onUlozitNastaveni} zvyraznit={zvyraznitNastaveni} scenar={scenar} />
      </div>
    </section>
  );
}

function ZalozeniAkce({ onZalozit }: Pick<Props, "onZalozit">) {
  const [nazev, setNazev] = useState("");
  // Mód se volí jen při založení: Diplomacie mění výchozí nastavení lobby
  // a pravidla sestavy, přepínat ji uprostřed večera nedává smysl.
  const [diplomacie, setDiplomacie] = useState(false);

  return (
    <form
      className="zalozeni-akce"
      onSubmit={(e) => {
        e.preventDefault();
        if (nazev.trim() === "") return;
        onZalozit(nazev.trim(), diplomacie ? "diplomacie" : "klasicky");
        setNazev("");
      }}
    >
      <Prepinac popisek="Diplomacie" vlevo="" vpravo="Diplomacie" zapnuto={diplomacie} onZmena={setDiplomacie} testId="prepinac-diplomacie" />
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
