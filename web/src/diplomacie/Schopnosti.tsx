import { useEffect, useRef, useState } from "react";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import { DOPLATEK_ZLATA, MAX_INFORMACI, ODMENA_KATA, zbyva, type Schopnost } from "../../../src/shared/diplomacie/schopnosti.js";
import type { DiploZapas, RoleHrace } from "../../../src/shared/diplomacie/typy.js";
import type { ZapasView } from "../../../src/shared/types.js";
import chatUrl from "../assets/chat.mp3";
import type { Hlidej } from "../rezimy/index.js";
import { hlasitostChatu, prehraj } from "../zvuk.js";
import { JmenoUcastnika } from "../views/JmenoSBarvou.js";
import { Rozbalovaci } from "../views/Rozbalovaci.js";
import { diploApi } from "./api.js";

/**
 * Schopnosti rolí (uživatel 3. 10. 2026): hráč žádá z karty, GM v pultu
 * potvrdí nebo zamítne; připomínky ze hry (Katovi zlato, Gardě role
 * padlého) GM jen odklikne. Pravidla sdílí server (schopnosti.ts).
 */

/** Poslední žádost hráče daného druhu (nejnovější podle id). */
const posledni = (schopnosti: readonly Schopnost[], druh: Schopnost["druh"]) => schopnosti.filter((s) => s.druh === druh).at(-1);

const STAV_ZADOSTI: Record<Schopnost["stav"], string> = { ceka: "čeká na GM", potvrzeno: "GM potvrdil", zamitnuto: "GM zamítl" };

/** Část karty hráče pod cíli: tlačítka schopností jeho role. Nic, když role žádnou nemá. */
export function MojeSchopnosti({ zapas, d, moje, hlidej }: { zapas: ZapasView; d: DiploZapas; moje: RoleHrace; hlidej: Hlidej }) {
  const [cil, setCil] = useState<string | null>(null);
  const [pracuje, setPracuje] = useState(false);
  const mojeZadosti = (d.schopnosti ?? []).filter((s) => s.hracId === moje.hracId);

  const akce = (fn: () => Promise<unknown>) => {
    setPracuje(true);
    void hlidej(fn).finally(() => setPracuje(false));
  };
  const hrac = (id: string) => <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={id} />;

  if (moje.role === "najezdnik") {
    const s = posledni(mojeZadosti, "sabotaz");
    const pouzita = s !== undefined && s.stav !== "zamitnuto";
    const moznosti = zapas.ucastnici.filter((u) => u.hracId !== moje.hracId && u.hracId !== d.gmHracId).map((u) => u.hracId);
    return (
      <div className="moje-schopnosti" data-testid="schopnosti">
        <h5>Sabotáž</h5>
        {pouzita ? (
          <p data-testid="stav-schopnosti">
            Na {hrac(s.cilHracId!)} — {STAV_ZADOSTI[s.stav]}.
          </p>
        ) : (
          <>
            {s?.stav === "zamitnuto" ? <p className="ceka">Poslední žádost GM zamítl, můžeš to zkusit znovu.</p> : null}
            <div className="schopnost-ovladani">
              <Rozbalovaci<string | null> trida="vyber-hrace" popisek="Cíl Sabotáže" polozky={[null, ...moznosti]} hodnota={cil} vypnuto={pracuje} onZmena={setCil} klic={(c) => c ?? "zadny"} obsah={(c) => <span>{c === null ? "Vyber hráče" : hrac(c)}</span>} />
              <button type="button" className="primarni" disabled={pracuje || cil === null} onClick={() => akce(() => diploApi.schopnost(zapas.id, "sabotaz", cil))}>
                Provést Sabotáž
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
  if (moje.role === "sasek") {
    const zbyvaInfo = zbyva(mojeZadosti, moje.hracId, "informace") ?? 0;
    const ceka = mojeZadosti.some((s) => s.druh === "informace" && s.stav === "ceka");
    return (
      <div className="moje-schopnosti" data-testid="schopnosti">
        <h5>Tajná informace od GM</h5>
        <p data-testid="stav-schopnosti">
          Zbývá <strong>{zbyvaInfo}/{MAX_INFORMACI}</strong>
          {ceka ? " · žádost čeká na GM" : ""}
        </p>
        <button type="button" className="primarni" disabled={pracuje || ceka || zbyvaInfo === 0} onClick={() => akce(() => diploApi.schopnost(zapas.id, "informace"))}>
          Vyžádat informaci
        </button>
      </div>
    );
  }
  if (moje.role === "zoldak") {
    const ceka = mojeZadosti.some((s) => s.druh === "doplatek" && s.stav === "ceka");
    const vyplaceno = mojeZadosti.filter((s) => s.druh === "doplatek" && s.stav === "potvrzeno").length;
    return (
      <div className="moje-schopnosti" data-testid="schopnosti">
        <h5>Doplatek za relikvii</h5>
        <p data-testid="stav-schopnosti">
          Za každou prodanou relikvii doplatí GM {DOPLATEK_ZLATA} zlata. Vyplaceno: <strong>{vyplaceno}×</strong>
          {ceka ? " · doplatek čeká na GM" : ""}
        </p>
        {/* S daty ze hry web prodej pozná sám a GM dostane připomínku;
            tlačítko jen bez mostu. */}
        {d.mojeHra ? null : (
          <button type="button" className="primarni" disabled={pracuje || ceka} onClick={() => akce(() => diploApi.schopnost(zapas.id, "doplatek"))}>
            Prodal jsem relikvii
          </button>
        )}
      </div>
    );
  }
  return null;
}

/**
 * Povinný prodej relikvií na kartě (uživatel 3. 10. 2026): Šašek po smrti
 * Nástupce všechny, Nástupce po smrti Šaška jednu — jen bez vlastního
 * odpočtu (rozhoduje server). Zmizí, až hra ukáže splnění. Nový cinkne.
 */
export function PovinnyProdej({ d, hracId }: { d: DiploZapas; hracId: string }) {
  const ukol = (d.schopnosti ?? []).find((s) => s.hracId === hracId && s.stav === "ceka" && (s.druh === "sasek_prodej" || s.druh === "nastupce_prodej"));
  const druh = ukol?.druh ?? null;
  const driv = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (driv.current === null && druh !== null) prehraj(chatUrl, hlasitostChatu());
    driv.current = druh;
  }, [druh]);
  if (!ukol) return null;
  return (
    <p className="varovani prodej-relikvii" data-testid="prodej-relikvii">
      {ukol.druh === "sasek_prodej" ? "Nástupce padl — musíš prodat všechny své relikvie." : "Šašek padl — musíš prodat 1 relikvii."} Prodává se odevzdáním mnicha s relikvií uprostřed mapy.
    </p>
  );
}

/** Co se GM ukáže za žádost nebo připomínku. */
function TextOznameni({ s, zapas, d }: { s: Schopnost; zapas: ZapasView; d: DiploZapas }) {
  const hrac = (id: string) => <JmenoUcastnika ucastnici={zapas.ucastnici} hracId={id} />;
  switch (s.druh) {
    case "sabotaz":
      return (
        <>
          {hrac(s.hracId)} provádí <strong>Sabotáž</strong> na {hrac(s.cilHracId!)}
        </>
      );
    case "informace":
      return (
        <>
          {hrac(s.hracId)} žádá <strong>tajnou informaci</strong>
        </>
      );
    case "doplatek":
      return (
        <>
          {hrac(s.hracId)} prodal relikvii — doplať <strong>{DOPLATEK_ZLATA} zlata</strong>
        </>
      );
    case "kat_odmena":
      return (
        <>
          {hrac(s.cilHracId!)} padl — dej Katovi {hrac(s.hracId)} <strong>{ODMENA_KATA} zlata</strong>
        </>
      );
    case "nastupce_prodej":
      return (
        <>
          Šašek {hrac(s.cilHracId!)} padl — Nástupce {hrac(s.hracId)} musí <strong>prodat 1 relikvii</strong>
        </>
      );
    case "sasek_prodej":
      return (
        <>
          Nástupce {hrac(s.cilHracId!)} padl — Šašek {hrac(s.hracId)} musí <strong>prodat všechny relikvie</strong>
        </>
      );
    case "garda_role": {
      const role = d.role.find((r) => r.hracId === s.cilHracId)?.role;
      return (
        <>
          {hrac(s.cilHracId!)} padl — řekni Gardě {hrac(s.hracId)} jeho roli: <strong>{role ? NAZEV_ROLE[role] : "?"}</strong>
        </>
      );
    }
  }
}

/**
 * Čekající žádosti a připomínky nad tabulkou pultu GM. Nová cinkne (zvuk
 * chatu), ať si jí GM všimne i uprostřed hry.
 */
export function OznameniGm({ zapas, d, akce, pracuje }: { zapas: ZapasView; d: DiploZapas; akce: (fn: () => Promise<unknown>) => void; pracuje: boolean }) {
  const cekajici = (d.schopnosti ?? []).filter((s) => s.stav === "ceka");
  const zname = useRef<Set<number> | null>(null);
  const klic = cekajici.map((s) => s.id).join(",");
  useEffect(() => {
    const ted = new Set(cekajici.map((s) => s.id));
    const driv = zname.current;
    zname.current = ted;
    if (driv !== null && [...ted].some((id) => !driv.has(id))) prehraj(chatUrl, hlasitostChatu());
  }, [klic]);
  if (cekajici.length === 0) return null;
  return (
    <ul className="oznameni-gm" data-testid="oznameni-gm">
      {cekajici.map((s) => {
        const zadost = s.druh === "sabotaz" || s.druh === "informace" || s.druh === "doplatek";
        return (
          <li key={s.id} className={`oznameni oznameni-${s.druh}`}>
            <span className="oznameni-text">
              <TextOznameni s={s} zapas={zapas} d={d} />
            </span>
            <span className="oznameni-tlacitka">
              <button type="button" className="primarni" disabled={pracuje} onClick={() => akce(() => diploApi.vyridit(zapas.id, s.id, "potvrzeno"))}>
                {zadost ? "Potvrdit" : "Vyřízeno"}
              </button>
              {zadost ? (
                <button type="button" disabled={pracuje} onClick={() => akce(() => diploApi.vyridit(zapas.id, s.id, "zamitnuto"))}>
                  Zamítnout
                </button>
              ) : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Drobný stav schopnosti v řádku tabulky GM: Sabotáž nepoužita/použita, informace 1/3, doplatky. */
export function StavSchopnostiGm({ d, r }: { d: DiploZapas; r: RoleHrace }) {
  const moje = (d.schopnosti ?? []).filter((s) => s.hracId === r.hracId);
  if (r.role === "najezdnik") {
    const pouzita = moje.some((s) => s.druh === "sabotaz" && s.stav === "potvrzeno");
    return (
      <span className={pouzita ? "schopnost-gm pouzita" : "schopnost-gm"} data-testid="schopnost-gm">
        Sabotáž {pouzita ? "použita" : "nepoužita"}
      </span>
    );
  }
  if (r.role === "sasek") {
    const pouzito = moje.filter((s) => s.druh === "informace" && s.stav === "potvrzeno").length;
    return (
      <span className="schopnost-gm" data-testid="schopnost-gm">
        informace {pouzito}/{MAX_INFORMACI}
      </span>
    );
  }
  if (r.role === "zoldak") {
    const pocet = moje.filter((s) => s.druh === "doplatek" && s.stav === "potvrzeno").length;
    return pocet > 0 ? (
      <span className="schopnost-gm" data-testid="schopnost-gm">
        doplatky {pocet}×
      </span>
    ) : null;
  }
  return null;
}
