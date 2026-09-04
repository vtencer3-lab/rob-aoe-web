import { useState } from "react";
import { BARVA_NAZEV, type AkceStavPayload, type Format, type Tym } from "../../../src/shared/types.js";
import { jmenoHrace } from "../zapas.js";

interface Props {
  stav: AkceStavPayload;
  onVytvoritZapas: (format: Format, steamIds: string[]) => void;
  onStav: (zapasId: number, stav: string) => void;
  onVysledek: (zapasId: number, tym: Tym) => void;
  onHost: (zapasId: number, steamId: string) => void;
}

export function Rezie({ stav, onVytvoritZapas, onStav, onVysledek, onHost }: Props) {
  return (
    <section className="rezie">
      <SkladaniZapasu stav={stav} onVytvoritZapas={onVytvoritZapas} />

      {stav.zapasy.map((zapas) => {
        // Odkaz aoe2de://1/<id> funguje jako divácký, jakmile host vloží odkaz z lobby —
        // funguje v otevřené, ještě neobsazené lobby i za běhu zápasu. Ověřeno na živé hře.
        // Rob se tak dostane dovnitř dřív, než host cokoliv potvrdí, a stihne upozornit na
        // špatně nastavenou lobby. Proto se spectate odemyká podle spectatorUri, nikdy podle
        // hostPotvrdil — a nemá žádné "odemknout i bez potvrzení" tlačítko, protože žádný
        // zámek na potvrzení není.
        const muzeSpectate = zapas.spectatorUri !== null;

        // Přehození hosta je správně destruktivní: setHost vynuluje lobby_id
        // i potvrzení, protože staré číslo patřilo předchozímu hostovi. Jenže
        // to tlačítko je na každém řádku a jedno chybné kliknutí u běžícího
        // zápasu zabije odkaz všem čtyřem hráčům i Robův Spectate uprostřed
        // hry. Zábradlí dává smysl jen tam, kde už je co ztratit — dokud
        // odkaz není, nic se neděje a Rob se nepotřebuje proklikávat.
        const potvrdZmenuHosta = (jmeno: string) =>
          zapas.lobbyId === null ||
          window.confirm(
            `Přehodit hostování na ${jmeno}? Zápas #${zapas.poradi} tím přijde ` +
              `o odkaz do lobby (${zapas.lobbyId}). Nový host ho bude muset vložit znovu ` +
              `a všichni včetně Spectate se budou muset připojit nanovo.`,
          );

        return (
          <article key={zapas.id} className="zapas">
            <header>
              Zápas #{zapas.poradi} · {zapas.stav}
            </header>

            <ul>
              {zapas.ucastnici.map((u) => (
                <li key={u.steamId} className={`barva-${u.barva}`}>
                  {/* Text ve vlastním spanu, aby ho flex bral jako jednu položku
                      a tlačítko se mu nelepilo na poslední písmeno. */}
                  <span>
                    {jmenoHrace(u)} — {BARVA_NAZEV[u.barva]}, tým {u.tym}
                    {u.jeHost ? " (host)" : ""}
                    {" · "}
                    {/* Web ví jen to, že člověk klikl. Že opravdu dorazil, nevidí. */}
                    {u.kliknulPripojit ? "klikl na připojení" : "zatím neklikl"}
                  </span>
                  <button
                    onClick={() => {
                      if (potvrdZmenuHosta(jmenoHrace(u))) onHost(zapas.id, u.steamId);
                    }}
                  >
                    Hostuje tenhle
                  </button>
                </li>
              ))}
            </ul>

            <a
              data-testid="spectate"
              className="cta"
              aria-disabled={muzeSpectate ? "false" : "true"}
              href={zapas.spectatorUri !== null ? zapas.spectatorUri : undefined}
            >
              {muzeSpectate ? "Spectate" : "Spectate — čeká se na odkaz od hosta"}
            </a>

            {/* Jen informační stavový řádek, ne zámek. */}
            <p className="stavovy-radek">
              {zapas.hostPotvrdil ? "Host potvrdil nastavení." : "Host zatím nepotvrdil nastavení."}
            </p>

            <div className="zaloha">
              Kdyby to zamrzlo: lobby <strong>{zapas.nazevLobby}</strong>, heslo{" "}
              <strong>{zapas.heslo}</strong>, číslo <strong>{zapas.lobbyId ?? "—"}</strong>
            </div>

            <div className="ovladani">
              <button onClick={() => onStav(zapas.id, "vyhlaseny")}>Vyhlásit</button>
              <button onClick={() => onStav(zapas.id, "hraje_se")}>Hraje se</button>
              <button onClick={() => onVysledek(zapas.id, 1)}>Vyhrál tým 1</button>
              <button onClick={() => onVysledek(zapas.id, 2)}>Vyhrál tým 2</button>
              <button onClick={() => onStav(zapas.id, "zruseny")}>Zrušit</button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function SkladaniZapasu({ stav, onVytvoritZapas }: Pick<Props, "stav" | "onVytvoritZapas">) {
  const [format, setFormat] = useState<Format>("coop_kings_2v2");
  const [vybrani, setVybrani] = useState<string[]>([]);
  const potreba = format === "1v1" ? 2 : 4;

  function prepni(steamId: string) {
    setVybrani((d) => (d.includes(steamId) ? d.filter((s) => s !== steamId) : [...d, steamId]));
  }

  return (
    <div className="skladani">
      <select value={format} onChange={(e) => setFormat(e.target.value as Format)}>
        <option value="1v1">1v1</option>
        <option value="coop_kings_2v2">Coop Kings 2v2</option>
      </select>

      <p className="zaloha">
        Klikej v pořadí.{" "}
        {format === "coop_kings_2v2"
          ? "První dva tvoří jeden tým a sdílí civilizaci, druzí dva ten druhý."
          : "První hráč dostane modrou, druhý červenou."}
      </p>

      <ul className="vyber">
        {stav.prihlaseni.map((hrac) => {
          const poradi = vybrani.indexOf(hrac.steamId);
          return (
            <li key={hrac.steamId}>
              <button onClick={() => prepni(hrac.steamId)}>
                {poradi >= 0 ? `${poradi + 1}. ` : ""}
                {hrac.alias ?? hrac.steamName ?? hrac.steamId}
                {hrac.elo1v1 !== null ? ` (${hrac.elo1v1})` : ""}
              </button>
            </li>
          );
        })}
      </ul>

      <button
        disabled={vybrani.length !== potreba}
        onClick={() => {
          onVytvoritZapas(format, vybrani);
          setVybrani([]);
        }}
      >
        Vytvořit zápas ({vybrani.length}/{potreba})
      </button>
    </div>
  );
}
