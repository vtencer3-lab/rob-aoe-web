import { useEffect, useState } from "react";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { Hlidej } from "../rezimy/index.js";
import { Potvrzeni } from "../views/Potvrzeni.js";
import { Skladaci } from "../views/Skladaci.js";
import { diploApi } from "./api.js";
import { MapaScenare, popiskyStartu } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";

/** Verze má přibalenou dnešní sondu — kopii pro hru jde stáhnout. */
const maSondu = (v: ScenarVerze) => v.sonda !== null && v.sonda.chyba === null && !v.sonda.zastarala;

/** Stažení souboru tlačítkem (stažení až po potvrzení, nebo z tlačítka, které jde zamknout). */
function stahni(url: string, jmeno: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = jmeno;
  a.click();
}

const NAPOVEDA_AUTOMATIZACE = "Do scénáře se přibalí skripty na sledování statistik ze hry.";
const VAROVANI_ORIGINALU = "Tahle verze nebude automaticky posílat průběh hry na stránku. Opravdu stáhnout?";

/**
 * Odkud může verze bez vlastní minimapy převzít obrázek ze hry: poslední
 * dřívější verze, která ho má (tak to dělá i nahrání), jinak nejnovější
 * pozdější. Jestli jde o tutéž mapu, posoudí server.
 */
function zdrojMinimapy(verze: ScenarVerze[], v: ScenarVerze): ScenarVerze | null {
  if (v.minimapaVlastni || !v.rozbor) return null;
  const s = verze.filter((z) => z.minimapaVlastni && z.rozbor && z.id !== v.id).sort((a, b) => b.id - a.id);
  return s.find((z) => z.id < v.id) ?? s[0] ?? null;
}

/** Krátká věta k nahrání: převzala nová verze vlastní minimapu? */
function vetaMinimapy(m: { zdrojId: number; prevzata: boolean } | null): string {
  if (!m) return "";
  return m.prevzata ? ` Vlastní minimapa převzata z verze ${m.zdrojId}.` : " Vlastní minimapa nepřevzata — mapa se změnila.";
}

/**
 * Nahrávání verzí scénáře pro adminy a autory (spec §5.3). Rozbalovací, ať
 * nepřekáží v panelu akce — Jin nahrává, když se mu to hodí, i bez běžící
 * akce; seznam se načítá až po rozbalení. Sbalená je stejně jako ostatní
 * sekce webu (Skladaci), ne holým `<details>`.
 */
export function SpravaScenare({ hlidej }: { hlidej: Hlidej }) {
  const [otevreno, setOtevreno] = useState(false);
  const [verze, setVerze] = useState<ScenarVerze[]>([]);
  const [soubor, setSoubor] = useState<File | null>(null);
  const [vysledek, setVysledek] = useState<string | null>(null);
  // Proč server smazání odmítl — přímo pod řádkem verze. Obecná chyba
  // z `hlidej` sedí v App až nahoře nad panelem akce, správa scénáře je
  // dole pod ním: uživatel ji neviděl a měl za to, že mazání nefunguje
  // (2. 10. 2026). Drží se do další akce ve správě.
  const [chybaSmazani, setChybaSmazani] = useState<{ id: number; text: string } | null>(null);
  // Nahrání trvá i vteřiny (rozbor na serveru) — druhé kliknutí by poslalo
  // soubor podruhé a vznikly by dvě verze stejného jména.
  const [nahrava, setNahrava] = useState(false);
  const nacti = () => hlidej(async () => setVerze((await diploApi.verze()).verze));
  // Jen při rozbalení: `hlidej` z App má novou identitu při každém
  // překreslení, v závislostech by seznam načítal pořád dokola.
  useEffect(() => {
    if (otevreno) void nacti();
  }, [otevreno]);
  const aktivni = verze.find((v) => v.aktivni) ?? null;
  // Co čeká na potvrzení v okně: stažení originálu, nebo smazání verze.
  const [potvrdit, setPotvrdit] = useState<{ co: "original" | "smazat"; verze: ScenarVerze } | null>(null);

  const nahrat = (formular: HTMLFormElement) => {
    if (!soubor) return;
    setChybaSmazani(null);
    setNahrava(true);
    void hlidej(async () => {
      const r = await diploApi.nahrat(soubor);
      const nahrano = r.chybaRozboru
        ? `Soubor je uložený, ale nepodařilo se ho přečíst: ${r.chybaRozboru} — pravidla a mapa zůstávají z aktivní verze.`
        : r.aktivni
          ? "Nahráno a nastaveno jako aktivní."
          : "Nahráno. Aktivní zůstává dosavadní verze.";
      // Bez sondy se scénář hraje normálně, jen web nedostane data ze hry.
      const sMinimapou = nahrano + vetaMinimapy(r.vlastniMinimapa);
      setVysledek(r.chybaSondy ? `${sMinimapou} Sondu se nepodařilo přibalit: ${r.chybaSondy}` : sMinimapou);
      setSoubor(null);
      // Pole souboru si vybraný soubor drží samo; po nahrání má být prázdné
      // jako zbytek formuláře, jinak by vypadalo, že jde nahrát znovu.
      formular.reset();
      setVerze((await diploApi.verze()).verze);
    }).finally(() => setNahrava(false));
  };
  const aktivovat = (id: number) => {
    setChybaSmazani(null);
    void hlidej(async () => {
      await diploApi.aktivovat(id);
      setVerze((await diploApi.verze()).verze);
    });
  };
  const prevzitMinimapu = (id: number, zdrojId: number) => {
    setChybaSmazani(null);
    void hlidej(async () => {
      await diploApi.prevzitMinimapu(id, zdrojId);
      setVerze((await diploApi.verze()).verze);
    });
  };
  const zeptejSe = (co: "original" | "smazat", v: ScenarVerze) => {
    setChybaSmazani(null);
    setPotvrdit({ co, verze: v });
  };
  const potvrzeno = () => {
    if (!potvrdit) return;
    const { co, verze: v } = potvrdit;
    setPotvrdit(null);
    if (co === "original") stahni(diploApi.souborUrl(v.id, true), v.jmenoSouboru);
    else
      void hlidej(async () => {
        // Odmítnutí (409 s českou větou) patří k řádku, ne do obecné chyby
        // nahoře; síť a ostatní selhání dál hlásí hlidej.
        try {
          await diploApi.smazat(v.id);
        } catch (err) {
          setChybaSmazani({ id: v.id, text: err instanceof Error ? err.message : "Smazat se nepovedlo." });
          return;
        }
        setVerze((await diploApi.verze()).verze);
      });
  };
  // Přibalení trvá vteřiny (Python na serveru) — tlačítko je mezitím zamčené.
  const [pribaluje, setPribaluje] = useState<number | null>(null);
  const pribalSondu = (id: number) => {
    setChybaSmazani(null);
    setPribaluje(id);
    void hlidej(async () => {
      await diploApi.pribalSondu(id);
      setVerze((await diploApi.verze()).verze);
    }).finally(() => setPribaluje(null));
  };

  return (
    <Skladaci className="sprava-scenare" testId="sprava-scenare" hlava="Scénář Diplomacie" otevreno={otevreno} onPrepnout={setOtevreno}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          nahrat(e.currentTarget);
        }}
      >
        <label>
          Soubor scénáře <input type="file" accept=".aoe2scenario" onChange={(e) => setSoubor(e.target.files?.[0] ?? null)} />
        </label>
        <button type="submit" className="tlacitko" disabled={!soubor || nahrava}>
          Nahrát
        </button>
        {vysledek ? <p className="vysledek">{vysledek}</p> : null}
      </form>
      {aktivni?.rozbor ? (
        <div className="nahled-scenare">
          <MapaScenare verze={aktivni} popisky={popiskyStartu(aktivni)} />
          {/* Tatáž pravidla, jaká uvidí hráči na kartě (cíle, suroviny,
              limity, vítězství) — autor hned vidí, co web ze souboru přečetl. */}
          <div className="cile">
            <PravidlaHry verze={aktivni} />
            {aktivni.rozbor.varovani.map((v) => (
              <p key={v} className="varovani">
                {v}
              </p>
            ))}
          </div>
        </div>
      ) : null}
      <ul className="verze-scenare">
        {/* Nejnovější nahoře i nezávisle na pořadí ze serveru. */}
        {[...verze]
          .sort((a, b) => b.id - a.id)
          .map((v) => {
            const zdroj = zdrojMinimapy(verze, v);
            const sonda = maSondu(v);
            return (
              <li key={v.id} className={v.aktivni ? "aktivni" : ""} data-testid="verze-scenare">
                <div className="popis">
                  {/* Originál pod jménem od autora; hostovi a do lobby jde pod jménem pro hru. */}
                  <span className="jmeno-verze">{v.jmenoSouboru}</span> <small className="jmeno-hry">({v.jmenoHry.replace(/\.aoe2scenario$/, "")})</small> · {v.nahralJmeno} ·{" "}
                  {new Date(v.nahrano).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  {v.aktivni ? <strong> · aktivní</strong> : null}
                  {!v.aktivni && v.rozbor ? (
                    <button type="button" onClick={() => aktivovat(v.id)}>
                      Nastavit jako aktivní
                    </button>
                  ) : null}
                  {v.chybaRozboru ? <span className="varovani"> · nepodařilo se přečíst: {v.chybaRozboru}</span> : null}
                  {/* Proč automatizace chybí, nebo co hlásilo přibalení — stav sám říkají tlačítka. */}
                  {v.sonda?.chyba ? <span className="varovani"> · {v.sonda.chyba}</span> : null}
                  {v.sonda?.varovani.map((t) => (
                    <span key={t} className="varovani">
                      {" "}
                      · {t}
                    </span>
                  ))}
                </div>
                <div className="ovladani">
                  <button type="button" onClick={() => zeptejSe("original", v)}>
                    Stáhnout originál
                  </button>
                  {/* Hlavní akce, dokud verze nemá dnešní sondu (chybí, nebo je zastaralá). */}
                  <button
                    type="button"
                    className={sonda ? "napoveda" : "cta napoveda"}
                    data-napoveda={NAPOVEDA_AUTOMATIZACE}
                    disabled={pribaluje !== null}
                    onClick={() => pribalSondu(v.id)}
                  >
                    Přibalit automatizace
                  </button>
                  <button
                    type="button"
                    className="cta"
                    disabled={!sonda}
                    onClick={() => {
                      setChybaSmazani(null);
                      stahni(diploApi.souborUrl(v.id), v.jmenoHry);
                    }}
                  >
                    Stáhnout scénář
                  </button>
                  {zdroj ? (
                    <button type="button" onClick={() => prevzitMinimapu(v.id, zdroj.id)}>
                      Převzít vlastní minimapu z verze {zdroj.id}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => zeptejSe("smazat", v)}>
                    Smazat
                  </button>
                </div>
                {chybaSmazani?.id === v.id ? (
                  <p className="chyba-smazani" role="alert" data-testid="chyba-smazani">
                    {chybaSmazani.text}
                  </p>
                ) : null}
              </li>
            );
          })}
      </ul>
      {potvrdit ? (
        <Potvrzeni
          text={potvrdit.co === "original" ? VAROVANI_ORIGINALU : `Smazat verzi ${potvrdit.verze.jmenoSouboru}? Nejde vrátit.`}
          potvrdit={potvrdit.co === "original" ? "Stáhnout" : "Smazat"}
          zrusit="Zpět"
          onPotvrdit={potvrzeno}
          onZrusit={() => setPotvrdit(null)}
        />
      ) : null}
    </Skladaci>
  );
}
