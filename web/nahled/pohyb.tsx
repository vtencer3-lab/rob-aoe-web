// Vzorník pohybu (docs/grafika.md „Pohyb“): všechno, co se na webu hýbe, na
// jedné stránce a bez serveru — karta role, pult GM, sbalovací sekce, okna,
// tlačítka, přepínače, chat, karta zápasu a stažení scénáře. Slouží k měření
// přechodů v headless Chrome a k ladění časů v `:root`.
// Není součástí aplikace; pouští se `npm --prefix web run dev` na /nahled/pohyb.html.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { RoleHrace, StavDiplo } from "../../src/shared/diplomacie/typy.js";
import type { AkceStavPayload, ZapasView } from "../../src/shared/types.js";
import { stavDiplo, VERZE, ZAPAS } from "../src/diplomacie/fixtury.js";
import { KartaRole } from "../src/diplomacie/KartaRole.js";
import { PultGm } from "../src/diplomacie/PultGm.js";
import { StazeniScenare } from "../src/diplomacie/StazeniScenare.js";
import { Chat } from "../src/views/Chat.js";
import { Potvrzeni } from "../src/views/Potvrzeni.js";
import { Prepinac } from "../src/views/Prepinac.js";
import { HistorieZapasu } from "../src/views/Rezie.js";
import { Skladaci } from "../src/views/Skladaci.js";
import "../src/styl.css";

const ROLE: RoleHrace[] = [
  { hracId: "h1", role: "nastupce", cilHracId: null },
  { hracId: "h2", role: "kat", cilHracId: "h4" },
  { hracId: "h3", role: "garda", cilHracId: null },
  { hracId: "h4", role: "najezdnik", cilHracId: null },
  { hracId: "h5", role: "najezdnik", cilHracId: null },
  { hracId: "h6", role: "zoldak", cilHracId: "h3" },
  { hracId: "h8", role: "sasek", cilHracId: null },
];

const zprava = (id: number, text: string) => ({ id, hracId: "h2", jmeno: "Hráč 2", jeAdmin: false, barva: 2 as const, tym: 0, text, poslano: `2026-10-02T18:0${id % 10}:00.000Z` });
const DOHRANY: ZapasView = { ...ZAPAS, id: 2, poradi: 2, stav: "dohrano", vitez: null, zpravy: [] };
const STAV: AkceStavPayload = { akce: { id: 1, nazev: "večer", stav: "bezi" }, prihlaseni: [], zapasy: [DOHRANY] } as unknown as AkceStavPayload;

function Vzornik() {
  const [stav, setStav] = useState<StavDiplo>("priprava");
  const [rozdano, setRozdano] = useState(false);
  const [otevreno, setOtevreno] = useState(false);
  const [pta, setPta] = useState(false);
  const [zapnuto, setZapnuto] = useState(false);
  const [zpravy, setZpravy] = useState([zprava(1, "jdu"), zprava(2, "zakládám")]);
  const [hlaska, setHlaska] = useState(false);
  const data = stavDiplo(stav, stav === "priprava" ? [] : ROLE);
  // Pult v přípravě potřebuje zvoleného Nástupce, ať svítí „Rozdat role“.
  if (stav === "priprava") data.zapasy[0]!.nastupceHracId = "h1";
  return (
    <main>
      <section className="karta barva-2" data-testid="vzornik-karta">
        <h2 className="titulek-zapasu">Karta role</h2>
        <button type="button" data-testid="rozdat" onClick={() => setRozdano((r) => !r)}>
          {rozdano ? "Vzít role zpět" : "Rozeslat role hráči"}
        </button>
        <KartaRole zapas={ZAPAS} data={stavDiplo(rozdano ? "rozeslano" : "losovano", rozdano ? ROLE : [])} ja="h2" />
      </section>

      <section className="karta barva-7" data-testid="vzornik-pult">
        <h2 className="titulek-zapasu">Pult GM</h2>
        <div className="ovladani" data-testid="stavy-pultu">
          {(["priprava", "losovano", "rozeslano"] as const).map((s) => (
            <button key={s} type="button" data-stav={s} onClick={() => setStav(s)}>
              {s}
            </button>
          ))}
        </div>
        <PultGm zapas={ZAPAS} data={data} hlidej={(fn) => fn().then(() => undefined, () => undefined)} />
      </section>

      <section className="karta barva-1" data-testid="vzornik-ovladani">
        <h2 className="titulek-zapasu">Ovládání</h2>
        <p className="ovladani" style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" data-testid="tmave">
            Tmavé tlačítko
          </button>
          <button type="button" className="cta" data-testid="zlate">
            Zlaté tlačítko
          </button>
          <a className="tlacitko" href="#" data-testid="zlaty-odkaz">
            Zlatý odkaz
          </a>
          <button type="button" disabled>
            Zakázané
          </button>
          <Prepinac popisek="Zkouška" vlevo="Admin View" vpravo="User View" zapnuto={zapnuto} onZmena={setZapnuto} testId="prepinac" />
          <label>
            <input type="checkbox" data-testid="zaskrtavatko" /> zaškrtávátko
          </label>
          <label>
            <input type="radio" name="r" /> jedna
          </label>
          <label>
            <input type="radio" name="r" /> dvě
          </label>
          <input placeholder="pole" data-testid="pole" />
          <select data-testid="roletka">
            <option>první</option>
            <option>druhá</option>
          </select>
        </p>
        <button type="button" data-testid="otevrit-okno" onClick={() => setPta(true)}>
          Otevřít potvrzení
        </button>{" "}
        <button type="button" data-testid="hlaska" onClick={() => setHlaska((h) => !h)}>
          Hláška
        </button>
        {hlaska ? <p className="vysledek">Nahráno a nastaveno jako aktivní.</p> : null}
        {pta ? <Potvrzeni text="Opravdu?" onPotvrdit={() => setPta(false)} onZrusit={() => setPta(false)} /> : null}
        <Skladaci testId="sekce" hlava="Sbalovací sekce" otevreno={otevreno} onPrepnout={setOtevreno}>
          <p>První odstavec sbalovací sekce.</p>
          <p>Druhý odstavec, ať je co rozbalovat.</p>
          <p>Třetí odstavec.</p>
        </Skladaci>
      </section>

      <section className="host barva-7" data-testid="vzornik-host">
        <h2 className="titulek-zapasu">Stažení scénáře</h2>
        <StazeniScenare verze={VERZE} ja="76561198014056480" />
        <button type="button" data-testid="nova-zprava" onClick={() => setZpravy((z) => [...z, zprava(z.length + 1, `zpráva ${z.length + 1}`)])}>
          Nová zpráva
        </button>
        <Chat zapas={{ ...ZAPAS, zpravy }} ja="h7" onOdeslat={() => Promise.resolve()} />
      </section>

      <HistorieZapasu stav={STAV} />
    </main>
  );
}

createRoot(document.getElementById("korel")!).render(<Vzornik />);
