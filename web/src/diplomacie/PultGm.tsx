import { useState } from "react";
import { odchylkySlozeni, povoleneCile } from "../../../src/shared/diplomacie/los.js";
import { NAZEV_ROLE } from "../../../src/shared/diplomacie/role.js";
import { ROLE_VOLITELNE, type DiploData, type Role } from "../../../src/shared/diplomacie/typy.js";
import { BARVA_NAZEV, type Barva, type ZapasView } from "../../../src/shared/types.js";
import type { Hlidej } from "../rezimy/index.js";
import { JmenoUcastnika, VycetUcastniku, ZnakBarvy } from "../views/JmenoSBarvou.js";
import { Potvrzeni } from "../views/Potvrzeni.js";
import { jmenoHrace, jmenoVZapasu, mujUcastnik } from "../zapas.js";
import { diploApi } from "./api.js";
import { NastupceZeHry, RadekHry, StariHry } from "./HraZive.js";
import { diploZapasu, RubKarty, verzeZapasu } from "./KartaRole.js";
import { MapaScenare, popiskyStartu } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";
import { Zakryti } from "./Zakryti.js";
import { ZNAK_ROLE } from "./znaky.js";

const POPIS_STAVU = { priprava: "Příprava", losovano: "Losováno", rozeslano: "Rozesláno" } as const;

/** Pult GM (spec §8.1). Nic si nedrží lokálně — všechno je ve stavu ze serveru. */
export function PultGm({ zapas, data, hlidej }: { zapas: ZapasView; data: DiploData; hlidej: Hlidej }) {
  const [pracuje, setPracuje] = useState(false);
  const [ptaSeNaZpet, setPtaSeNaZpet] = useState(false);
  const d = diploZapasu(data, zapas.id);
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
  const jmena = Object.fromEntries(zapas.ucastnici.map((u) => [u.barva, jmenoHrace(u)])) as Partial<Record<Barva, string>>;
  // Server Nástupce po změně sestavy nuluje, ale stav se sestavou může přes
  // SSE dorazit o chvíli dřív než ten s vynulovaným Nástupcem: za zvoleného
  // platí jen ten, kdo je pořád mezi hráči — jinak by svítilo „Rozdat role“
  // bez označené dlaždice.
  const nastupce = hraci.some((u) => u.hracId === d.nastupceHracId) ? d.nastupceHracId : null;
  // Velká mapa: u každého startu jméno hráče; jakmile je Nástupce zvolený,
  // nese korunu stejně jako na kartách hráčů.
  const popisky = verze ? popiskyStartu(verze, jmena) : {};
  const barvaNastupce = nastupce === null ? undefined : mujUcastnik(zapas, nastupce)?.barva;
  if (barvaNastupce !== undefined && popisky[barvaNastupce]) popisky[barvaNastupce] = { ...popisky[barvaNastupce], druhy: ["nastupce"] };

  return (
    <section className="sekce-krok pult-gm" data-testid="pult-gm">
      <header className="zahlavi-sekce">
        {/* Žezlo s okem: GM roli nemá, znak ano — patří k pultu, ne do tabulky rolí. */}
        <img className="znak-role" src={ZNAK_ROLE.gm} alt="GM" width={26} height={26} />
        <h3>Pult GM</h3>
        <span className="stav-diplo" key={d.stav}>{POPIS_STAVU[d.stav]}</span>
      </header>
      <Zakryti popisek="Pult GM — klikni pro odkrytí" rub={<RubKarty />}>
        {/* Na širokém displeji mapa vlevo a pult vpravo (uživatel 3. 10. 2026),
            ať GM vidí mapu i role bez posouvání; na úzkém pod sebou. */}
        <div className="pult-vedle">
          {verze ? <MapaScenare verze={verze} popisky={popisky} velikost="velka" /> : null}
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
                <table className="tabulka-roli">
                  <tbody>
                    {d.role.flatMap((r) => {
                      const barvaCile = r.cilHracId ? mujUcastnik(zapas, r.cilHracId)?.barva : undefined;
                      // Pod řádkem hráče ještě řádek s daty ze hry (bez nich nic nekreslí).
                      return [
                        <tr key={r.hracId}>
                          {/* Čtvereček barvy jako na dlaždicích: řádky jdou v pořadí slotů, dlaždice podle barvy. */}
                          <th scope="row">{hrac(r.hracId)}</th>
                          {/* Znak ve vlastní buňce, ne v th: v hlavičce řádku by alt
                              přepsal přístupné jméno hráče, vedle roletky by ji zalomil. */}
                          <td className="znak">
                            <img key={r.role} className="znak-role" src={ZNAK_ROLE[r.role]} alt={NAZEV_ROLE[r.role]} width={36} height={36} />
                          </td>
                          <td>
                            {r.role === "nastupce" || rozeslano ? (
                              <strong>{NAZEV_ROLE[r.role]}</strong>
                            ) : (
                              <select aria-label={`Role: ${jmeno(r.hracId)}`} value={r.role} disabled={pracuje} onChange={(e) => zmen(r.hracId, { role: e.target.value as Role })}>
                                {ROLE_VOLITELNE.map((v) => (
                                  <option key={v} value={v}>
                                    {NAZEV_ROLE[v]}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td>
                            {rozeslano && (r.role === "kat" || r.role === "zoldak") ? (
                              // Po rozeslání se nic nemění — ani cíl, který chybí.
                              <span>
                                {r.role === "kat" ? "oběť: " : "pokrevní pouto: "}
                                {r.cilHracId ? hrac(r.cilHracId) : "—"}
                              </span>
                            ) : r.role === "kat" || r.role === "zoldak" ? (
                              <div className="cil-s-barvou">
                                {barvaCile === undefined ? null : <ZnakBarvy barva={barvaCile} />}
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
                              </div>
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
                <p className={odchylky.length > 0 ? "souhrn varovani" : "souhrn"}>{odchylky.length > 0 ? odchylky.join(", ") : "Složení odpovídá pravidlům."}</p>
                {/* Dvě řady (uživatel 3. 10. 2026): nahoře uprostřed Přelosovat,
                    pod ním vlevo Zpět na výběr Nástupce, vpravo Rozeslat role. */}
                {d.stav === "losovano" ? (
                  <div className="ovladani">
                    <button type="button" disabled={pracuje} onClick={() => akce(() => diploApi.los(zapas.id))}>
                      Přelosovat
                    </button>
                  </div>
                ) : null}
                <div className="ovladani">
                  <button type="button" disabled={pracuje} onClick={zpet}>
                    Zpět na výběr Nástupce
                  </button>
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
