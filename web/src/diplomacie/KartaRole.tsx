import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, DiploZapas, MojeHra, PingNaMape, RoleHrace } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import chatUrl from "../assets/chat.mp3";
import zvonUrl from "../assets/zvon.mp3";
import { hlasitostChatu, prehraj } from "../zvuk.js";
import { JmenoUcastnika, VycetUcastniku } from "../views/JmenoSBarvou.js";
import { jmenoVZapasu, mujUcastnik } from "../zapas.js";
import { kralNaMape, MapaScenare, type DruhPopisku, type PopiskyStartu } from "./MapaScenare.js";
import type { Hlidej } from "../rezimy/index.js";
import { diploApi } from "./api.js";
import { MojeCile } from "./MojeCile.js";
import { MojeSchopnosti, PovinnyProdej } from "./Schopnosti.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";
import { PLAMENY, RUB_KARTY, ZNAK_PROHRA, ZNAK_ROLE } from "./znaky.js";

interface Props {
  zapas: ZapasView;
  data: DiploData;
  ja: string;
  hlidej: Hlidej;
}

export function diploZapasu(data: DiploData, zapasId: number): DiploZapas | undefined {
  return data.zapasy.find((z) => z.zapasId === zapasId);
}

/**
 * Verze scénáře, kterou zápas hraje (otisknutá při založení). Běžící zápas
 * bez otisku (založený, když ještě žádná verze nebyla) hraje aktivní.
 * Dohraný nebo zrušený bez otisku přišel o verzi smazáním (smazVerzi) —
 * ten nedostane žádnou, ať karta neukáže cizí mapu: null = bez mapy a pravidel.
 */
export function verzeZapasu(data: DiploData, d: DiploZapas | undefined, zapas: Pick<ZapasView, "stav">) {
  if (d?.scenarId != null) return data.verze[d.scenarId] ?? null;
  return zapas.stav === "bezi" ? data.aktivni : null;
}

/**
 * Rub zakryté karty pro `Zakryti` — tady i v pultu GM. Bez `alt`: je to
 * jen obrázek „karta leží rubem nahoru“, co pod ní je, říká tlačítko, které
 * ho v `Zakryti` obaluje (karta je tlačítkem sama).
 */
export function RubKarty() {
  return <img className="rub-karty" src={RUB_KARTY} alt="" width={600} height={362} />;
}

/**
 * Nový ping GM cinkne (zvuk chatu, hlasitost chatu); pingy známé už při
 * načtení ne. Hráč na kartě i GM v pultu (potvrzení, že ping odešel).
 */
export function useZvukPingu(pingy: readonly PingNaMape[] | undefined): void {
  const znamePingy = useRef<Set<number> | null>(null);
  const idPingu = (pingy ?? []).map((p) => p.id).join(",");
  useEffect(() => {
    const ted = new Set((pingy ?? []).map((p) => p.id));
    const driv = znamePingy.current;
    znamePingy.current = ted;
    if (driv !== null && [...ted].some((id) => !driv.has(id))) prehraj(chatUrl, hlasitostChatu());
  }, [idPingu]);
}

/** Tajná karta role hráče (spec §8.2). Data jsou už zredigovaná serverem. */
export function KartaRole({ zapas, data, ja, hlidej }: Props) {
  const d = diploZapasu(data, zapas.id);
  // Zvon jen při přechodu do „rozesláno“, ne při načtení stránky s už
  // rozeslanými rolemi — stejně jako ostatní zvonění v App.tsx.
  const driv = useRef<string | undefined>(undefined);
  useEffect(() => {
    const predtim = driv.current;
    driv.current = d?.stav;
    if (predtim !== undefined && predtim !== "rozeslano" && d?.stav === "rozeslano") prehraj(zvonUrl);
  }, [d?.stav]);

  useZvukPingu(d?.pingy);

  // Šašek, kterému padla Garda (uživatel 3. 10. 2026): zvon, ať se podívá na
  // web, karta Šaška ztmavne a čeká na klik; pak shoří a objeví se Garda.
  const ja_ = d?.role.find((r) => r.hracId === ja);
  // DOČASNÉ (uživatel 4. 10. 2026, ladění animace hoření): proměněný Šašek
  // si může hoření přehrát znovu jen u sebe, server se nemění. Před mergem
  // do dev odstranit (docs/diplomacie-kontrolni-seznam.md, bod 4.7).
  const [ladeniHoreni, setLadeniHoreni] = useState(false);
  const promena = (ja_?.puvodniRole === "sasek" && ja_.promenaVidena === false) || ladeniHoreni;
  const drivPromena = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    const predtim = drivPromena.current;
    drivPromena.current = promena;
    if (predtim === false && promena) prehraj(zvonUrl);
  }, [promena]);

  if (!d) return null;
  const verze = verzeZapasu(data, d, zapas);
  const prohra = ja_ ? duvodProhry(ja_, d) : null;
  const moje = d.role.find((r) => r.hracId === ja);

  return (
    <section className="sekce-krok karta-role" data-testid="karta-role">
      <header className="zahlavi-sekce">
        <h3>Diplomacie</h3>
      </header>
      {d.stav !== "rozeslano" || !moje ? (
        <p className="ceka stred">Role se rozdají po startu hry, až GM potvrdí Nástupce.</p>
      ) : (
        <>
          {prohra ? <Prohra duvod={prohra} ucastnici={zapas.ucastnici} /> : null}
          <p className="stred">
            Nástupcem císaře je <strong>{d.nastupceHracId ? <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={d.nastupceHracId} /> : "?"}</strong>.
          </p>
          {promena ? (
            <PromenaSaska key={String(ladeniHoreni)} onHotovo={() => (ladeniHoreni ? setLadeniHoreni(false) : void hlidej(() => diploApi.promenaVidena(zapas.id)))}>
              {/* Hoří celá karta Šaška i s mapou a cíli (uživatel 4. 10. 2026);
                  bez dat ze hry při ladění ukázkové hodnoty. */}
              <TeloKarty zapas={zapas} d={ladeniHoreni && !d.mojeHra ? { ...d, mojeHra: UKAZKOVA_HRA } : d} moje={{ ...moje, role: "sasek" }} verze={verze} hlidej={hlidej} />
            </PromenaSaska>
          ) : (
          <>
          {ja_?.puvodniRole === "sasek" ? (
            <p className="stred ladeni-horeni">
              <button type="button" onClick={() => setLadeniHoreni(true)}>
                Přehrát hoření znovu (dočasné, ladění)
              </button>
            </p>
          ) : null}
          <Zakryti popisek="Tvá tajná role" napoveda="Klikni pro odkrytí" rub={<RubKarty />} pamet={`diplo-karta-${zapas.id}`}>
            <TeloKarty zapas={zapas} d={d} moje={moje} verze={verze} hlidej={hlidej} />
          </Zakryti>
          </>
          )}
        </>
      )}
      <PravidlaHry verze={verze} />
    </section>
  );
}

/** Role, mapa a cíle — líc karty hráče i karta Šaška, která při proměně hoří. */
function TeloKarty({ zapas, d, moje, verze, hlidej }: { zapas: ZapasView; d: DiploZapas; moje: RoleHrace; verze: ReturnType<typeof verzeZapasu>; hlidej: Hlidej }) {
  return (
    <>
      <ObsahRole moje={moje} vse={d.role} ucastnici={zapas.ucastnici} />
      {/* Na širokém displeji mapa vlevo a cíle vpravo, jako mapa a tabulka v pultu GM (uživatel 3. 10. 2026). */}
      <div className="karta-vedle">
        {verze ? <MapaScenare verze={verze} popisky={popiskyRole(zapas, d, moje)} velikost="velka" kralove={[kralNaMape(verze, mujUcastnik(zapas, moje.hracId)?.barva, d.mujKral)].flatMap((k) => k ?? [])} pingy={(d.pingy ?? []).map((p) => ({ id: p.id, x: p.x, y: p.y }))} /> : null}
        <div className="karta-strana">
          <PovinnyProdej d={d} hracId={moje.hracId} />
          <MojeCile hra={d.mojeHra} role={moje.role} ucastnici={zapas.ucastnici} />
          <MojeSchopnosti zapas={zapas} d={d} moje={moje} hlidej={hlidej} />
          <OdhaleneRole odhalene={d.odhaleneRole} ucastnici={zapas.ucastnici} />
        </div>
      </div>
    </>
  );
}

/** DOČASNÉ (ladění hoření): ukázkový postup Šaška, když ze hry nic nechodí. */
const UKAZKOVA_HRA: MojeHra = {
  cas: 1834,
  prijato: "2026-10-04T12:00:00.000Z",
  rozdano: true,
  cil: { text: "zkonvertovano : {} /99", limit: 99, hodnota: 37 },
  relikvie: 3,
  drzeni: 0,
  sledovani: [],
};

/**
 * Role prohrává s pádem jiného hráče (pravidla): Žoldák se svým pokrevním
 * poutem, Garda s Nástupcem. Pozná se z vlastních dat hry (`sledovani`).
 */
function duvodProhry(r: RoleHrace, d: DiploZapas): { text: string; hracId: string } | null {
  const padl = (id: string | null) => id !== null && d.mojeHra?.sledovani.some((s) => s.hracId === id && s.zije === false);
  if (r.role === "zoldak" && padl(r.cilHracId)) return { text: "Tvé pokrevní pouto padlo:", hracId: r.cilHracId! };
  if (r.role === "garda" && padl(d.nastupceHracId)) return { text: "Nástupce císaře padl:", hracId: d.nastupceHracId! };
  return null;
}

/**
 * Obrazovka prohry přes celou sekci Diplomacie, okolí ztmavené (uživatel
 * 3. 10. 2026): kdo padl a výzva k rezignaci. Zvon při objevení; „Zavřít“
 * ji schová jen v tomhle okně, ať jde dál číst karta.
 */
function Prohra({ duvod, ucastnici }: { duvod: { text: string; hracId: string }; ucastnici: ZapasView["ucastnici"] }) {
  const [zavreno, setZavreno] = useState(false);
  useEffect(() => prehraj(zvonUrl), []);
  if (zavreno) return null;
  return (
    <div className="prohra-zastena">
    <div className="prohra-role" role="alert" data-testid="prohra">
      <img className="znak-prohry" src={ZNAK_PROHRA} alt="" width={208} height={208} />
      <h4>Prohráváš</h4>
      <p>
        {duvod.text}{" "}
        <strong>
          <JmenoUcastnika ucastnici={ucastnici} hracId={duvod.hracId} />
        </strong>
      </p>
      <p className="vyzva">Rezignuj ve hře.</p>
      <button type="button" onClick={() => setZavreno(true)}>
        Zavřít
      </button>
    </div>
    </div>
  );
}

/** Garda: role padlých hráčů, jak je web zjistí ze hry (výhoda role). Nová cinkne. */
function OdhaleneRole({ odhalene, ucastnici }: { odhalene: DiploZapas["odhaleneRole"]; ucastnici: ZapasView["ucastnici"] }) {
  const pocet = odhalene?.length ?? 0;
  const driv = useRef<number | null>(null);
  useEffect(() => {
    if (driv.current !== null && pocet > driv.current) prehraj(chatUrl, hlasitostChatu());
    driv.current = pocet;
  }, [pocet]);
  if (!odhalene || odhalene.length === 0) return null;
  return (
    <div className="moje-schopnosti odhalene-role" data-testid="odhalene-role">
      <h5>Role padlých</h5>
      <ul>
        {odhalene.map((o) => (
          <li key={o.hracId}>
            <JmenoUcastnika ucastnici={ucastnici} hracId={o.hracId} />: <img className="znak-role" src={ZNAK_ROLE[o.role]} alt="" width={28} height={28} /> <strong>{NAZEV_ROLE[o.role]}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O kolik výšky karty video plamenů přesahuje nad ni (CSS `.karta-promena .plameny`, top: -25 %). */
const PRESAH_PLAMENU = 0.25;

/** Plameny o něco pomaleji, než je video natočené (uživatel 4. 10. 2026: „trochu pomalejší, ne o moc“) — 1,8 s → 2,25 s. Maska jde podle času videa, sesazení zůstane. */
const RYCHLOST_PLAMENU = 0.8;

/**
 * Od jaké výšky čela (podíl výšky karty) oheň zhasíná: o něco dřív než
 * u horního okraje, ať vysoké plameny nešlehají přes sekci nad kartou;
 * zbytek karty dohoří maskou během zhasínání.
 */
const ZHASNOUT_OD = 0.85;

/** Jak dlouho oheň zhasíná, když dohoří k hornímu okraji karty (CSS `.karta-promena.zhasina`). */
const ZHASINANI_MS = 450;

/** Pojistka: kdyby video neskončilo (nenačetlo se, prohlížeč ho nepustí), Garda se ukáže i tak. */
const POJISTKA_HORENI_MS = 3500;

/**
 * Kde je čelo ohně ve videu `plameny.webm` v čase `t` (s): podíl výšky od
 * spodního okraje. Týž vzorec jako `baseline` v `nastroje/grafika/plameny.mjs`
 * (720×960, y shora): 0–0,15 s vyšlehne u spodku, do 1,4 s rovnoměrně
 * vystoupá nahoru, pak dohoří.
 */
export function celoOhne(t: number): number {
  const mix = (a: number, b: number, x: number) => a + (b - a) * Math.min(1, Math.max(0, x));
  const plynule = (a: number, b: number, x: number) => {
    const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return u * u * (3 - 2 * u);
  };
  const y = t < 0.15 ? mix(967, 949, plynule(0, 0.15, t)) : t <= 1.4 ? mix(949, -7, (t - 0.15) / 1.25) : mix(-7, -34, plynule(1.4, 1.8, t));
  return 1 - y / 960;
}

/**
 * Karta Šaška po pádu Gardy: ztmavlá, přes ni velké tlačítko. Po kliknutí
 * shoří a teprve pak se serveru řekne, že hráč proměnu viděl — stav pak
 * přinese kartu Gardy.
 *
 * Hoření (uživatel 3. 10. 2026: animace se trhala a nesedělo čelo ohně):
 * video je načtené předem (`preload`), pustí se kliknutím a masku karty
 * posouvá každý snímek podle času videa (`celoOhne`) — maska a plameny tak
 * jdou spolu i při zaváhání přehrávání. Filtry se neanimují (drahé
 * překreslování celé karty). Konec = konec videa, s pojistkou.
 */
function PromenaSaska({ children, onHotovo }: { children: React.ReactNode; onHotovo: () => void }) {
  const [hori, setHori] = useState(false);
  const obal = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const hotovo = useRef(false);
  // Tlačítko doprostřed panelu role Šaška, ne celého bloku s mapou
  // (uživatel 4. 10. 2026); panel se změří a sleduje při změně velikosti.
  const [stredRole, setStredRole] = useState<number | null>(null);
  useLayoutEffect(() => {
    const zmer = () => {
      const role = obal.current?.querySelector<HTMLElement>(".role");
      if (role) setStredRole(role.offsetTop + role.offsetHeight / 2);
    };
    zmer();
    window.addEventListener("resize", zmer);
    return () => window.removeEventListener("resize", zmer);
  }, []);
  useEffect(() => {
    if (!hori) return;
    const dokonci = () => {
      if (hotovo.current) return;
      hotovo.current = true;
      onHotovo();
    };
    const bezPohybu = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (bezPohybu) {
      dokonci();
      return;
    }
    const v = video.current;
    if (v) v.playbackRate = RYCHLOST_PLAMENU;
    void v?.play?.()?.catch?.(() => dokonci());
    let snimek = 0;
    let zhasina: ReturnType<typeof setTimeout> | null = null;
    const tik = () => {
      // Čelo ve videu → výška karty: video je o PRESAH_PLAMENU vyšší a spodky sedí.
      const hori = celoOhne(v?.currentTime ?? 0) * (1 + PRESAH_PLAMENU);
      obal.current?.style.setProperty("--hori", `${(hori * 100).toFixed(2)}%`);
      // Karta shořela celá (čelo u horního okraje): oheň dál nestoupá, plynule
      // zhasne a ukáže se Garda (uživatel 4. 10. 2026).
      // Maska jede dál, ať zbytek karty dohoří i během zhasínání.
      if (hori >= ZHASNOUT_OD && zhasina === null) {
        obal.current?.classList.add("zhasina");
        zhasina = setTimeout(dokonci, ZHASINANI_MS);
      }
      snimek = requestAnimationFrame(tik);
    };
    snimek = requestAnimationFrame(tik);
    v?.addEventListener("ended", dokonci);
    const pojistka = setTimeout(dokonci, POJISTKA_HORENI_MS);
    return () => {
      cancelAnimationFrame(snimek);
      v?.removeEventListener("ended", dokonci);
      clearTimeout(pojistka);
      if (zhasina !== null) clearTimeout(zhasina);
    };
  }, [hori]);
  return (
    <div ref={obal} className={hori ? "karta-promena hori" : "karta-promena"} data-testid="promena-saska">
      <div className="karta-promena-obsah" aria-hidden="true">
        {children}
      </div>
      {/* Plameny přes kartu (video s průhledností); načtené hned, ať po kliknutí naběhnou bez zpoždění. */}
      <div className="zar" aria-hidden="true" />
      <video ref={video} className="plameny" src={PLAMENY} muted playsInline preload="auto" aria-hidden="true" data-testid="plameny" />
      {hori ? null : (
        <button type="button" className="primarni promena-tlacitko" style={stredRole === null ? undefined : { top: `${stredRole}px` }} onClick={() => setHori(true)}>
          Královská garda padla
        </button>
      )}
    </div>
  );
}

/**
 * Co hráč uvidí na mapě pod svou rolí: vlastní start a hráče, ke kterým má
 * podle role vztah — další Nájezdníky, oběť Kata, pokrevní pouto Žoldáka —
 * a u každého Nástupce císaře (uživatel 2. 10. 2026). Bere jen to, co už
 * hráč ve svém zaslepeném stavu má (viditelnost.ts): na mapu se tím
 * nedostane nic, co není slovy na kartě nad ní. Jeden hráč může nést víc
 * druhů naráz (vlastní start Nástupce); jméno jako jinde na kartě.
 */
function popiskyRole(zapas: ZapasView, d: DiploZapas, moje: RoleHrace): PopiskyStartu {
  const popisky: PopiskyStartu = {};
  const pridej = (hracId: string, druh: DruhPopisku) => {
    const u = zapas.ucastnici.find((x) => x.hracId === hracId);
    if (!u) return;
    const dosud = popisky[u.barva];
    popisky[u.barva] = {
      text: dosud?.text ?? (hracId === moje.hracId ? "Tady začínáš" : jmenoVZapasu(zapas.ucastnici, hracId)),
      druhy: [...(dosud?.druhy ?? []), druh],
    };
  };
  pridej(moje.hracId, "ja");
  for (const v of vztahyRole(d, moje)) pridej(v.hracId, v.druh);
  if (d.nastupceHracId) pridej(d.nastupceHracId, "nastupce");
  return popisky;
}

/**
 * Ke kterým hráčům má role vztah, který se ukazuje na mapě: další
 * Nájezdníci, oběť Kata, pokrevní pouto Žoldáka. Jediné místo pro kartu
 * role i pult GM (najetí na hráče, uživatel 3. 10. 2026).
 */
export function vztahyRole(d: Pick<DiploZapas, "role">, r: RoleHrace): { hracId: string; druh: DruhPopisku }[] {
  if (r.role === "najezdnik") return d.role.filter((x) => x.role === "najezdnik" && x.hracId !== r.hracId).map((x) => ({ hracId: x.hracId, druh: "spojenec" }));
  if (r.role === "kat" && r.cilHracId) return [{ hracId: r.cilHracId, druh: "obet" }];
  if (r.role === "zoldak" && r.cilHracId) return [{ hracId: r.cilHracId, druh: "pouto" }];
  return [];
}

/**
 * Jména na kartě jdou přes `JmenoUcastnika` — sdílené s pultem GM: čtvereček
 * barvy a u stejně pojmenovaných AI přívěsek „(pN)“.
 */
function ObsahRole({ moje, vse, ucastnici }: { moje: RoleHrace; vse: RoleHrace[]; ucastnici: ZapasView["ucastnici"] }) {
  const popis = POPIS_ROLE[moje.role];
  // Všichni ostatní Nájezdníci, ne jen první: GM smí rozeslat i tři (spec
  // §6.2) a redakce je Nájezdníkovi posílá všechny.
  const ostatni = moje.role === "najezdnik" ? vse.filter((r) => r.role === "najezdnik" && r.hracId !== moje.hracId) : [];
  return (
    <div className={`role role-${moje.role}`}>
      {/* Znak mimo h4: uvnitř by alt zdvojil přístupný název nadpisu. */}
      <img className="znak-role" src={ZNAK_ROLE[moje.role]} alt={NAZEV_ROLE[moje.role]} width={104} height={104} />
      <h4>{NAZEV_ROLE[moje.role]}</h4>
      <p className="cil">{popis.cil}</p>
      {moje.role === "kat" && moje.cilHracId ? (
        <p>
          <span>Oběť:</span>{" "}
          <strong>
            <JmenoUcastnika ucastnici={ucastnici} hracId={moje.cilHracId} />
          </strong>
        </p>
      ) : null}
      {moje.role === "zoldak" && moje.cilHracId ? (
        <p>
          <span>Pokrevní pouto:</span>{" "}
          <strong>
            <JmenoUcastnika ucastnici={ucastnici} hracId={moje.cilHracId} />
          </strong>
        </p>
      ) : null}
      {ostatni.length > 0 ? (
        <p>
          <span>{ostatni.length === 1 ? "Druhý Nájezdník:" : "Další Nájezdníci:"}</span>{" "}
          <strong>
            <VycetUcastniku ucastnici={ucastnici} hraci={ostatni.map((r) => r.hracId)} />
          </strong>
        </p>
      ) : null}
      {popis.informace?.map((v) => (
        <p key={v} className="informace-role">
          {v}
        </p>
      ))}
      {popis.vyhody.length > 0 ? (
        <>
          <h5>Výhody</h5>
          <ul>
            {popis.vyhody.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </>
      ) : null}
      {popis.nevyhody.length > 0 ? (
        <>
          <h5>Nevýhody</h5>
          <ul>
            {popis.nevyhody.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}
