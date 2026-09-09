import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, ZapasView } from "../../../src/shared/types.js";
import { HistorieZapasu, Rezie } from "./Rezie.js";


const zapas: ZapasView = {
  id: 1,
  poradi: 7,
  stav: "bezi",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: "234230181",
  joinUri: "aoe2de://0/234230181",
  spectatorUri: "aoe2de://1/234230181",
  vitez: null,
  ucastnici: [
    { steamId: "a", alias: "TenceR", steamName: null, tym: 1, barva: 1, civ: null, jeHost: true, poradi: 0, kliknulPripojit: "2026-09-03T12:00:00.000Z" },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, civ: null, jeHost: false, poradi: 0, kliknulPripojit: "2026-09-03T12:01:00.000Z" },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null },
  ],
};

const stav: AkceStavPayload = {
  akce: { id: 1, nazev: "večer", stav: "bezi" },
  prihlaseni: [],
  zapasy: [zapas],
};

const props = {
  onStav: vi.fn(),
  onSmazat: vi.fn(),
  onVysledek: vi.fn(),
  onHost: vi.fn(),
  onKontrolaLobby: vi.fn().mockResolvedValue({ nalezeno: false, kontroly: [] }),
  onZavrit: vi.fn(),
};

it("stav účastníka pojmenuje jako kliknutí, ne jako přítomnost v lobby", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  expect(screen.getByText(/klikl na připojení/i)).toBeInTheDocument();
  expect(screen.queryByText(/je v lobby/i)).not.toBeInTheDocument();
});

// KRITICKÉ: Spectate se odemyká výhradně podle spectatorUri, tedy podle toho, že host
// vložil odkaz z lobby. Ověřeno na živé hře — aoe2de://1/<id> funguje jak v otevřené,
// nenaplněné lobby (Rob vidí nastavení a může upozornit na špatně založenou hru), tak
// za běhu zápasu. Jakýkoliv další zámek by Roba brzdil přesně ve chvíli, kdy je
// nejužitečnější; proto tu žádný není.
it("spectate se odemkne, jakmile host vloží odkaz do lobby", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  const odkaz = screen.getByTestId("spectate");
  expect(odkaz).toHaveAttribute("aria-disabled", "false");
  expect(odkaz).toHaveAttribute("href", "aoe2de://1/234230181");
});


// Potvrzení hosta je jen informační stavový řádek, nikdy zámek — proto k němu neexistuje
// žádné tlačítko na "odemčení i bez potvrzení". Spectate se nikdy na potvrzení nezamyká.


// Řádek „Kdyby to zamrzlo“ s názvem, heslem a číslem šel 7. 9. 2026 pryč:
// v přenosu jen rušil. Kdyby byl někdy potřeba divácký odkaz nebo PIN ke
// zkopírování, patří vedle Spectate, ne pod kontrolu.
it("záložní řádek s názvem, heslem a číslem lobby v režii není", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  expect(screen.queryByText(/kdyby to zamrzlo/i)).not.toBeInTheDocument();
  expect(screen.queryByText("ROB-07")).not.toBeInTheDocument();
  expect(screen.queryByText("k7rm2xq9")).not.toBeInTheDocument();
});

it("bez čísla lobby spectate vůbec nenabízí", () => {
  const bez = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<Rezie stav={bez} obsluha={props} />);
  expect(screen.getByTestId("spectate")).toHaveAttribute("aria-disabled", "true");
});

// Tlačítko na přehození hosta je u každého, kdo hostem není, a setHost vynuluje
// lobby_id — jeden chybný klik u běžícího zápasu zabije odkaz všem hráčům
// i Robův vlastní Spectate. Semantika je správná, chybělo zábradlí.
afterEach(() => {
  vi.restoreAllMocks();
});

function klikniNaHostuje(index = 0) {
  const tlacitka = screen.getAllByRole("button", { name: /udělat hostem/i });
  fireEvent.click(tlacitka[index]!);
}

it("přehození hosta u zápasu s odkazem se ptá a při odmítnutí nic neudělá", () => {
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onHost = vi.fn();
  render(<Rezie stav={stav} obsluha={{ ...props, onHost }} />);

  klikniNaHostuje();

  expect(potvrzeni).toHaveBeenCalledTimes(1);
  expect(potvrzeni.mock.calls[0]![0]).toMatch(/234230181/);
  expect(onHost).not.toHaveBeenCalled();
});

it("po potvrzení se host přehodí", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const onHost = vi.fn();
  render(<Rezie stav={stav} obsluha={{ ...props, onHost }} />);

  klikniNaHostuje();

  expect(onHost).toHaveBeenCalledWith(1, "b");
});

it("bez odkazu do lobby se na nic neptá — není co ztratit", () => {
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onHost = vi.fn();
  const bezOdkazu = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<Rezie stav={bezOdkazu} obsluha={{ ...props, onHost }} />);

  klikniNaHostuje();

  expect(potvrzeni).not.toHaveBeenCalled();
  expect(onHost).toHaveBeenCalledWith(1, "b");
});

// Tlačítko u toho, kdo už hostuje, nedávalo smysl — nabízelo akci, která by
// nic nezměnila, a vedle textového „(host)“ uprostřed věty se dvě stejná
// tlačítka pletla. Hostitele teď nese odznak, ostatní tlačítko.
it("u hosta tlačítko na přehození vůbec není", () => {
  render(<Rezie stav={stav} obsluha={props} />);

  const tlacitka = screen.getAllByRole("button", { name: /udělat hostem/i });
  expect(tlacitka).toHaveLength(zapas.ucastnici.length - 1);
});

it("hostitele označí odznak, a právě jeden", () => {
  render(<Rezie stav={stav} obsluha={props} />);

  const odznaky = screen.getAllByTestId("odznak-host");
  expect(odznaky).toHaveLength(1);
  expect(odznaky[0]!.closest("li")).toHaveTextContent("TenceR");
});

const dohrany: AkceStavPayload = {
  ...stav,
  zapasy: [{ ...zapas, stav: "dohrano", vitez: { tym: 1 } }],
};

const zruseny: AkceStavPayload = {
  ...stav,
  zapasy: [{ ...zapas, stav: "zruseny" }],
};

it("u dohraného zápasu řekne, kdo vyhrál", () => {
  render(<HistorieZapasu stav={dohrany} obsluha={props} />);
  expect(screen.getByTestId("zapas-hlavicka")).toHaveTextContent("dohráno — vyhrál modrý tým");
});

// Spectate, nápověda pro zamrzlou lobby i Zrušit patří běžícímu zápasu. Po
// dohrání jen zabíraly místo a nabízely akce, které už nedávají smysl —
// a přes večer se takhle vršil jeden odepsaný zápas za druhým.
it("dohranému zápasu sebere ovládání běžícího", () => {
  render(<HistorieZapasu stav={dohrany} obsluha={props} />);
  expect(screen.queryByTestId("spectate")).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^zrušit$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /vyhrál modrý tým/i })).not.toBeInTheDocument();
});

// Přepsat výsledek jde, ale ne jedním kliknutím do prázdna: druhé kliknutí je
// samo o sobě to potvrzení.
it("výsledek jde změnit až na druhé kliknutí", async () => {
  render(<HistorieZapasu stav={dohrany} obsluha={props} />);

  expect(screen.queryByRole("button", { name: /vyhrál červený tým/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /změnit výsledek/i }));

  expect(screen.getByRole("button", { name: /vyhrál červený tým/i })).toBeInTheDocument();
  expect(props.onVysledek).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /vyhrál červený tým/i }));
  expect(props.onVysledek).toHaveBeenCalledWith(1, { tym: 2 });
});

it("z rozmyšlené změny se dá couvnout, aniž se něco zapíše", () => {
  render(<HistorieZapasu stav={dohrany} obsluha={props} />);

  fireEvent.click(screen.getByRole("button", { name: /změnit výsledek/i }));
  fireEvent.click(screen.getByRole("button", { name: /nechat být/i }));

  expect(screen.queryByRole("button", { name: /vyhrál červený tým/i })).not.toBeInTheDocument();
  expect(props.onVysledek).not.toHaveBeenCalled();
});

// Zrušený zápas byl slepá ulička: pořád nabízel Spectate a tlačítka výsledku,
// ale žádnou cestu zpátky. Stavový automat návrat dovoluje.
it("zrušený zápas jde vrátit do hry", () => {
  render(<HistorieZapasu stav={zruseny} obsluha={props} />);

  expect(screen.getByTestId("zapas-hlavicka")).toHaveTextContent("zrušeno");
  fireEvent.click(screen.getByRole("button", { name: /vrátit do hry/i }));

  expect(props.onStav).toHaveBeenCalledWith(1, "bezi");
});

// Zrušený zápas, ke kterému se Rob vracet nechce, jde odebrat úplně — jinak
// by v režii strašil do konce večera. Jen u zrušeného: dohraný je záznam.
it("zrušený zápas jde odebrat úplně, dohraný ne", () => {
  const { rerender } = render(<HistorieZapasu stav={zruseny} obsluha={props} />);
  fireEvent.click(screen.getByRole("button", { name: /odebrat úplně/i }));
  expect(props.onSmazat).toHaveBeenCalledWith(1);

  rerender(<HistorieZapasu stav={dohrany} obsluha={props} />);
  expect(screen.queryByRole("button", { name: /odebrat úplně/i })).not.toBeInTheDocument();
});

it("kontrola lobby je v režii stejná sekce jako u hosta", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  expect(screen.getByRole("heading", { name: /kontrola lobby/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /zkontrolovat lobby/i })).toBeInTheDocument();
});

it("běžícímu zápasu ovládání zůstává", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  expect(screen.getByTestId("spectate")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /vyhrál modrý tým/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /změnit výsledek/i })).not.toBeInTheDocument();
});

// Host na žádný odkaz neklikne — lobby zakládá. Sloupeček „zatím neklikl“ u něj
// tvrdil něco, co nemohlo nikdy nastat. Jeho skutečný stav je, jestli už vložil
// odkaz, a to je přesně to, co Rob potřebuje vědět.
it("u hosta nemluví o klikání, ale o lobby", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  const radekHosta = screen.getByTestId("odznak-host").closest("li");
  expect(radekHosta).toHaveTextContent("vložil odkaz do lobby");
  expect(radekHosta).not.toHaveTextContent("zatím neklikl");
  expect(radekHosta).not.toHaveTextContent("klikl na připojení");
});

it("dokud host odkaz nevložil, je vidět, že se na něj čeká", () => {
  const bezOdkazu: AkceStavPayload = {
    ...stav,
    zapasy: [{ ...zapas, lobbyId: null, joinUri: null, spectatorUri: null }],
  };
  render(<Rezie stav={bezOdkazu} obsluha={props} />);
  const radekHosta = screen.getByTestId("odznak-host").closest("li");
  expect(radekHosta).toHaveTextContent("zakládá lobby");
});

it("v 1v1 se na tlačítku výsledku píše jméno hráče, ne číslo týmu", () => {
  const jednaNaJednu: ZapasView = {
    ...zapas,
    ucastnici: [zapas.ucastnici[0]!, zapas.ucastnici[2]!],
  };
  render(<Rezie stav={{ ...stav, zapasy: [jednaNaJednu] }} obsluha={props} />);
  fireEvent.click(screen.getByRole("button", { name: /vyhrál marek/i }));
  expect(props.onVysledek).toHaveBeenCalledWith(1, { tym: 2 });
});

it("ve 2v2 tlačítko nese barvu týmu a drobně jeho hráče", () => {
  render(<Rezie stav={stav} obsluha={props} />);
  const modry = screen.getByRole("button", { name: /vyhrál modrý tým/i });
  expect(modry).toHaveClass("barva-1");
  expect(modry).toHaveTextContent("TenceR, Pepa_CZ");
});

it("u Spectate říká, jestli se sedí v lobby, nebo už se hraje", () => {
  const { rerender } = render(<Rezie stav={{ ...stav, zapasy: [{ ...zapas, fazeLobby: "lobby" }] }} obsluha={props} />);
  expect(screen.getByTestId("faze-lobby")).toHaveTextContent("(Lobby)");
  rerender(<Rezie stav={{ ...stav, zapasy: [{ ...zapas, fazeLobby: "hraje_se" }] }} obsluha={props} />);
  expect(screen.getByTestId("faze-lobby")).toHaveTextContent("(Hraje se)");
});

// Dohraný zápas jde křížkem zavřít: karta zmizí ze stránky úplně, i režii
// (výsledek zůstává v databázi). Běžící ani zrušený křížek nemají.
it("dohraný zápas má křížek na zavření, zavřený zmizí ze stránky", () => {
  const onZavrit = vi.fn();
  const { rerender } = render(<HistorieZapasu stav={dohrany} obsluha={{ ...props, onZavrit }} />);
  fireEvent.click(screen.getByRole("button", { name: /zavřít zápas #7/i }));
  expect(onZavrit).toHaveBeenCalledWith(1);

  const zavreny: AkceStavPayload = { ...stav, zapasy: [{ ...zapas, stav: "dohrano", vitez: { tym: 1 }, zavreny: true }] };
  rerender(<HistorieZapasu stav={zavreny} obsluha={{ ...props, onZavrit }} />);
  expect(screen.queryByTestId("zapas-hlavicka")).not.toBeInTheDocument();

  rerender(<Rezie stav={stav} obsluha={{ ...props, onZavrit }} />);
  expect(screen.queryByRole("button", { name: /zavřít zápas/i })).not.toBeInTheDocument();
});

// Během večera se dohrané zápasy vršily nad rozehraným a odsouvaly ho z dohledu.
// Nahoře proto zůstává jen to, co se hraje; zbytek má sekci pod ním.
it("nahoře jsou jen běžící zápasy, dohrané a zrušené ne", () => {
  const oba: AkceStavPayload = {
    ...stav,
    zapasy: [
      { ...zapas, id: 1, poradi: 7, stav: "dohrano", vitez: { tym: 1 } },
      { ...zapas, id: 2, poradi: 8 },
      { ...zapas, id: 3, poradi: 9, stav: "zruseny" },
    ],
  };
  render(<Rezie stav={oba} obsluha={props} />);
  const hlavicky = screen.getAllByTestId("zapas-hlavicka");
  expect(hlavicky).toHaveLength(1);
  expect(hlavicky[0]).toHaveTextContent("Zápas #8");
});

it("historie nese nadpis a dohrané i zrušené zápasy", () => {
  const oba: AkceStavPayload = {
    ...stav,
    zapasy: [
      { ...zapas, id: 1, poradi: 7, stav: "dohrano", vitez: { tym: 1 } },
      { ...zapas, id: 2, poradi: 8 },
      { ...zapas, id: 3, poradi: 9, stav: "zruseny" },
    ],
  };
  render(<HistorieZapasu stav={oba} obsluha={props} />);
  expect(screen.getByRole("heading", { name: /historie zápasů/i })).toBeInTheDocument();
  const hlavicky = screen.getAllByTestId("zapas-hlavicka");
  expect(hlavicky.map((h) => h.textContent)).toEqual([
    expect.stringContaining("Zápas #7"),
    expect.stringContaining("Zápas #9"),
  ]);
});

// Prázdný nadpis na začátku večera by jen zabíral místo.
it("dokud se nic nedohrálo, historie se nevykreslí vůbec", () => {
  const { container } = render(<HistorieZapasu stav={stav} obsluha={props} />);
  expect(container).toBeEmptyDOMElement();
  expect(screen.queryByRole("heading", { name: /historie zápasů/i })).not.toBeInTheDocument();
});
