import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ZAPAS } from "../diplomacie/fixtury.js";
import { diplomacieKlient } from "../diplomacie/index.js";
import { spustPrehravacHlasu, UDALOST_HLAS } from "../hlas.js";
import { MluviTed } from "./MluviTed.js";

afterEach(() => vi.unstubAllGlobals());

/** Prvek Audio, který nic nehraje; test si konec přehrávání ohlásí sám. */
function nemeAudio() {
  const posluchaci = new Map<string, () => void>();
  vi.stubGlobal(
    "Audio",
    vi.fn(() => ({ volume: 1, play: () => Promise.resolve(), pause: () => {}, addEventListener: (typ: string, cb: () => void) => void posluchaci.set(typ, cb) })),
  );
  return { dohralo: () => posluchaci.get("ended")?.() };
}

const kousek = (kdo: string, jmeno: string, sezeni = "s1") =>
  act(() => {
    window.dispatchEvent(new CustomEvent(UDALOST_HLAS, { detail: { zapasId: ZAPAS.id, kdo, jmeno, jeAdmin: kdo === "rob", sezeni, poradi: 0, konec: false, data: "AAAA", prijemci: ZAPAS.ucastnici.map((u) => u.hracId) } }));
  });

// U přehrávané hlášky má být vidět, kdo mluví — u GM „GM“ + jméno (uživatel
// 2. 10. 2026). Titul dává háček módu podle barvy slotu, jádro ho nezná.
it("ukáže, kdo mluví: GM s titulem před jménem, admin z režie jen jménem", () => {
  const audio = nemeAudio();
  const odhlasit = spustPrehravacHlasu("h1", false);
  render(<MluviTed zapasy={[ZAPAS]} popisSlotu={diplomacieKlient.popisSlotu} />);
  expect(screen.queryByTestId("mluvi-ted")).not.toBeInTheDocument();

  kousek("h7", "Hráč 7");
  expect(screen.getByTestId("mluvi-ted")).toHaveTextContent("GM Hráč 7 mluví");

  // Promluva dohrála — štítek zmizí.
  act(() => audio.dohralo());
  expect(screen.queryByTestId("mluvi-ted")).not.toBeInTheDocument();

  // Admin z režie v zápase nesedí, titul nemá.
  kousek("rob", "Rob", "s2");
  expect(screen.getByTestId("mluvi-ted")).toHaveTextContent("Rob mluví");
  expect(screen.getByTestId("mluvi-ted")).not.toHaveTextContent("GM");

  // Odhlášení přehrávače (odhlášení uživatele) po sobě štítek uklidí.
  act(() => odhlasit());
  expect(screen.queryByTestId("mluvi-ted")).not.toBeInTheDocument();
});

it("vlastní hlas štítek neukazuje a bez háčku módu je to jen jméno", () => {
  nemeAudio();
  const odhlasit = spustPrehravacHlasu("h7", false);
  render(<MluviTed zapasy={[ZAPAS]} />);
  kousek("h7", "Hráč 7");
  expect(screen.queryByTestId("mluvi-ted")).not.toBeInTheDocument();
  kousek("h3", "Hráč 3", "s3");
  expect(screen.getByTestId("mluvi-ted")).toHaveTextContent("Hráč 3 mluví");
  act(() => odhlasit());
});
