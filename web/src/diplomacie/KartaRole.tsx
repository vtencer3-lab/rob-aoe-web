import { useEffect, useRef } from "react";
import { NAZEV_ROLE, POPIS_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, DiploZapas, RoleHrace } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import zvonUrl from "../assets/zvon.mp3";
import { prehraj } from "../zvuk.js";
import { jmenoVZapasu, mujUcastnik } from "../zapas.js";
import { MapaScenare } from "./MapaScenare.js";
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

/** Verze scénáře, kterou zápas hraje (otisknutá při založení); bez otisku aktivní. */
export function verzeZapasu(data: DiploData, d: DiploZapas | undefined) {
  return d?.scenarId != null ? (data.verze[d.scenarId] ?? null) : data.aktivni;
}

/**
 * Rub zakryté karty pro `Zakryti` — tady i v pultu GM. Bez `alt`: je to
 * jen obrázek „karta leží rubem nahoru“, co pod ní je, říká tlačítko nad ní.
 */
export function RubKarty() {
  return <img className="rub-karty" src={RUB_KARTY} alt="" width={600} height={362} />;
}

/** Tajná karta role hráče (spec §8.2). Data jsou už zredigovaná serverem. */
export function KartaRole({ zapas, data, ja }: Props) {
  const d = diploZapasu(data, zapas.id);
  // Sdílené s pultem GM: víc AI se jmenuje stejně, rozliší je barva.
  const jmeno = (hracId: string) => jmenoVZapasu(zapas.ucastnici, hracId);
  // Zvon jen při přechodu do „rozesláno“, ne při načtení stránky s už
  // rozeslanými rolemi — stejně jako ostatní zvonění v App.tsx.
  const driv = useRef<string | undefined>(undefined);
  useEffect(() => {
    const predtim = driv.current;
    driv.current = d?.stav;
    if (predtim !== undefined && predtim !== "rozeslano" && d?.stav === "rozeslano") prehraj(zvonUrl);
  }, [d?.stav]);

  if (!d) return null;
  const verze = verzeZapasu(data, d);
  const moje = d.role.find((r) => r.hracId === ja);
  const barva = mujUcastnik(zapas, ja)?.barva;

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
            Nástupcem císaře je <strong>{d.nastupceHracId ? jmeno(d.nastupceHracId) : "?"}</strong>.
          </p>
          <Zakryti popisek="Tvá tajná role — klikni pro odkrytí" rub={<RubKarty />}>
            <ObsahRole moje={moje} vse={d.role} jmeno={jmeno} />
            {verze && barva !== undefined ? <MapaScenare verze={verze} starty={barva} /> : null}
          </Zakryti>
        </>
      )}
      <PravidlaHry verze={verze} />
    </section>
  );
}

function ObsahRole({ moje, vse, jmeno }: { moje: RoleHrace; vse: RoleHrace[]; jmeno: (id: string) => string }) {
  const popis = POPIS_ROLE[moje.role];
  // Všichni ostatní Nájezdníci, ne jen první: GM smí rozeslat i tři (spec
  // §6.2) a redakce je Nájezdníkovi posílá všechny.
  const ostatni = moje.role === "najezdnik" ? vse.filter((r) => r.role === "najezdnik" && r.hracId !== moje.hracId) : [];
  return (
    <div className={`role role-${moje.role}`}>
      {moje.upravenoPoRozeslani ? <p className="upozorneni varovani">GM upravil tvou roli.</p> : null}
      {/* Znak mimo h4: uvnitř by alt zdvojil přístupný název nadpisu. */}
      <img className="znak-role" src={ZNAK_ROLE[moje.role]} alt={NAZEV_ROLE[moje.role]} width={104} height={104} />
      <h4>{NAZEV_ROLE[moje.role]}</h4>
      <p className="cil">{popis.cil}</p>
      {moje.role === "kat" && moje.cilHracId ? (
        <p>
          <span>Tvá oběť:</span> <strong>{jmeno(moje.cilHracId)}</strong>
        </p>
      ) : null}
      {moje.role === "zoldak" && moje.cilHracId ? (
        <p>
          <span>Pokrevní pouto:</span> <strong>{jmeno(moje.cilHracId)}</strong>
        </p>
      ) : null}
      {ostatni.length > 0 ? (
        <p>
          <span>{ostatni.length === 1 ? "Druhý Nájezdník:" : "Další Nájezdníci:"}</span> <strong>{ostatni.map((r) => jmeno(r.hracId)).join(", ")}</strong>
        </p>
      ) : null}
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
