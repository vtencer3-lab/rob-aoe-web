import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AkceStavPayload, ZapasView } from "../../../src/shared/types.js";
import { useSkladani } from "../skladani.js";
import { Rezie } from "./Rezie.js";

/** Rezie potřebuje sdílený stav sestavy; v testech ho drží tenhle obal. */
function RezieSeStavem(props: Omit<React.ComponentProps<typeof Rezie>, "skladani">) {
  const skladani = useSkladani(props.stav.prihlaseni);
  return <Rezie {...props} skladani={skladani} />;
}

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
    { steamId: "a", alias: "TenceR", steamName: null, tym: 1, barva: 1, jeHost: true, poradi: 0, kliknulPripojit: "2026-09-03T12:00:00.000Z" },
    { steamId: "b", alias: "Pepa_CZ", steamName: null, tym: 1, barva: 1, jeHost: false, poradi: 0, kliknulPripojit: "2026-09-03T12:01:00.000Z" },
    { steamId: "c", alias: "Marek", steamName: null, tym: 2, barva: 2, jeHost: false, poradi: 0, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", steamName: null, tym: 2, barva: 2, jeHost: false, poradi: 0, kliknulPripojit: null },
  ],
};

const stav: AkceStavPayload = {
  akce: { id: 1, nazev: "večer", stav: "bezi" },
  prihlaseni: [],
  zapasy: [zapas],
};

const props = {
  onVytvoritZapas: vi.fn(),
  onStav: vi.fn(),
  onVysledek: vi.fn(),
  onHost: vi.fn(),
  onKontrolaLobby: vi.fn().mockResolvedValue({ nalezeno: false, kontroly: [] }),
};

it("stav účastníka pojmenuje jako kliknutí, ne jako přítomnost v lobby", () => {
  render(<RezieSeStavem stav={stav} {...props} />);
  expect(screen.getByText(/klikl na připojení/i)).toBeInTheDocument();
  expect(screen.queryByText(/je v lobby/i)).not.toBeInTheDocument();
});

// KRITICKÉ: Spectate se odemyká výhradně podle spectatorUri, tedy podle toho, že host
// vložil odkaz z lobby. Ověřeno na živé hře — aoe2de://1/<id> funguje jak v otevřené,
// nenaplněné lobby (Rob vidí nastavení a může upozornit na špatně založenou hru), tak
// za běhu zápasu. Jakýkoliv další zámek by Roba brzdil přesně ve chvíli, kdy je
// nejužitečnější; proto tu žádný není.
it("spectate se odemkne, jakmile host vloží odkaz do lobby", () => {
  render(<RezieSeStavem stav={stav} {...props} />);
  const odkaz = screen.getByTestId("spectate");
  expect(odkaz).toHaveAttribute("aria-disabled", "false");
  expect(odkaz).toHaveAttribute("href", "aoe2de://1/234230181");
});


// Potvrzení hosta je jen informační stavový řádek, nikdy zámek — proto k němu neexistuje
// žádné tlačítko na "odemčení i bez potvrzení". Spectate se nikdy na potvrzení nezamyká.


it("záložní údaje jsou vidět pořád", () => {
  render(<RezieSeStavem stav={stav} {...props} />);
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
  expect(screen.getByText("234230181")).toBeInTheDocument();
});

it("bez čísla lobby spectate vůbec nenabízí", () => {
  const bez = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<RezieSeStavem stav={bez} {...props} />);
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
  render(<RezieSeStavem stav={stav} {...props} onHost={onHost} />);

  klikniNaHostuje();

  expect(potvrzeni).toHaveBeenCalledTimes(1);
  expect(potvrzeni.mock.calls[0]![0]).toMatch(/234230181/);
  expect(onHost).not.toHaveBeenCalled();
});

it("po potvrzení se host přehodí", () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  const onHost = vi.fn();
  render(<RezieSeStavem stav={stav} {...props} onHost={onHost} />);

  klikniNaHostuje();

  expect(onHost).toHaveBeenCalledWith(1, "b");
});

it("bez odkazu do lobby se na nic neptá — není co ztratit", () => {
  const potvrzeni = vi.spyOn(window, "confirm").mockReturnValue(false);
  const onHost = vi.fn();
  const bezOdkazu = { ...stav, zapasy: [{ ...zapas, lobbyId: null, spectatorUri: null }] };
  render(<RezieSeStavem stav={bezOdkazu} {...props} onHost={onHost} />);

  klikniNaHostuje();

  expect(potvrzeni).not.toHaveBeenCalled();
  expect(onHost).toHaveBeenCalledWith(1, "b");
});

// Tlačítko u toho, kdo už hostuje, nedávalo smysl — nabízelo akci, která by
// nic nezměnila, a vedle textového „(host)“ uprostřed věty se dvě stejná
// tlačítka pletla. Hostitele teď nese odznak, ostatní tlačítko.
it("u hosta tlačítko na přehození vůbec není", () => {
  render(<RezieSeStavem stav={stav} {...props} />);

  const tlacitka = screen.getAllByRole("button", { name: /udělat hostem/i });
  expect(tlacitka).toHaveLength(zapas.ucastnici.length - 1);
});

it("hostitele označí odznak, a právě jeden", () => {
  render(<RezieSeStavem stav={stav} {...props} />);

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
  render(<RezieSeStavem stav={dohrany} {...props} />);
  expect(screen.getByTestId("zapas-hlavicka")).toHaveTextContent("dohráno — vyhrál modrý tým");
});

// Spectate, nápověda pro zamrzlou lobby i Zrušit patří běžícímu zápasu. Po
// dohrání jen zabíraly místo a nabízely akce, které už nedávají smysl —
// a přes večer se takhle vršil jeden odepsaný zápas za druhým.
it("dohranému zápasu sebere ovládání běžícího", () => {
  render(<RezieSeStavem stav={dohrany} {...props} />);
  expect(screen.queryByTestId("spectate")).not.toBeInTheDocument();
  expect(screen.queryByText(/kdyby to zamrzlo/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^zrušit$/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /vyhrál modrý tým/i })).not.toBeInTheDocument();
});

// Přepsat výsledek jde, ale ne jedním kliknutím do prázdna: druhé kliknutí je
// samo o sobě to potvrzení.
it("výsledek jde změnit až na druhé kliknutí", async () => {
  render(<RezieSeStavem stav={dohrany} {...props} />);

  expect(screen.queryByRole("button", { name: /vyhrál červený tým/i })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /změnit výsledek/i }));

  expect(screen.getByRole("button", { name: /vyhrál červený tým/i })).toBeInTheDocument();
  expect(props.onVysledek).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /vyhrál červený tým/i }));
  expect(props.onVysledek).toHaveBeenCalledWith(1, { tym: 2 });
});

it("z rozmyšlené změny se dá couvnout, aniž se něco zapíše", () => {
  render(<RezieSeStavem stav={dohrany} {...props} />);

  fireEvent.click(screen.getByRole("button", { name: /změnit výsledek/i }));
  fireEvent.click(screen.getByRole("button", { name: /nechat být/i }));

  expect(screen.queryByRole("button", { name: /vyhrál červený tým/i })).not.toBeInTheDocument();
  expect(props.onVysledek).not.toHaveBeenCalled();
});

// Zrušený zápas byl slepá ulička: pořád nabízel Spectate a tlačítka výsledku,
// ale žádnou cestu zpátky. Stavový automat návrat dovoluje.
it("zrušený zápas jde vrátit do hry", () => {
  render(<RezieSeStavem stav={zruseny} {...props} />);

  expect(screen.getByTestId("zapas-hlavicka")).toHaveTextContent("zrušeno");
  fireEvent.click(screen.getByRole("button", { name: /vrátit do hry/i }));

  expect(props.onStav).toHaveBeenCalledWith(1, "bezi");
});

it("běžícímu zápasu ovládání zůstává", () => {
  render(<RezieSeStavem stav={stav} {...props} />);
  expect(screen.getByTestId("spectate")).toBeInTheDocument();
  expect(screen.getByText(/kdyby to zamrzlo/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /vyhrál modrý tým/i })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /změnit výsledek/i })).not.toBeInTheDocument();
});

// Host na žádný odkaz neklikne — lobby zakládá. Sloupeček „zatím neklikl“ u něj
// tvrdil něco, co nemohlo nikdy nastat. Jeho skutečný stav je, jestli už vložil
// odkaz, a to je přesně to, co Rob potřebuje vědět.
it("u hosta nemluví o klikání, ale o lobby", () => {
  render(<RezieSeStavem stav={stav} {...props} />);
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
  render(<RezieSeStavem stav={bezOdkazu} {...props} />);
  const radekHosta = screen.getByTestId("odznak-host").closest("li");
  expect(radekHosta).toHaveTextContent("zakládá lobby");
});

it("v 1v1 se na tlačítku výsledku píše jméno hráče, ne číslo týmu", () => {
  const jednaNaJednu: ZapasView = {
    ...zapas,
    ucastnici: [zapas.ucastnici[0]!, zapas.ucastnici[2]!],
  };
  render(<RezieSeStavem stav={{ ...stav, zapasy: [jednaNaJednu] }} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /vyhrál marek/i }));
  expect(props.onVysledek).toHaveBeenCalledWith(1, { tym: 2 });
});

it("ve 2v2 tlačítko nese barvu týmu a drobně jeho hráče", () => {
  render(<RezieSeStavem stav={stav} {...props} />);
  const modry = screen.getByRole("button", { name: /vyhrál modrý tým/i });
  expect(modry).toHaveClass("barva-1");
  expect(modry).toHaveTextContent("TenceR, Pepa_CZ");
});

it("u Spectate říká, jestli se sedí v lobby, nebo už se hraje", () => {
  const { rerender } = render(<RezieSeStavem stav={{ ...stav, zapasy: [{ ...zapas, fazeLobby: "lobby" }] }} {...props} />);
  expect(screen.getByTestId("faze-lobby")).toHaveTextContent("(Lobby)");
  rerender(<RezieSeStavem stav={{ ...stav, zapasy: [{ ...zapas, fazeLobby: "hraje_se" }] }} {...props} />);
  expect(screen.getByTestId("faze-lobby")).toHaveTextContent("(Hraje se)");
});
