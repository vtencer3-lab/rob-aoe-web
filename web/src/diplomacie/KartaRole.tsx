import { useEffect, useRef } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, DiploZapas, RoleHrace } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import zvonUrl from "../assets/zvon.mp3";
import { prehraj } from "../zvuk.js";
import { JmenoUcastnika, VycetUcastniku } from "../views/JmenoSBarvou.js";
import { jmenoVZapasu } from "../zapas.js";
import { MapaScenare, type DruhPopisku, type PopiskyStartu } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";
import { RUB_KARTY, ZNAK_ROLE } from "./znaky.js";

interface Props {
  zapas: ZapasView;
  data: DiploData;
  ja: string;
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

/** Tajná karta role hráče (spec §8.2). Data jsou už zredigovaná serverem. */
export function KartaRole({ zapas, data, ja }: Props) {
  const d = diploZapasu(data, zapas.id);
  // Zvon jen při přechodu do „rozesláno“, ne při načtení stránky s už
  // rozeslanými rolemi — stejně jako ostatní zvonění v App.tsx.
  const driv = useRef<string | undefined>(undefined);
  useEffect(() => {
    const predtim = driv.current;
    driv.current = d?.stav;
    if (predtim !== undefined && predtim !== "rozeslano" && d?.stav === "rozeslano") prehraj(zvonUrl);
  }, [d?.stav]);

  if (!d) return null;
  const verze = verzeZapasu(data, d, zapas);
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
          <p className="stred">
            Nástupcem císaře je <strong>{d.nastupceHracId ? <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={d.nastupceHracId} /> : "?"}</strong>.
          </p>
          <Zakryti popisek="Tvá tajná role" napoveda="Klikni pro odkrytí" rub={<RubKarty />}>
            <ObsahRole moje={moje} vse={d.role} ucastnici={zapas.ucastnici} />
            {verze ? <MapaScenare verze={verze} popisky={popiskyRole(zapas, d, moje)} velikost="velka" /> : null}
          </Zakryti>
        </>
      )}
      <PravidlaHry verze={verze} />
    </section>
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
