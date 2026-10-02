import { useEffect, useState } from "react";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { Hlidej } from "../rezimy/index.js";
import { Skladaci } from "../views/Skladaci.js";
import { diploApi } from "./api.js";
import { MapaScenare } from "./MapaScenare.js";
import { PravidlaHry } from "./PravidlaHry.js";

/**
 * Sonda u verze (most ke hře): odkaz nahoře stahuje kopii se sondou, pokud
 * ji verze má; originál od autora zůstává k mání vedle. Verzi bez sondy
 * (nahraná dřív, nebo se přibalení nepovedlo) ji dopočítá tlačítko.
 */
function StavSondy({ verze, pribaluje, onPribalit }: { verze: ScenarVerze; pribaluje: boolean; onPribalit: () => void }) {
  const ma = verze.sonda !== null && verze.sonda.chyba === null;
  return (
    <span className="stav-sondy" data-testid="stav-sondy">
      {" "}
      · sonda: {ma ? "ano" : "ne"}
      {ma ? (
        <>
          {" "}
          (
          <a href={diploApi.souborUrl(verze.id, true)} download={verze.jmenoSouboru}>
            originál
          </a>
          )
        </>
      ) : (
        <>
          {verze.sonda?.chyba ? <span className="varovani"> ({verze.sonda.chyba})</span> : null}{" "}
          <button type="button" disabled={pribaluje} onClick={onPribalit}>
            Přibalit sondu
          </button>
        </>
      )}
    </span>
  );
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
  const [poznamka, setPoznamka] = useState("");
  const [vysledek, setVysledek] = useState<string | null>(null);
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
  const stejneJmeno = soubor !== null && verze.some((v) => v.jmenoSouboru === soubor.name);

  const nahrat = (formular: HTMLFormElement) => {
    if (!soubor) return;
    setNahrava(true);
    void hlidej(async () => {
      const r = await diploApi.nahrat(soubor, poznamka);
      const nahrano = r.chybaRozboru
        ? `Soubor je uložený, ale nepodařilo se ho přečíst: ${r.chybaRozboru} — pravidla a mapa zůstávají z aktivní verze.`
        : r.aktivni
          ? "Nahráno a nastaveno jako aktivní."
          : "Nahráno. Aktivní zůstává dosavadní verze.";
      // Bez sondy se scénář hraje normálně, jen web nedostane data ze hry.
      setVysledek(r.chybaSondy ? `${nahrano} Sondu se nepodařilo přibalit: ${r.chybaSondy}` : nahrano);
      setSoubor(null);
      setPoznamka("");
      // Pole souboru si vybraný soubor drží samo; po nahrání má být prázdné
      // jako zbytek formuláře, jinak by vypadalo, že jde nahrát znovu.
      formular.reset();
      setVerze((await diploApi.verze()).verze);
    }).finally(() => setNahrava(false));
  };
  const aktivovat = (id: number) =>
    void hlidej(async () => {
      await diploApi.aktivovat(id);
      setVerze((await diploApi.verze()).verze);
    });
  // Přibalení trvá vteřiny (Python na serveru) — tlačítko je mezitím zamčené.
  const [pribaluje, setPribaluje] = useState<number | null>(null);
  const pribalSondu = (id: number) => {
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
        <label>
          {/* Stejný strop jako na serveru (routes.ts, 500 znaků). */}
          Co je nového <input value={poznamka} maxLength={500} onChange={(e) => setPoznamka(e.target.value)} />
        </label>
        <button type="submit" className="tlacitko" disabled={!soubor || nahrava}>
          Nahrát
        </button>
        {stejneJmeno ? <p className="varovani">Doporučuju jiné jméno (např. s číslem verze), jinak kontrola lobby nepozná, že host má starou kopii.</p> : null}
        {vysledek ? <p className="vysledek">{vysledek}</p> : null}
      </form>
      {aktivni?.rozbor ? (
        <div className="nahled-scenare">
          <MapaScenare verze={aktivni} starty="vsechny" />
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
        {verze.map((v) => (
          <li key={v.id} className={v.aktivni ? "aktivni" : ""}>
            <a href={diploApi.souborUrl(v.id)} download={v.jmenoSouboru}>
              {v.jmenoSouboru}
            </a>{" "}
            · {v.nahralJmeno} · {new Date(v.nahrano).toLocaleString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
            {v.poznamka ? <> · {v.poznamka}</> : null}
            {v.aktivni ? <strong> · aktivní</strong> : null}
            {v.chybaRozboru ? <span className="varovani"> · nepodařilo se přečíst: {v.chybaRozboru}</span> : null}
            <StavSondy verze={v} pribaluje={pribaluje !== null} onPribalit={() => pribalSondu(v.id)} />
            {!v.aktivni && v.rozbor ? (
              <button type="button" onClick={() => aktivovat(v.id)}>
                Nastavit jako aktivní
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </Skladaci>
  );
}
