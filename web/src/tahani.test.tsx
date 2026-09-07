import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useTahani } from "./tahani.js";

// jsdom PointerEvent nemá; bez něj fireEvent posílá holý Event bez clientY.
// MouseEvent stačí — souřadnice nese a pointerId zůstane undefined.
if (typeof window.PointerEvent === "undefined") {
  (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
}

function Seznam({ presun, poradi }: { presun: (s: string, od: string, na: string) => void; poradi: string[] }) {
  const tahani = useTahani(presun as never);
  return (
    <ul>
      {poradi.map((id) => (
        <li key={id} {...tahani("vybrani", id)} data-testid={`radek-${id}`}>
          {id} <button type="button">tlačítko</button>
        </li>
      ))}
    </ul>
  );
}

/** jsdom geometrii neumí — každému řádku dáme pevný obdélník podle pořadí. */
function rozmisti(vyska = 40) {
  for (const li of Array.from(document.querySelectorAll("li"))) {
    const i = Array.from(li.parentElement!.children).indexOf(li);
    vi.spyOn(li, "getBoundingClientRect").mockImplementation(() => ({ top: i * vyska, height: vyska, bottom: (i + 1) * vyska, left: 0, right: 100, width: 100, x: 0, y: i * vyska, toJSON: () => ({} ) }) as DOMRect);
  }
}

// Řádek se vezme do ruky pointerem: dostane třídu v-ruce a jede s kurzorem;
// jakmile kurzor přejede střed souseda, pořadí se prohodí hned, ne až po puštění.
it("pointer tažení zvedne řádek a prohodí ho, když přejede střed souseda", () => {
  const presun = vi.fn();
  render(<Seznam presun={presun} poradi={["a", "b", "c"]} />);
  rozmisti();
  const a = screen.getByTestId("radek-a");

  fireEvent.pointerDown(a, { button: 0, clientY: 20, pointerId: 1 });
  expect(a).toHaveClass("v-ruce");
  fireEvent.pointerMove(a, { clientY: 45, pointerId: 1 });
  expect(a.style.transform).toBe("translateY(25px)");
  expect(presun).not.toHaveBeenCalled();

  fireEvent.pointerMove(a, { clientY: 65, pointerId: 1 }); // za střed „b“ (60)
  expect(presun).toHaveBeenCalledWith("vybrani", "a", "b");

  fireEvent.pointerUp(a, { pointerId: 1 });
  expect(a).not.toHaveClass("v-ruce");
});

it("tažení nezačne z tlačítka uvnitř řádku", () => {
  render(<Seznam presun={vi.fn()} poradi={["a", "b"]} />);
  const a = screen.getByTestId("radek-a");
  fireEvent.pointerDown(screen.getAllByRole("button")[0]!, { button: 0, clientY: 20, pointerId: 1 });
  expect(a).not.toHaveClass("v-ruce");
});
