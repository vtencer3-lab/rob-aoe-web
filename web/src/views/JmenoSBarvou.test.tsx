import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { aiId, JMENO_AI } from "../../../src/shared/aiHraci.js";
import type { Barva } from "../../../src/shared/types.js";
import { JmenoSBarvou, JmenoUcastnika, VitezVeVete, VycetUcastniku } from "./JmenoSBarvou.js";

const u = (hracId: string, alias: string, barva: Barva, tym: 0 | 1 | 2 = 0) => ({ hracId, alias, platformaJmeno: null, barva, tym, poradi: barva });
const UCASTNICI = [u("a", "Tonda", 1), u("b", "Zdena", 4), u(aiId(3), JMENO_AI, 3), u(aiId(5), JMENO_AI, 5)];

// Barvu nese čtvereček sám, ne předek — v kartě `.karta.barva-7` by ho jinak
// přebarvila barva karty. Čtečce nic neříká, jméno zůstává holý text.
it("před jméno dá čtvereček barvy, který se neohlašuje", () => {
  const { container } = render(<JmenoSBarvou barva={4}>Zdena</JmenoSBarvou>);
  const jmeno = screen.getByText("Zdena");
  expect(jmeno).toHaveClass("jmeno-s-barvou");
  const ctverecek = container.querySelector(".swatch")!;
  expect(ctverecek).toHaveClass("barva-4");
  expect(ctverecek).toHaveAttribute("aria-hidden", "true");
  expect(ctverecek).toHaveAttribute("title", "žlutá");
  expect(jmeno.firstElementChild).toBe(ctverecek);
});

it("bez známé barvy zůstane holý text bez čtverečku", () => {
  const { container } = render(
    <p>
      <JmenoSBarvou barva={null}>tým 2</JmenoSBarvou>
    </p>,
  );
  expect(container.querySelector("p")!.innerHTML).toBe("tým 2");
});

// Stejně pojmenované AI rozliší přívěsek „(pN)“ jako v `jmenoVZapasu`;
// neznámé id se vypíše tak, jak je, a čtvereček nemá.
it("účastníka podle id pojmenuje a obarví, neznámého nechá být", () => {
  const { container, rerender } = render(<JmenoUcastnika ucastnici={UCASTNICI} hracId={aiId(5)} />);
  expect(screen.getByText("AI (p5)")).toHaveClass("jmeno-s-barvou");
  expect(container.querySelector(".swatch")).toHaveClass("barva-5");
  rerender(<JmenoUcastnika ucastnici={UCASTNICI} hracId="cizi" />);
  expect(container.textContent).toBe("cizi");
  expect(container.querySelector(".swatch")).toBeNull();
});

it("výčet dá každému jeho barvu a jména oddělí", () => {
  const { container } = render(<VycetUcastniku ucastnici={UCASTNICI} hraci={["a", "b"]} />);
  expect(container.textContent).toBe("Tonda, Zdena");
  expect([...container.querySelectorAll(".swatch")].map((s) => s.className)).toEqual(["swatch barva-1", "swatch barva-4"]);
});

// Slova věty skládá sdílené `vetaOViteze`; tady jen, že jména nesou barvu
// a tým se sdílenou barvou taky, tým s víc barvami ne.
it("věta o vítězi nese barvy jmenovaných", () => {
  const { container, rerender } = render(<VitezVeVete ucastnici={UCASTNICI} vitez={{ hraci: ["b", "a"] }} />);
  expect(container.textContent).toBe("vyhráli Tonda a Zdena");
  expect([...container.querySelectorAll(".swatch")].map((s) => s.className)).toEqual(["swatch barva-1", "swatch barva-4"]);
  const tymy = [u("a", "Tonda", 1, 1), u("b", "Zdena", 1, 1), u("c", "Karel", 2, 2), u("d", "Jana", 3, 2)];
  rerender(<VitezVeVete ucastnici={tymy} vitez={{ tym: 1 }} />);
  expect(container.textContent).toBe("vyhrál modrý tým");
  expect(container.querySelector(".swatch")).toHaveClass("barva-1");
  rerender(<VitezVeVete ucastnici={tymy} vitez={{ tym: 2 }} />);
  expect(container.textContent).toBe("vyhrál tým 2");
  expect(container.querySelector(".swatch")).toBeNull();
});
