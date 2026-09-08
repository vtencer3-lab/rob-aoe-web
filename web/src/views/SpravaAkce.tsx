import { useState, type ReactNode } from "react";
import type { NastaveniLobby as Nastaveni } from "../../../src/shared/lobbyKontrola.js";
import type { AkceView } from "../../../src/shared/types.js";
import { NastaveniLobby } from "./NastaveniLobby.js";

interface Props {
  akce: AkceView | null;
  onZalozit: (nazev: string) => void;
  /** Přejmenování běžící akce tužkou u nadpisu. */
  onPrejmenovat: (nazev: string) => void;
  /** Živá změna nastavení lobby (každé kliknutí). */
  onNastaveniLobby: (nastaveni: Nastaveni) => void;
  /** „Uložit preset lobby“: snímek na serveru. */
  onUlozitNastaveni: () => void;
  /** Jen na vývojové verzi: přidávání a odebírání zkušebních hráčů. */
  zkusebni?: { onPridat: () => void; onOdebrat: () => void };
  /** Debug mód (přepínač u verze): ukáže tlačítka zkušebních hráčů. */
  ladeni?: boolean;
  /** Levá půlka panelu: rozpracovaná sestava (Skladani), jako seznam hráčů v herní lobby. */
  children?: ReactNode;
  /** Klíč nastavení ke zvýraznění (historie kroků). */
  zvyraznitNastaveni?: { cil: string | null; cas: number } | null;
}

/**
 * Panel akce rozložený jako herní lobby: název akce v záhlaví, vlevo
 * vybraní hráči (sestava), vpravo Game Settings. Tlačítka zkušebních hráčů
 * jsou pod záhlavím a jen v debug módu.
 */
export function SpravaAkce({ akce, onZalozit, onPrejmenovat, onNastaveniLobby, onUlozitNastaveni, zkusebni, ladeni = false, children, zvyraznitNastaveni }: Props) {
  if (!akce) return <ZalozeniAkce onZalozit={onZalozit} />;

  return (
    <section className="sprava-akce">
      {/* „Ukončit akci“ bývalo tady vpravo; přestěhovalo se nahoru k tabulce
          přihlášených, kde jsou i ostatní tlačítka na úrovni akce. */}
      <header className="hlavicka-akce">
        <NazevAkce nazev={akce.nazev} onPrejmenovat={onPrejmenovat} />
      </header>
      {/* Zkušební hráči: Rob si složí plnou sestavu bez čtyř lidí. Kreslí se
          jen tam, kde to server povolil (vývojová verze), a jen v debug módu. */}
      {zkusebni && ladeni ? (
        <div className="ovladani ladeni" data-testid="ladeni-tlacitka">
          <button onClick={zkusebni.onPridat} title="Přihlásí do akce dalšího zkušebního hráče">
            + Zkušební hráč
          </button>
          <button onClick={zkusebni.onOdebrat} title="Odhlásí z akce všechny zkušební hráče">
            Odebrat zkušební
          </button>
        </div>
      ) : null}
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

/**
 * Název akce s tužkou. Večer se často jmenuje podle toho, co se zrovna hraje,
 * a přepsat ho jde bez zakládání nové akce.
 *
 * Uloží se odchodem z pole nebo Enterem, Escape změnu zahodí. Prázdný název
 * se neuloží — server by ho stejně odmítl a Rob by koukal na chybu místo na
 * to, že se prostě nic nestalo.
 */
function NazevAkce({ nazev, onPrejmenovat }: { nazev: string; onPrejmenovat: (nazev: string) => void }) {
  const [upravuje, setUpravuje] = useState(false);
  const [text, setText] = useState(nazev);

  if (!upravuje) {
    return (
      <h2 data-testid="nazev-akce">
        {nazev}
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
