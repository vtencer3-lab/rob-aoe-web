import { useState } from "react";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import type { Strana } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, type AkceStavPayload, type Vitez, type ZapasView } from "../../../src/shared/types.js";
import { nazevCivilizace } from "../../../src/shared/civilizace.js";
import { jmenoHrace, popisFormatu, popisTymu, strany, titulekViteze, vitezVeVete } from "../zapas.js";
import { KontrolaLobby } from "./KontrolaLobby.js";

interface Props {
  stav: AkceStavPayload;
  onStav: (zapasId: number, stav: string) => void;
  /** Zrušený zápas úplně odebrat, ať v režii nestraší celý večer. */
  onSmazat: (zapasId: number) => void;
  onVysledek: (zapasId: number, vitez: Vitez) => void;
  onHost: (zapasId: number, steamId: string) => void;
  onKontrolaLobby: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
  /** Dohraný zápas zavřít křížkem (true), nebo z debug módu znovu otevřít (false). */
  onZavrit: (zapasId: number, zavreny: boolean) => void;
  /** Debug mód: ukázat i zavřené zápasy, zašedlé, s tlačítkem na otevření. */
  ladeni?: boolean;
}

/** Zápasy v režii. Skládání sestavy je v panelu akce (SpravaAkce), vedle nastavení lobby. */
export function Rezie({ stav, onStav, onSmazat, onVysledek, onHost, onKontrolaLobby, onZavrit, ladeni = false }: Props) {
  return (
    <section className="rezie">
      {stav.zapasy.filter((z) => !z.zavreny || ladeni).map((zapas) => (
        <ZapasVRezii
          key={zapas.id}
          zapas={zapas}
          onStav={onStav}
          onSmazat={onSmazat}
          onZavrit={onZavrit}
          onVysledek={onVysledek}
          onHost={onHost}
          onKontrolaLobby={onKontrolaLobby}
        />
      ))}
    </section>
  );
}

function popisStavu(zapas: ZapasView): string {
  if (zapas.stav === "zruseny") return " · zrušeno";
  if (zapas.stav !== "dohrano") return "";
  return zapas.vitez ? ` · dohráno — ${vitezVeVete(zapas.ucastnici, zapas.vitez)}` : " · dohráno";
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

type ZapasProps = Pick<Props, "onStav" | "onSmazat" | "onVysledek" | "onHost" | "onKontrolaLobby" | "onZavrit"> & { zapas: ZapasView };

function ZapasVRezii({ zapas, onStav, onSmazat, onVysledek, onHost, onKontrolaLobby, onZavrit }: ZapasProps) {
  // Přepsat zapsaný výsledek jde, ale ne jedním kliknutím do prázdna: tlačítka
  // stran se odemknou až po „Změnit výsledek“ a to druhé kliknutí je samo o sobě
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
  const stranyZapasu = strany(zapas.ucastnici);

  return (
    <article className={[bezi ? "zapas" : "zapas odepsany", zapas.zavreny ? "zavreny" : ""].filter(Boolean).join(" ")}>
      <h2 className="titulek-zapasu" data-testid="zapas-hlavicka">
        Zápas #{zapas.poradi}
        <small>
          {" · "}
          {popisFormatu(zapas.ucastnici)}
          {popisStavu(zapas)}
          {zapas.zavreny ? " · zavřeno" : ""}
        </small>
      </h2>
      {/* Křížek zavře dohraný zápas: zmizí ze stránky, výsledek zůstává. */}
      {dohrano && !zapas.zavreny ? (
        <button type="button" className="zavrit-zapas" aria-label={`Zavřít zápas #${zapas.poradi}`} title="Zavřít — zmizí ze stránky, výsledek zůstane" onClick={() => onZavrit(zapas.id, true)}>
          ×
        </button>
      ) : null}
      {zapas.zavreny ? (
        <button type="button" className="zavrit-zapas otevrit" onClick={() => onZavrit(zapas.id, false)}>
          Znovu otevřít
        </button>
      ) : null}
      {/* Řádky jako ve skládání: čtvereček barvy a týmu, jméno, ELO, stav.
          Obal .skladani a seznam .sestava musí být dva prvky — mřížka je na
          seznamu, styly čtverečků na obalu. */}
      <div className="skladani jen-ke-cteni">
      <ul className="sestava sestava-zapasu">
        {zapas.ucastnici.map((u) => (
          <li key={u.steamId} className={`radek barva-${u.barva}`}>
            <span className={`volba volba-barva barva-${u.barva}`} aria-label={`Barva ${BARVA_NAZEV[u.barva]}`}>
              {u.barva}
            </span>
            <span className="volba volba-tym" aria-label={popisTymu(u)}>
              {u.tym === 0 ? "–" : u.tym}
            </span>
            <span className="jmeno">{jmenoHrace(u)}</span>
            <span className="elo">{u.elo1v1 !== null && u.elo1v1 !== undefined ? <small>({u.elo1v1})</small> : null}</span>
            <span className="stav-ucastnika">
              {u.civ !== null ? `${nazevCivilizace(u.civ)} · ` : ""}
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
      </div>
      {/* Spectate, nápověda pro zamrzlou lobby i tlačítka výsledku patří
          běžícímu zápasu. Po dohrání nebo zrušení jen zabíraly místo a
          nabízely akce, které už nedávají smysl — a za večer se takhle pod
          sebou vršil jeden odepsaný zápas za druhým s plnou výbavou. */}
      {bezi ? (
        <>
          {/* Druhý řádek říká, kam Rob vleze: do lobby, kde se ještě sedí,
              nebo do rozehrané hry. Odvozuje to server ze seznamu lobby. */}
          <a
            data-testid="spectate"
            className="cta spectate"
            aria-disabled={muzeSpectate ? "false" : "true"}
            href={zapas.spectatorUri !== null ? zapas.spectatorUri : undefined}
          >
            {muzeSpectate ? (
              <>
                <span>Spectate</span>
                <small data-testid="faze-lobby">
                  {zapas.fazeLobby === "lobby"
                    ? "(Lobby)"
                    : zapas.fazeLobby === "hraje_se"
                      ? "(Hraje se)"
                      : " "}
                </small>
              </>
            ) : (
              "Spectate — čeká se na založení lobby"
            )}
          </a>
          {/* Tatáž sekce kontroly, jakou vidí host — stejná komponenta,
              stejné chování (sama se opakuje, dokud se v lobby sedí). */}
          {zapas.lobbyId ? (
            <KontrolaLobby zapasId={zapas.id} onKontrola={onKontrolaLobby} automaticky={zapas.fazeLobby === "lobby"} />
          ) : null}
          <div className="ovladani">
            {stranyZapasu.map((strana) => (
              <TlacitkoViteze key={klicStrany(strana)} zapas={zapas} strana={strana} onVysledek={onVysledek} />
            ))}
            <button onClick={() => onStav(zapas.id, "zruseny")}>Zrušit</button>
          </div>
        </>
      ) : null}
      {dohrano ? (
        <div className="ovladani">
          {meniVysledek ? (
            <>
              <span className="zaloha">Kdo doopravdy vyhrál?</span>
              {stranyZapasu.map((strana) => (
                <TlacitkoViteze
                  key={klicStrany(strana)}
                  zapas={zapas}
                  strana={strana}
                  onVysledek={(id, vitez) => {
                    onVysledek(id, vitez);
                    setMeniVysledek(false);
                  }}
                />
              ))}
              <button onClick={() => setMeniVysledek(false)}>Nechat být</button>
            </>
          ) : (
            <button onClick={() => setMeniVysledek(true)}>Změnit výsledek</button>
          )}
        </div>
      ) : null}
      {/* Zrušený zápas byl slepá ulička — pořád nabízel Spectate i výsledek,
          ale žádnou cestu zpátky. Stavový automat návrat dovoluje schválně.
          A když se k němu Rob vracet nechce, jde odebrat úplně, ať v režii
          nestraší do konce večera. */}
      {zruseno ? (
        <div className="ovladani">
          <button onClick={() => onStav(zapas.id, "bezi")}>Vrátit do hry</button>
          <button className="odebrat-zapas" onClick={() => onSmazat(zapas.id)}>
            Odebrat úplně
          </button>
        </div>
      ) : null}
    </article>
  );
}

function klicStrany(strana: Strana): string {
  return "tym" in strana.vitez ? `tym-${strana.vitez.tym}` : `hrac-${strana.vitez.steamId}`;
}

/**
 * Tlačítko výsledku nese barvu strany a její jméno: hráče v 1v1, „modrý tým“
 * u sdílené barvy, jinak „tým 2“, s hráči drobně pod tím. Rob tak v přenosu
 * nepřepočítává, kdo je „tým 1“.
 */
function TlacitkoViteze({
  zapas,
  strana,
  onVysledek,
}: {
  zapas: ZapasView;
  strana: Strana;
  onVysledek: (zapasId: number, vitez: Vitez) => void;
}) {
  const barva = strana.clenove[0]?.barva ?? 1;
  const hraci = strana.clenove.length > 1 ? strana.clenove.map((c) => jmenoHrace({ steamId: c.steamId, alias: c.alias ?? null, steamName: c.steamName ?? null })) : [];
  return (
    <button className={`vysledek barva-${barva}`} onClick={() => onVysledek(zapas.id, strana.vitez)}>
      <span>{titulekViteze(strana)}</span>
      {hraci.length > 0 ? <small>{hraci.join(", ")}</small> : null}
    </button>
  );
}
