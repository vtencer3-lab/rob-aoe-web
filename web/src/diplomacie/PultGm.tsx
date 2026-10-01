import { useState } from "react";
import { odchylkySlozeni, povoleneCile, textPrehledu } from "../../../src/shared/diplomacie/los.js";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import type { DiploData, Role } from "../../../src/shared/diplomacie/typy.js";
import { BARVA_NAZEV, type Barva, type ZapasView } from "../../../src/shared/types.js";
import type { Hlidej } from "../rezimy/index.js";
import { Kopirovatelne } from "../views/Kopirovatelne.js";
import { jmenoHrace } from "../zapas.js";
import { diploApi } from "./api.js";
import { diploZapasu, verzeZapasu } from "./KartaRole.js";
import { MapaScenare } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";

const VOLITELNE_ROLE: Role[] = ["garda", "najezdnik", "sasek", "zoldak", "kat"];
const POPIS_STAVU = { priprava: "Příprava", losovano: "Losováno", rozeslano: "Rozesláno" } as const;

/** Pult GM (spec §8.1). Nic si nedrží lokálně — všechno je ve stavu ze serveru. */
export function PultGm({ zapas, data, hlidej }: { zapas: ZapasView; data: DiploData; hlidej: Hlidej }) {
  const [pracuje, setPracuje] = useState(false);
  const d = diploZapasu(data, zapas.id);
  if (!d) return null;
  const verze = verzeZapasu(data, d);
  const hraci = zapas.ucastnici.filter((u) => u.hracId !== d.gmHracId).sort((a, b) => a.barva - b.barva);
  const jmeno = (id: string) => {
    const u = zapas.ucastnici.find((x) => x.hracId === id);
    return u ? jmenoHrace(u) : id;
  };
  // Chybu ukáže hlidej z App; tlačítka jsou mezitím zamčená, ať GM neklikne dvakrát.
  const akce = (fn: () => Promise<unknown>) => {
    setPracuje(true);
    void hlidej(fn).finally(() => setPracuje(false));
  };
  const potvrzeni = d.stav === "rozeslano";
  const zmen = (hracId: string, zmena: { role?: Role; cilHracId?: string }) => {
    if (potvrzeni && !window.confirm(`${jmeno(hracId)} už svou roli vidí. Opravdu ji změnit?`)) return;
    akce(() => diploApi.role(zapas.id, hracId, potvrzeni ? { ...zmena, potvrzeno: true } : zmena));
  };
  const odchylky = d.role.length > 0 ? odchylkySlozeni(d.role) : [];
  const jmena = Object.fromEntries(zapas.ucastnici.map((u) => [u.barva, jmenoHrace(u)])) as Partial<Record<Barva, string>>;

  return (
    <section className="sekce-krok pult-gm" data-testid="pult-gm">
      <header className="zahlavi-sekce">
        <h3>Pult GM</h3>
        <span className="stav-diplo">{POPIS_STAVU[d.stav]}</span>
      </header>
      <Zakryti popisek="Pult GM — klikni pro odkrytí">
        {verze ? <MapaScenare verze={verze} starty="vsechny" jmena={jmena} velikost="velka" /> : null}

        {d.stav === "priprava" ? (
          <>
            <p>Komu hra nedala sekundární cíl? Hláška ve hře „pN ma: …“ — číslo hráče je jeho barva.</p>
            <div className="dlazdice-nastupce">
              {hraci.map((u) => (
                <button
                  key={u.hracId}
                  type="button"
                  data-testid="dlazdice"
                  className={`dlazdice barva-${u.barva}${d.nastupceHracId === u.hracId ? " vybrana" : ""}`}
                  disabled={pracuje}
                  onClick={() => akce(() => diploApi.nastupce(zapas.id, u.hracId))}
                >
                  <span className="cislo">p{u.barva}</span> <span className="barva">{BARVA_NAZEV[u.barva]}</span> <strong>{jmenoHrace(u)}</strong>
                </button>
              ))}
            </div>
            <button type="button" className="cta" disabled={pracuje || d.nastupceHracId === null} onClick={() => akce(() => diploApi.los(zapas.id))}>
              Rozdat role
            </button>
          </>
        ) : (
          <>
            <table className="tabulka-roli">
              <tbody>
                {d.role.map((r) => (
                  <tr key={r.hracId}>
                    <th>{jmeno(r.hracId)}</th>
                    <td>
                      {r.role === "nastupce" ? (
                        <strong>{NAZEV_ROLE.nastupce}</strong>
                      ) : (
                        <select aria-label={`Role: ${jmeno(r.hracId)}`} value={r.role} disabled={pracuje} onChange={(e) => zmen(r.hracId, { role: e.target.value as Role })}>
                          {VOLITELNE_ROLE.map((v) => (
                            <option key={v} value={v}>
                              {NAZEV_ROLE[v]}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      {r.role === "kat" || r.role === "zoldak" ? (
                        <select aria-label={`Cíl: ${jmeno(r.hracId)}`} value={r.cilHracId ?? ""} disabled={pracuje} onChange={(e) => zmen(r.hracId, { cilHracId: e.target.value })}>
                          {povoleneCile(
                            d.role.map((x) => x.hracId),
                            r.hracId,
                            d.nastupceHracId!,
                          ).map((c) => (
                            <option key={c} value={c}>
                              {jmeno(c)}
                            </option>
                          ))}
                        </select>
                      ) : r.role === "najezdnik" ? (
                        <span>
                          zná:{" "}
                          {d.role
                            .filter((x) => x.role === "najezdnik" && x.hracId !== r.hracId)
                            .map((x) => jmeno(x.hracId))
                            .join(", ")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={odchylky.length > 0 ? "souhrn varovani" : "souhrn"}>{odchylky.length > 0 ? odchylky.join(", ") : "Složení odpovídá pravidlům."}</p>
            <div className="ovladani">
              {d.stav === "losovano" ? (
                <>
                  <button type="button" disabled={pracuje} onClick={() => akce(() => diploApi.los(zapas.id))}>
                    Přelosovat
                  </button>
                  <button type="button" className="cta" disabled={pracuje} onClick={() => akce(() => diploApi.rozeslat(zapas.id))}>
                    Rozeslat role
                  </button>
                </>
              ) : null}
              <button
                type="button"
                disabled={pracuje}
                onClick={() => {
                  if (potvrzeni && !window.confirm("Role už hráči vidí. Opravdu je smazat a vybírat Nástupce znovu?")) return;
                  akce(() => diploApi.zpet(zapas.id, potvrzeni));
                }}
              >
                Zpět na výběr Nástupce
              </button>
              <Kopirovatelne hodnota={textPrehledu(d.role, jmeno)} popis="přehled rolí" jenIkona />
            </div>
          </>
        )}
        <PravidlaHry verze={verze} />
      </Zakryti>
    </section>
  );
}
