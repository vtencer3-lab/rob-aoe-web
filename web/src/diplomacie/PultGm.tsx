import { useState } from "react";
import { odchylkySlozeni, povoleneCile } from "../../../src/shared/diplomacie/los.js";
import { naMinimapu } from "../../../src/shared/diplomacie/minimapa.js";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import { ROLE_VOLITELNE, type DiploData, type DiploZapas, type Role, type ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import { BARVA_NAZEV, type Barva, type ZapasView } from "../../../src/shared/types.js";
import type { Hlidej } from "../rezimy/index.js";
import { JmenoUcastnika, VycetUcastniku } from "../views/JmenoSBarvou.js";
import { Rozbalovaci } from "../views/Rozbalovaci.js";
import { Potvrzeni } from "../views/Potvrzeni.js";
import { Prepinac } from "../views/Prepinac.js";
import { jmenoHrace, jmenoVZapasu, mujUcastnik } from "../zapas.js";
import { diploApi } from "./api.js";
import { MostStreamerbot } from "./MostStreamerbot.js";
import { OznameniGm, StavSchopnostiGm } from "./Schopnosti.js";
import { NastupceZeHry, RadekHry, StariHry } from "./HraZive.js";
import { diploZapasu, RubKarty, useZvukPingu, verzeZapasu, vztahyRole } from "./KartaRole.js";
import { kralNaMape, MapaScenare, popiskyStartu, type KralNaMape, type PopiskyStartu } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";
import { ZNAK_ROLE } from "./znaky.js";

const POPIS_STAVU = { priprava: "Příprava", losovano: "Losováno", rozeslano: "Rozesláno" } as const;

/** Pult GM (spec §8.1). Nic si nedrží lokálně — všechno je ve stavu ze serveru. */
export function PultGm({ zapas, data, hlidej, onUpravit }: { zapas: ZapasView; data: DiploData; hlidej: Hlidej; onUpravit?: () => void }) {
  const [pracuje, setPracuje] = useState(false);
  const [ptaSeNaZpet, setPtaSeNaZpet] = useState(false);
  // Hráč pod kurzorem (řádek tabulky nebo start na mapě): mapa ukáže jeho
  // vztahy jako na jeho kartě — oběť Kata, pouto Žoldáka, druhého Nájezdníka.
  const [najetoHrac, setNajetoHrac] = useState<string | null>(null);
  // Ping: vypínač (dokud je vypnutý, klik do mapy nic nedělá) a adresáti —
  // prázdný výběr = všem hráčům (uživatel 3. 10. 2026).
  const [pingZapnuty, setPingZapnuty] = useState(false);
  const [pingKomu, setPingKomu] = useState<string[]>([]);
  const prepniAdresata = (hracId: string) => setPingKomu((v) => (v.includes(hracId) ? v.filter((h) => h !== hracId) : [...v, hracId]));
  const d = diploZapasu(data, zapas.id);
  useZvukPingu(d?.pingy);
  if (!d) return null;
  const verze = verzeZapasu(data, d, zapas);
  const hraci = zapas.ucastnici.filter((u) => u.hracId !== d.gmHracId).sort((a, b) => a.barva - b.barva);
  // Sdílené s kartou role: víc AI se jmenuje stejně, rozliší je barva. Holý
  // text je pro popisky roletek a přehled do schránky; na stránce jméno
  // kreslí `JmenoUcastnika` i se čtverečkem barvy.
  const jmeno = (id: string) => jmenoVZapasu(zapas.ucastnici, id);
  const hrac = (id: string) => <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={id} />;
  // Chybu ukáže hlidej z App; tlačítka jsou mezitím zamčená, ať GM neklikne dvakrát.
  const akce = (fn: () => Promise<unknown>) => {
    setPracuje(true);
    void hlidej(fn).finally(() => setPracuje(false));
  };
  // Po rozeslání hráči role vidí a hrají podle nich: tabulka je jen text
  // a server úpravu odmítne (uživatel 2. 10. 2026). Jediná cesta zpátky je
  // „Zpět na výběr Nástupce“ — ta se nejdřív zeptá v okně webu (Potvrzeni,
  // jako jinde na webu) a teprve „Ano“ ji pošle s `potvrzeno`.
  const rozeslano = d.stav === "rozeslano";
  const zmen = (hracId: string, zmena: { role?: Role; cilHracId?: string }) => akce(() => diploApi.role(zapas.id, hracId, zmena));
  const posliZpet = () => akce(() => diploApi.zpet(zapas.id, rozeslano));
  const zpet = () => {
    if (rozeslano) setPtaSeNaZpet(true);
    else posliZpet();
  };
  const odchylky = d.role.length > 0 ? odchylkySlozeni(d.role) : [];
  const nastupce = zvolenyNastupce(zapas, d);
  const { popisky, kralove, relikvie, pingy } = mapaPultu(zapas, d, verze, najetoHrac);
  const najetaBarva = najetoHrac === null ? null : (mujUcastnik(zapas, najetoHrac)?.barva ?? null);
  const najetiNaMape = (barva: Barva | null) => setNajetoHrac(barva === null ? null : (zapas.ucastnici.find((u) => u.barva === barva)?.hracId ?? null));

  return (
    <section className="sekce-krok pult-gm" data-testid="pult-gm">
      <header className="zahlavi-sekce">
        {/* Žezlo s okem: GM roli nemá, znak ano — patří k pultu, ne do tabulky rolí. */}
        <img className="znak-role" src={ZNAK_ROLE.gm} alt="GM" width={26} height={26} />
        <h3>Pult GM</h3>
        <span className="stav-diplo" key={d.stav}>{POPIS_STAVU[d.stav]}</span>
        {/* GM upravuje konfiguraci zápasu jako admin (uživatel 5. 10. 2026);
            předá-li v sestavě šedou jinému, práva po uložení přejdou na něj. */}
        {onUpravit ? (
          <button type="button" className="upravit-zapas" data-testid="gm-upravit-zapas" title="Upravit zápas (sestava, nastavení lobby, verze scénáře)" aria-label="Upravit zápas" onClick={onUpravit}>
            ⚙
          </button>
        ) : null}
      </header>
      <Zakryti popisek="Pult GM — klikni pro odkrytí" rub={<RubKarty />} pamet={`diplo-pult-${zapas.id}`}>
        {/* Na širokém displeji mapa vlevo a pult vpravo (uživatel 3. 10. 2026),
            ať GM vidí mapu i role bez posouvání; na úzkém pod sebou. */}
        <div className="pult-vedle">
          {verze ? (
            <div className="mapa-pultu">
              <MapaScenare
                verze={verze}
                popisky={popisky}
                velikost="velka"
                onNajeti={najetiNaMape}
                najeto={najetaBarva}
                kralove={kralove}
                relikvie={relikvie}
                pingy={pingy}
                onKlik={pingZapnuty ? (x, y) => void hlidej(() => diploApi.ping(zapas.id, x, y, pingKomu.length > 0 ? pingKomu : null)) : undefined}
              />
              {/* Co z běžící hry ukázat na mapě — platí i pro overlaye do OBS (uživatel 3. 10. 2026). */}
              <div className="nastaveni-mapy">
                <Prepinac popisek="Zobrazit krále" vpravo="Zobrazit krále" zapnuto={d.mapa?.kralove !== false} onZmena={(v) => akce(() => diploApi.mapa(zapas.id, { kralove: v }))} testId="prepinac-kralove" />
                <Prepinac popisek="Zobrazit relikvie" vpravo="Zobrazit relikvie" zapnuto={d.mapa?.relikvie !== false} onZmena={(v) => akce(() => diploApi.mapa(zapas.id, { relikvie: v }))} testId="prepinac-relikvie" />
              </div>
              {/* Ping: vypínač, a když je zapnutý, komu klik do mapy ukáže značku
                  (víc hráčů najednou, nic vybraného = všem; uživatel 3. 10. 2026). */}
              <div className="ping-pro">
                <button type="button" className={pingZapnuty ? "ping-vypinac zapnuto" : "ping-vypinac"} aria-pressed={pingZapnuty} onClick={() => setPingZapnuty((z) => !z)} title="Ping na mapě: klik do mapy ukáže hráčům značku">
                  Ping
                </button>
                {/* Adresáti jsou vidět pořád; při vypnutém pingu ztmavení (vybírat jde i tak). */}
                <div className={pingZapnuty ? "ping-adresati" : "ping-adresati vypnuto"} role="group" aria-label="Komu pingnout">
                    <button type="button" className={pingKomu.length === 0 ? "adresat vybrany" : "adresat"} aria-pressed={pingKomu.length === 0} onClick={() => setPingKomu([])}>
                      Všem
                    </button>
                    {hraci.map((u) => (
                      <button key={u.hracId} type="button" className={pingKomu.includes(u.hracId) ? "adresat vybrany" : "adresat"} aria-pressed={pingKomu.includes(u.hracId)} onClick={() => prepniAdresata(u.hracId)}>
                        {hrac(u.hracId)}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          ) : null}
          <div className="pult-strana">
            <StariHry hra={d.hra} />

            {d.stav === "priprava" ? (
              <>
                {/* Ikona v 64 px, CSS ji zmenší na 32 — při zoomu zůstane ostrá. */}
                <p className="kdo-nastupce">
                  Kdo je <img className="znak-role" src={ZNAK_ROLE.nastupce} alt="" width={64} height={64} />
                  Nástupcem císaře?
                </p>
                <NastupceZeHry hra={d.hra} ucastnici={zapas.ucastnici} />
                <div className="dlazdice-nastupce">
                  {hraci.map((u) => (
                    <button
                      key={u.hracId}
                      type="button"
                      data-testid="dlazdice"
                      className={`dlazdice barva-${u.barva}${nastupce === u.hracId ? " vybrana" : ""}${d.hra?.nastupceHracId === u.hracId ? " ze-hry" : ""}`}
                      // Bez `disabled` během ukládání: zamčená tlačítka zprůhlední
                      // a celá sekce při každé volbě problikla (uživatel 3. 10.
                      // 2026). Dvojí odeslání hlídá podmínka v obsluze.
                      onClick={() => (pracuje ? undefined : akce(() => diploApi.nastupce(zapas.id, u.hracId)))}
                    >
                      {/* Zvolený Nástupce: nakloněná koruna v rohu dlaždice (uživatel 3. 10. 2026). */}
                      {nastupce === u.hracId ? <img className="koruna-roh" src={ZNAK_ROLE.nastupce} alt="" width={64} height={64} /> : null}
                      {/* Koho předvybrala hra (most ke hře): koruna a záře, ať GM vidí, jestli sedí. */}
                      {d.hra?.nastupceHracId === u.hracId ? <img className="znak-role" src={ZNAK_ROLE.nastupce} alt="Nástupce podle hry" width={64} height={64} /> : null}
                      <span className="barva">{BARVA_NAZEV[u.barva]}</span> <strong>{jmenoHrace(u)}</strong>
                    </button>
                  ))}
                </div>
                <button type="button" className="cta rozdat-role" disabled={nastupce === null} onClick={() => (pracuje ? undefined : akce(() => diploApi.los(zapas.id)))}>
                  Rozdat role
                </button>
              </>
            ) : (
              <>
                {/* Žádosti hráčů o schopnosti a připomínky ze hry (uživatel 3. 10. 2026). */}
                <OznameniGm zapas={zapas} d={d} akce={akce} pracuje={pracuje} />
                <TabulkaRoli zapas={zapas} d={d} upravy={rozeslano ? null : { pracuje, zmen }} najetoHrac={najetoHrac} onNajeti={setNajetoHrac} />
                {/* Souhrn uprostřed, Přelosovat na témže řádku u pravého kraje;
                    pod tím Zpět na výběr Nástupce vlevo a Rozeslat role vpravo
                    (uživatel 3. 10. 2026). */}
                <div className="souhrn-radek">
                  <p className={odchylky.length > 0 ? "souhrn varovani" : "souhrn"}>{odchylky.length > 0 ? odchylky.join(", ") : "Složení odpovídá pravidlům."}</p>
                  {d.stav === "losovano" ? (
                    <button type="button" disabled={pracuje} onClick={() => akce(() => diploApi.los(zapas.id))}>
                      Přelosovat
                    </button>
                  ) : null}
                </div>
                <div className="ovladani krajni">
                  <button type="button" disabled={pracuje} onClick={zpet}>
                    Zpět na výběr Nástupce
                  </button>
                  {/* Bez mostu web pád Gardy nepozná — proměnu Šaška spustí GM. */}
                  {rozeslano && d.role.some((r) => r.role === "sasek") && !d.role.some((r) => r.puvodniRole) ? (
                    <button type="button" disabled={pracuje} onClick={() => akce(() => diploApi.gardaPadla(zapas.id))}>
                      Garda padla
                    </button>
                  ) : null}
                  {d.stav === "losovano" ? (
                    <button type="button" className="cta" disabled={pracuje} onClick={() => akce(() => diploApi.rozeslat(zapas.id))}>
                      Rozeslat role
                    </button>
                  ) : null}
                </div>
              </>
            )}
          </div>
        </div>
        <MostStreamerbot hlidej={hlidej} />
        <PravidlaHry verze={verze} />
      </Zakryti>
      {ptaSeNaZpet ? (
        <Potvrzeni
          text="Role už hráči vidí. Opravdu je smazat a vybírat Nástupce znovu?"
          onPotvrdit={() => {
            setPtaSeNaZpet(false);
            posliZpet();
          }}
          onZrusit={() => setPtaSeNaZpet(false)}
        />
      ) : null}
    </section>
  );
}

/** Server Nástupce po změně sestavy nuluje, ale stav se sestavou může přes
 * SSE dorazit o chvíli dřív než ten s vynulovaným Nástupcem: za zvoleného
 * platí jen ten, kdo je pořád mezi hráči — jinak by svítilo „Rozdat role“
 * bez označené dlaždice. */
function zvolenyNastupce(zapas: ZapasView, d: DiploZapas): string | null {
  return zapas.ucastnici.some((u) => u.hracId !== d.gmHracId && u.hracId === d.nastupceHracId) ? d.nastupceHracId : null;
}

/**
 * Mapa očima GM — pult i overlay do OBS: u každého startu jméno hráče,
 * zvolený Nástupce s korunou, králové všech hráčů z běžící hry (uživatel
 * 3. 10. 2026) a vztahy hráče pod kurzorem jako na jeho kartě.
 */
export function mapaPultu(
  zapas: ZapasView,
  d: DiploZapas,
  verze: ScenarVerze | null,
  najetoHrac: string | null = null,
): { popisky: PopiskyStartu; kralove: KralNaMape[]; relikvie: { x: number; y: number; barva?: Barva }[]; pingy: { id: number; x: number; y: number; barva?: Barva }[] } {
  if (!verze?.rozbor) return { popisky: verze ? popiskyStartu(verze, {}) : {}, kralove: [], relikvie: [], pingy: [] };
  const velikost = verze.rozbor.velikostMapy;
  const jmena = Object.fromEntries(zapas.ucastnici.map((u) => [u.barva, jmenoHrace(u)])) as Partial<Record<Barva, string>>;
  const popisky = popiskyStartu(verze, jmena);
  const nastupce = zvolenyNastupce(zapas, d);
  const barvaNastupce = nastupce === null ? undefined : mujUcastnik(zapas, nastupce)?.barva;
  if (barvaNastupce !== undefined && popisky[barvaNastupce]) popisky[barvaNastupce] = { ...popisky[barvaNastupce], druhy: ["nastupce"] };
  // Role existují od losu (návrh i rozeslané); v přípravě není co ukázat.
  const najetaRole = najetoHrac === null ? undefined : d.role.find((r) => r.hracId === najetoHrac);
  for (const v of najetaRole ? vztahyRole(d, najetaRole) : []) {
    const b = mujUcastnik(zapas, v.hracId)?.barva;
    const p = b === undefined ? undefined : popisky[b];
    if (b !== undefined && p) popisky[b] = { ...p, druhy: [...(p.druhy ?? []), v.druh] };
  }
  // Co ukázat, přepíná GM pod mapou (`d.mapa`); platí i pro overlaye.
  const kralove = d.mapa?.kralove === false ? [] : (d.hra?.hraci ?? []).flatMap((h) => kralNaMape(verze, mujUcastnik(zapas, h.hracId)?.barva, h.kral) ?? []);
  // Relikvie (uživatel 3. 10. 2026): kde leží, jen GM a overlay.
  const relikvie = d.mapa?.relikvie === false ? [] : (d.hra?.relikvie ?? []).map((r) => ({ ...naMinimapu(r.x, r.y, velikost), ...(r.barva ? { barva: r.barva } : {}) }));
  // Pingy GM: barva hráče, kterému patří; ping pro všechny bez barvy.
  const pingy = (d.pingy ?? []).map((p) => {
    // Jednomu hráči v jeho barvě; víc hráčům nebo všem zlatě.
    const barva = p.komu?.length === 1 ? mujUcastnik(zapas, p.komu[0]!)?.barva : undefined;
    return { id: p.id, x: p.x, y: p.y, ...(barva ? { barva } : {}) };
  });
  return { popisky, kralove, relikvie, pingy };
}

/**
 * Tabulka rolí — pult GM (s roletkami, dokud role nejsou rozeslané) i overlay
 * do OBS (jen text, `upravy` null). Pod každým hráčem řádek s daty ze hry.
 */
export function TabulkaRoli({
  zapas,
  d,
  upravy,
  najetoHrac = null,
  onNajeti,
}: {
  zapas: ZapasView;
  d: DiploZapas;
  upravy: { pracuje: boolean; zmen: (hracId: string, zmena: { role?: Role; cilHracId?: string }) => void } | null;
  najetoHrac?: string | null;
  onNajeti?: (hracId: string | null) => void;
}) {
  const jmeno = (id: string) => jmenoVZapasu(zapas.ucastnici, id);
  const hrac = (id: string) => <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={id} />;
  return (
    <table className="tabulka-roli">
      <tbody>
        {d.role.flatMap((r) => {
          // Vyřazený hráč (hra hlásí, že už nehraje): jméno přeškrtnuté, řádek ztlumený (uživatel 3. 10. 2026).
          const vyrazen = d.hra?.hraci.find((h) => h.hracId === r.hracId)?.zije === false;
          // Pod řádkem hráče ještě řádek s daty ze hry (bez nich nic nekreslí).
          return [
            <tr key={r.hracId} className={[najetoHrac === r.hracId ? "najeto" : "", vyrazen ? "vyrazen" : ""].filter(Boolean).join(" ") || undefined} onMouseEnter={onNajeti ? () => onNajeti(r.hracId) : undefined} onMouseLeave={onNajeti ? () => onNajeti(null) : undefined}>
              {/* Čtvereček barvy jako na dlaždicích: řádky jdou v pořadí slotů, dlaždice podle barvy. */}
              <th scope="row">{hrac(r.hracId)}</th>
              {/* Znak ve vlastní buňce, ne v th: v hlavičce řádku by alt
                  přepsal přístupné jméno hráče, vedle roletky by ji zalomil. */}
              <td className="znak">
                <img key={r.role} className="znak-role" src={ZNAK_ROLE[r.role]} alt={NAZEV_ROLE[r.role]} width={36} height={36} />
              </td>
              <td>
                {vyrazen ? <span className="sr-only">vyřazen, </span> : null}
                {r.role === "nastupce" || !upravy ? (
                  <>
                    <strong>{NAZEV_ROLE[r.role]}</strong>
                    {r.puvodniRole ? <span className="drive-role"> (dříve {NAZEV_ROLE[r.puvodniRole]})</span> : null}{" "}
                    <StavSchopnostiGm d={d} r={r} />
                  </>
                ) : (
                  <select aria-label={`Role: ${jmeno(r.hracId)}`} value={r.role} disabled={upravy.pracuje} onChange={(e) => upravy.zmen(r.hracId, { role: e.target.value as Role })}>
                    {ROLE_VOLITELNE.map((v) => (
                      <option key={v} value={v}>
                        {NAZEV_ROLE[v]}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td>
                {!upravy && (r.role === "kat" || r.role === "zoldak") ? (
                  // Po rozeslání se nic nemění — ani cíl, který chybí.
                  <span>
                    {r.role === "kat" ? "oběť: " : "pokrevní pouto: "}
                    {r.cilHracId ? hrac(r.cilHracId) : "—"}
                  </span>
                ) : upravy && (r.role === "kat" || r.role === "zoldak") ? (
                  // Vlastní rozbalovací výběr: u každého hráče čtvereček barvy
                  // s číslem, jako všude jinde (uživatel 3. 10. 2026).
                  <Rozbalovaci<string | null>
                    trida="vyber-hrace"
                    popisek={`Cíl: ${jmeno(r.hracId)}`}
                    polozky={povoleneCile(
                      d.role.map((x) => x.hracId),
                      r.hracId,
                      d.nastupceHracId!,
                    )}
                    hodnota={r.cilHracId}
                    vypnuto={upravy.pracuje}
                    onZmena={(c) => (c === null ? undefined : upravy.zmen(r.hracId, { cilHracId: c }))}
                    klic={(c) => c ?? "zadny"}
                    obsah={(c) => <span>{c === null ? "—" : hrac(c)}</span>}
                  />
                ) : r.role === "najezdnik" ? (
                  <span>
                    zná: <VycetUcastniku ucastnici={zapas.ucastnici} hraci={d.role.filter((x) => x.role === "najezdnik" && x.hracId !== r.hracId).map((x) => x.hracId)} />
                  </span>
                ) : null}
              </td>
            </tr>,
            <RadekHry key={`${r.hracId}-hra`} hra={d.hra} hracId={r.hracId} />,
          ];
        })}
      </tbody>
    </table>
  );
}
