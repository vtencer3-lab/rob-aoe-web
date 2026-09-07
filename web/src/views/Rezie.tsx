import { useState } from "react";
import {
  BARVA_NAZEV,
  type AkceStavPayload,
  type Format,
  type Tym,
  type ZapasView,
} from "../../../src/shared/types.js";
import { jmenoHrace, popisViteze, vitezVeVete } from "../zapas.js";

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

      {stav.zapasy.map((zapas) => (
        <ZapasVRezii
          key={zapas.id}
          zapas={zapas}
          onStav={onStav}
          onVysledek={onVysledek}
          onHost={onHost}
        />
      ))}
    </section>
  );
}

function popisStavu(zapas: ZapasView): string {
  if (zapas.stav === "zruseny") return " · zrušeno";
  if (zapas.stav !== "dohrano") return "";
  return zapas.viteznyTym ? ` · dohráno — ${vitezVeVete(zapas, zapas.viteznyTym)}` : " · dohráno";
}

/**
 * Host na odkaz do lobby neklikne — on ji zakládá a odkaz z ní vkládá. Ptát se
 * u něj na kliknutí byla otázka, která nemohla nikdy dopadnout. Jeho stav je
 * to, na co Rob čeká: jestli už odkaz existuje.
 */
function popisUcastnika(zapas: ZapasView, u: ZapasView["ucastnici"][number]): string {
  if (u.jeHost) return zapas.lobbyId === null ? "zakládá lobby" : "vložil odkaz do lobby";
  // Web ví jen to, že člověk klikl. Že opravdu dorazil, nevidí.
  return u.kliknulPripojit ? "klikl na připojení" : "zatím neklikl";
}

type ZapasProps = Pick<Props, "onStav" | "onVysledek" | "onHost"> & { zapas: ZapasView };

function ZapasVRezii({ zapas, onStav, onVysledek, onHost }: ZapasProps) {
  // Přepsat zapsaný výsledek jde, ale ne jedním kliknutím do prázdna: tlačítka
  // týmů se odemknou až po „Změnit výsledek“ a to druhé kliknutí je samo o sobě
  // to potvrzení. Potvrzovací okno navíc by se muselo odškrtávat v přenosu.
  const [meniVysledek, setMeniVysledek] = useState(false);

  const dohrano = zapas.stav === "dohrano";
  const zruseno = zapas.stav === "zruseny";
  const bezi = !dohrano && !zruseno;

  // Odkaz aoe2de://1/<id> funguje jako divácký, jakmile host vloží odkaz z lobby —
  // funguje v otevřené, ještě neobsazené lobby i za běhu zápasu. Ověřeno na živé hře.
  // Rob se tak dostane dovnitř hned, jak odkaz existuje, a stihne upozornit na
  // špatně nastavenou lobby. Spectate se proto odemyká výhradně podle spectatorUri.
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
    <article className={bezi ? "zapas" : "zapas odepsany"}>
      <header data-testid="zapas-hlavicka">
        Zápas #{zapas.poradi}
        {popisStavu(zapas)}
      </header>

      <ul>
        {zapas.ucastnici.map((u) => (
          <li key={u.steamId} className={`barva-${u.barva}`}>
            {/* Text ve vlastním spanu, aby ho flex bral jako jednu položku
                a tlačítko se mu nelepilo na poslední písmeno. */}
            <span>
              {jmenoHrace(u)} — {BARVA_NAZEV[u.barva]}, tým {u.tym}
              {" · "}
              {popisUcastnika(zapas, u)}
            </span>
            {/* Kdo hostuje, má odznak; kdo ne, má tlačítko. Nikdy obojí a
                nikdy ani jedno — tlačítko u stávajícího hosta nabízelo akci,
                která by nic nezměnila, a vedle textového „(host)“ uprostřed
                věty se dvě stejná tlačítka pletla. U odepsaného zápasu odznak
                zůstává, protože je to záznam; tlačítko mizí, není co přehazovat. */}
            {u.jeHost ? (
              <strong className="odznak-host" data-testid="odznak-host">
                HOST
              </strong>
            ) : bezi ? (
              <button
                onClick={() => {
                  if (potvrdZmenuHosta(jmenoHrace(u))) onHost(zapas.id, u.steamId);
                }}
              >
                Udělat hostem
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {/* Spectate, nápověda pro zamrzlou lobby i tlačítka výsledku patří
          běžícímu zápasu. Po dohrání nebo zrušení jen zabíraly místo a
          nabízely akce, které už nedávají smysl — a za večer se takhle pod
          sebou vršil jeden odepsaný zápas za druhým s plnou výbavou. */}
      {bezi ? (
        <>
          <a
            data-testid="spectate"
            className="cta"
            aria-disabled={muzeSpectate ? "false" : "true"}
            href={zapas.spectatorUri !== null ? zapas.spectatorUri : undefined}
          >
            {muzeSpectate ? "Spectate" : "Spectate — čeká se na odkaz od hosta"}
          </a>

          {/* Jen informační stavový řádek, ne zámek. */}
          <div className="zaloha">
            Kdyby to zamrzlo: lobby <strong>{zapas.nazevLobby}</strong>, heslo{" "}
            <strong>{zapas.heslo}</strong>, číslo <strong>{zapas.lobbyId ?? "—"}</strong>
          </div>

          <div className="ovladani">
            <TlacitkoViteze zapas={zapas} tym={1} onVysledek={onVysledek} />
            <TlacitkoViteze zapas={zapas} tym={2} onVysledek={onVysledek} />
            <button onClick={() => onStav(zapas.id, "zruseny")}>Zrušit</button>
          </div>
        </>
      ) : null}

      {dohrano ? (
        <div className="ovladani">
          {meniVysledek ? (
            <>
              <span className="zaloha">Kdo doopravdy vyhrál?</span>
              <TlacitkoViteze
                zapas={zapas}
                tym={1}
                onVysledek={(id, tym) => {
                  onVysledek(id, tym);
                  setMeniVysledek(false);
                }}
              />
              <TlacitkoViteze
                zapas={zapas}
                tym={2}
                onVysledek={(id, tym) => {
                  onVysledek(id, tym);
                  setMeniVysledek(false);
                }}
              />
              <button onClick={() => setMeniVysledek(false)}>Nechat být</button>
            </>
          ) : (
            <button onClick={() => setMeniVysledek(true)}>Změnit výsledek</button>
          )}
        </div>
      ) : null}

      {/* Zrušený zápas byl slepá ulička — pořád nabízel Spectate i výsledek,
          ale žádnou cestu zpátky. Stavový automat návrat dovoluje schválně. */}
      {zruseno ? (
        <div className="ovladani">
          <button onClick={() => onStav(zapas.id, "bezi")}>Vrátit do hry</button>
        </div>
      ) : null}
    </article>
  );
}

/**
 * Tlačítko výsledku nese barvu týmu a jeho jméno: v 1v1 hráče, jinak
 * „modrý tým“ s hráči drobně pod tím. Rob tak v přenosu nepřepočítává, kdo
 * je „tým 1“.
 */
function TlacitkoViteze({
  zapas,
  tym,
  onVysledek,
}: {
  zapas: ZapasView;
  tym: Tym;
  onVysledek: (zapasId: number, tym: Tym) => void;
}) {
  const { titulek, hraci, barva } = popisViteze(zapas, tym);
  return (
    <button className={`vysledek barva-${barva}`} onClick={() => onVysledek(zapas.id, tym)}>
      <span>{titulek}</span>
      {hraci.length > 0 ? <small>{hraci.join(", ")}</small> : null}
    </button>
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

      {/* Hlavní akce celého panelu: zlatá a větší, ať nesplývá s výběrem
          hráčů nad ní. */}
      <button
        className="vytvorit"
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
