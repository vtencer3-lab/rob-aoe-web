import { useState, type ReactNode } from "react";
import { Chat, UDALOST_SBALIT_CHAT } from "./Chat.js";
import { jeAi } from "../../../src/shared/aiHraci.js";
import type { KontrolaLobbyVysledek } from "../../../src/shared/lobbyKontrola.js";
import type { Strana } from "../../../src/shared/strany.js";
import { BARVA_NAZEV, type AkceStavPayload, type Vitez, type ZapasView } from "../../../src/shared/types.js";
import { nazevCivilizace } from "../../../src/shared/civilizace.js";
import { useSbalovani } from "../pohyb.js";
import { jeVeHre, jmenoHrace, popisFormatu, popisTymu, strany, titulekViteze, vyhralHrac } from "../zapas.js";
import { JmenoSBarvou, VitezVeVete } from "./JmenoSBarvou.js";
import { KontrolaLobby } from "./KontrolaLobby.js";

/**
 * Co všechno jde se zápasem udělat. Hráči to nedostanou vůbec — jejich karta
 * je tatáž, jen ke čtení, bez tlačítek, která patří režii.
 */
export interface Obsluha {
  onStav: (zapasId: number, stav: string) => void;
  /** Zrušený zápas úplně odebrat, ať v režii nestraší celý večer. */
  onSmazat: (zapasId: number) => void;
  onVysledek: (zapasId: number, vitez: Vitez) => void;
  onHost: (zapasId: number, hracId: string) => void;
  onKontrolaLobby: (zapasId: number) => Promise<KontrolaLobbyVysledek>;
  /** Dohraný zápas zavřít křížkem (true), nebo z debug módu znovu otevřít (false). */
  onZavrit: (zapasId: number) => void;
  /** Zpráva do chatu zápasu; bez ní se chat v kartě nekreslí. */
  onZprava?: (zapasId: number, text: string, odpovedNa: number | null) => Promise<unknown> | void;
  /** Ozubené kolečko: otevřít úpravu zápasu (nastavení, jméno lobby, sestava). */
  onUpravit?: (zapasId: number) => void;
  /** Admin smaže zprávu v chatu. */
  onSmazatZpravu?: (zapasId: number, zpravaId: number) => Promise<unknown> | void;
  /** Vlastní zprávu jde přepsat (šipka nahoru). */
  onUpravitZpravu?: (zapasId: number, zpravaId: number, text: string) => Promise<unknown> | void;
  /** Push-to-talk admina: kam odcházejí kousky nahrávky (jen režie). */
  onHlas?: (zapasId: number, telo: { sezeni: string; poradi: number; konec?: boolean; data?: string; mime?: string }) => Promise<unknown>;
  /** Debug mód pro chat (přepínání autora). */
  ladeni?: boolean;
}

interface Props {
  stav: AkceStavPayload;
  /** Chybí u hráčů: karty jsou pak jen ke čtení. */
  obsluha?: Obsluha;
  /** Steam ID admina, který se dívá — kvůli chatu (vlastní zprávy). */
  ja?: string;
  /** Doplněk módu akce pod hlavičkou karty (Diplomacie: stav zápasu); dodává App přes `rezimKlienta`. */
  doplnek?: (zapas: ZapasView) => ReactNode;
}

/**
 * Zápasy, na které se vůbec kouká. Zavřený zmizí všem včetně režie: křížek je
 * od toho, aby karta ze stránky zmizela, a zašedlá karta s nápisem „zavřeno“
 * zabírala řádek přesně tak jako předtím. Výsledek zůstává v databázi.
 */
function vRezii(stav: AkceStavPayload): ZapasView[] {
  return stav.zapasy.filter((z) => !z.zavreny);
}

function karty(zapasy: ZapasView[], obsluha: Obsluha | undefined, ja?: string, doplnek?: Props["doplnek"]) {
  return zapasy.map((zapas) => <ZapasVRezii key={zapas.id} zapas={zapas} obsluha={obsluha} ja={ja} doplnek={doplnek?.(zapas)} />);
}

/**
 * Běžící zápasy v režii. Skládání sestavy je v panelu akce (SpravaAkce), vedle
 * nastavení lobby.
 *
 * Dohrané se sem nevrací: během večera jich přibývá a odsouvaly by rozehraný
 * zápas — tedy to jediné, co Rob právě řeší — pod okraj obrazovky. Mají vlastní
 * sekci `HistorieZapasu` až pod ním.
 */
export function Rezie({ stav, obsluha, ja, doplnek }: Props) {
  return <section className="rezie">{karty(vRezii(stav).filter(jeVeHre), obsluha, ja, doplnek)}</section>;
}

/**
 * Dohrané a zrušené zápasy, na konci stránky. Jsou to tytéž karty jako nahoře,
 * ne zkrácený výpis — Rob u nich pořád potřebuje přepsat výsledek a zavřít je
 * křížkem, a hráči je bez obsluhy vidí jen ke čtení. Dokud se nic nedohrálo,
 * sekce se nevykreslí vůbec.
 */
export function HistorieZapasu({ stav, obsluha, ja, doplnek }: Props) {
  const historie = vRezii(stav).filter((z) => !jeVeHre(z));
  if (historie.length === 0) return null;
  return (
    <section className="rezie historie-zapasu">
      <h3 className="nadpis-seznamu">Historie zápasů</h3>
      {karty(historie, obsluha, ja, doplnek)}
    </section>
  );
}

function popisStavu(zapas: ZapasView): ReactNode {
  if (zapas.stav === "zruseny") return " · zrušeno";
  if (zapas.stav !== "dohrano") return "";
  if (!zapas.vitez) return " · dohráno";
  return (
    <>
      {" · dohráno — "}
      <VitezVeVete ucastnici={zapas.ucastnici} vitez={zapas.vitez} />
    </>
  );
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

type ZapasProps = { zapas: ZapasView; obsluha?: Obsluha; ja?: string; doplnek?: ReactNode };

function ZapasVRezii({ zapas, obsluha, ja, doplnek }: ZapasProps) {
  // Přepsat zapsaný výsledek jde, ale ne jedním kliknutím do prázdna: tlačítka
  // stran se odemknou až po „Změnit výsledek“ a to druhé kliknutí je samo o sobě
  // to potvrzení. Potvrzovací okno navíc by se muselo odškrtávat v přenosu.
  const [meniVysledek, setMeniVysledek] = useState(false);
  // Sbalený zápas nechá vidět jen hlavičku. Přes večer se karet nasčítá tolik,
  // že se v nich nedá rolovat; ke starším se člověk vrací výjimečně.
  const [sbaleno, setSbaleno] = useState(false);
  // Tělo karty se sbaluje a rozbaluje plynule; sbalené se vůbec nekreslí.
  const sbalovani = useSbalovani<HTMLDivElement>(!sbaleno, (otevreno) => setSbaleno(!otevreno));
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
    <article
      data-zapas={zapas.id}
      className={bezi ? "zapas" : "zapas odepsany"}
    >
      <h2 className="titulek-zapasu" data-testid="zapas-hlavicka">
        Zápas #{zapas.poradi}
        <small>
          {" · "}
          {popisFormatu(zapas.ucastnici)}
          {popisStavu(zapas)}
        </small>
      </h2>
      {/* Sbalení má každý: hráč místo křížku (zavírat zápasy mu nepřísluší),
          Rob vedle něj. */}
      <div className="ovladani-karty">
      {dohrano || zruseno ? (
        <button
          type="button"
          className="sbalit-zapas"
          aria-expanded={!sbaleno && !sbalovani.zavira}
          aria-label={`${sbaleno ? "Rozbalit" : "Sbalit"} zápas #${zapas.poradi}`}
          title={sbaleno ? "Rozbalit" : "Sbalit — zůstane jen hlavička"}
          onClick={sbalovani.prepni}
        >
          {sbaleno ? "▸" : "▾"}
        </button>
      ) : null}
      {/* Ozubené kolečko: úprava běžícího zápasu — totéž okno jako při zakládání. */}
      {obsluha?.onUpravit && bezi ? (
        <button type="button" className="upravit-zapas" aria-label={`Upravit zápas #${zapas.poradi}`} title="Upravit nastavení lobby, jméno a sestavu" onClick={() => obsluha.onUpravit!(zapas.id)}>
          ⚙
        </button>
      ) : null}
      {/* Křížek zavře dohraný zápas: karta zmizí ze stránky všem včetně režie,
          výsledek zůstává v databázi. */}
      {obsluha && dohrano ? (
        <button type="button" className="zavrit-zapas" aria-label={`Zavřít zápas #${zapas.poradi}`} title="Zavřít — karta zmizí ze stránky, výsledek zůstane" onClick={() => obsluha.onZavrit(zapas.id)}>
          ×
        </button>
      ) : null}
      </div>
      {sbaleno ? null : (
        <div className="telo-zapasu" ref={sbalovani.telo}>
      {/* Co k zápasu říká mód akce (Diplomacie: stav a po rozeslání Nástupce) —
          Rob při streamu vidí, jestli už jsou role rozeslané. Jen slot, bez
          podmínky na mód; sbalená karta ho schová s ostatním. */}
      {doplnek ? <p className="doplnek-modu">{doplnek}</p> : null}
      {/* Řádky jako ve skládání: čtvereček barvy a týmu, jméno, ELO, stav.
          Obal .skladani a seznam .sestava musí být dva prvky — mřížka je na
          seznamu, styly čtverečků na obalu. */}
      <div className="skladani jen-ke-cteni">
      <ul className="sestava sestava-zapasu">
        {zapas.ucastnici.map((u) => {
          const vyhral = vyhralHrac(zapas.ucastnici, zapas.vitez, u.hracId);
          return (
          <li key={u.hracId} className={[`radek barva-${u.barva}`, vyhral ? "vyhral" : ""].filter(Boolean).join(" ")}>
            <span className={`volba volba-barva barva-${u.barva}`} aria-label={`Barva ${BARVA_NAZEV[u.barva]}`}>
              {u.barva}
            </span>
            <span className="volba volba-tym" aria-label={popisTymu(u)}>
              {u.tym === 0 ? "–" : u.tym}
            </span>
            <span className="jmeno">
              {jmenoHrace(u)}
              {vyhral ? (
                <strong className="odznak-vitez" data-testid="odznak-vitez" title={jeAi(u.hracId) ? "Vyhrála" : "Vyhrál"}>
                  VÍTĚZ
                </strong>
              ) : null}
            </span>
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
            ) : obsluha && bezi ? (
              <button
                onClick={() => {
                  if (potvrdZmenuHosta(jmenoHrace(u))) obsluha.onHost(zapas.id, u.hracId);
                }}
              >
                Udělat hostem
              </button>
            ) : null}
          </li>
          );
        })}
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
            onClick={() => {
              if (muzeSpectate) window.dispatchEvent(new CustomEvent(UDALOST_SBALIT_CHAT, { detail: zapas.id }));
            }}
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
          {obsluha && zapas.lobbyId ? (
            <KontrolaLobby zapasId={zapas.id} onKontrola={obsluha.onKontrolaLobby} automaticky={zapas.fazeLobby === "lobby"} />
          ) : null}
          {obsluha ? (
            <div className="ovladani">
              <VolbaVysledku zapas={zapas} onVysledek={obsluha.onVysledek}>
                <button onClick={() => obsluha.onStav(zapas.id, "zruseny")}>Zrušit</button>
              </VolbaVysledku>
            </div>
          ) : null}
        </>
      ) : null}
      {obsluha && dohrano ? (
        <div className="ovladani">
          {meniVysledek ? (
            <>
              <span className="zaloha">Kdo doopravdy vyhrál?</span>
              <VolbaVysledku
                zapas={zapas}
                onVysledek={(id, vitez) => {
                  obsluha.onVysledek(id, vitez);
                  setMeniVysledek(false);
                }}
              >
                <button onClick={() => setMeniVysledek(false)}>Nechat být</button>
              </VolbaVysledku>
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
      {obsluha && zruseno ? (
        <div className="ovladani">
          <button onClick={() => obsluha.onStav(zapas.id, "bezi")}>Vrátit do hry</button>
          <button className="odebrat-zapas" onClick={() => obsluha.onSmazat(zapas.id)}>
            Odebrat úplně
          </button>
        </div>
      ) : null}
        </div>
      )}
    {/* Chat zápasu: admin píše odsud, hráči ze své karty. */}
      {obsluha?.onZprava && ja ? (
        <Chat
          zapas={zapas}
          ja={ja}
          onOdeslat={(text, odpovedNa) => obsluha.onZprava!(zapas.id, text, odpovedNa)}
          onSmazat={obsluha.onSmazatZpravu ? (zpravaId) => obsluha.onSmazatZpravu!(zapas.id, zpravaId) : undefined}
          onUpravit={obsluha.onUpravitZpravu ? (zpravaId, text) => obsluha.onUpravitZpravu!(zapas.id, zpravaId, text) : undefined}
          ladeni={obsluha.ladeni}
          jaAdmin
          onHlas={obsluha.onHlas ? (telo) => obsluha.onHlas!(zapas.id, telo) : undefined}
        />
      ) : null}
    </article>
  );
}

function klicStrany(strana: Strana): string {
  if ("tym" in strana.vitez) return `tym-${strana.vitez.tym}`;
  return "hracId" in strana.vitez ? `hrac-${strana.vitez.hracId}` : `hraci-${strana.vitez.hraci.join("+")}`;
}

/**
 * Tlačítka výsledku: jedno na stranu, a u zápasu s víc než dvěma stranami
 * (FFA, Diplomacie) ještě „Víc vítězů…“ — aliance tam vznikají až ve hře, takže
 * vyhrát může kdokoliv s kýmkoliv a strana ze sestavy to neumí pojmenovat.
 * Výběr nahradí tlačítka zaškrtávátky u jmen; tlačítka navíc (Zrušit, Nechat
 * být) jdou do výběru s nimi, po uložení nebo Zpět se všechno vrátí.
 */
function VolbaVysledku({
  zapas,
  onVysledek,
  children,
}: {
  zapas: ZapasView;
  onVysledek: (zapasId: number, vitez: Vitez) => void;
  children?: ReactNode;
}) {
  const [vicVitezu, setVicVitezu] = useState(false);
  const stranyZapasu = strany(zapas.ucastnici);
  if (vicVitezu) {
    return (
      <VyberVitezu
        zapas={zapas}
        onUlozit={(vitez) => {
          setVicVitezu(false);
          onVysledek(zapas.id, vitez);
        }}
        onZpet={() => setVicVitezu(false)}
      />
    );
  }
  return (
    <>
      {stranyZapasu.map((strana) => (
        <TlacitkoViteze key={klicStrany(strana)} zapas={zapas} strana={strana} onVysledek={onVysledek} />
      ))}
      {stranyZapasu.length > 2 ? (
        <button type="button" onClick={() => setVicVitezu(true)}>
          Víc vítězů…
        </button>
      ) : null}
      {children}
    </>
  );
}

/** Zaškrtávátka u jmen v pořadí slotů; uložit jde, až je zaškrtnutý aspoň jeden. */
function VyberVitezu({ zapas, onUlozit, onZpet }: { zapas: ZapasView; onUlozit: (vitez: Vitez) => void; onZpet: () => void }) {
  // Už zapsaná aliance je předvyplněná, ať se při opravě nezačíná od nuly.
  const [vybrani, setVybrani] = useState<ReadonlySet<string>>(
    () => new Set(zapas.vitez !== null && "hraci" in zapas.vitez ? zapas.vitez.hraci : []),
  );
  const podleSlotu = [...zapas.ucastnici].sort((a, b) => a.poradi - b.poradi);
  const prepni = (hracId: string, zaskrtnuto: boolean) =>
    setVybrani((stare) => {
      const nove = new Set(stare);
      if (zaskrtnuto) nove.add(hracId);
      else nove.delete(hracId);
      return nove;
    });
  return (
    <fieldset className="vic-vitezu">
      <legend>Kdo všechno vyhrál?</legend>
      <ul className="vitezove">
        {podleSlotu.map((u) => (
          <li key={u.hracId}>
            <label>
              <input type="checkbox" checked={vybrani.has(u.hracId)} onChange={(e) => prepni(u.hracId, e.target.checked)} />
              <JmenoSBarvou barva={u.barva}>{jmenoHrace(u)}</JmenoSBarvou>
            </label>
          </li>
        ))}
      </ul>
      <div className="ovladani">
        <button
          type="button"
          disabled={vybrani.size === 0}
          onClick={() => onUlozit({ hraci: podleSlotu.filter((u) => vybrani.has(u.hracId)).map((u) => u.hracId) })}
        >
          Uložit vítěze
        </button>
        <button type="button" onClick={onZpet}>
          Zpět
        </button>
      </div>
    </fieldset>
  );
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
  const hraci = strana.clenove.length > 1 ? strana.clenove.map((c) => jmenoHrace({ hracId: c.hracId, alias: c.alias ?? null, platformaJmeno: c.platformaJmeno ?? null })) : [];
  return (
    <button className={`vysledek barva-${barva}`} onClick={() => onVysledek(zapas.id, strana.vitez)}>
      <span>{titulekViteze(strana)}</span>
      {hraci.length > 0 ? <small>{hraci.join(", ")}</small> : null}
    </button>
  );
}
