import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NazevAkce } from "./NazevAkce.js";

// Večer se často jmenuje podle toho, co se zrovna hraje. Adminovi je celý
// nadpis tlačítko, takže ho přepíše bez zakládání nové akce.
it("kliknutí na nadpis ho přepíše, Escape změnu zahodí", () => {
  const onPrejmenovat = vi.fn();
  render(<NazevAkce nazev="Čtvrtek" onPrejmenovat={onPrejmenovat} />);

  fireEvent.click(screen.getByRole("button", { name: "Čtvrtek" }));
  const pole = screen.getByLabelText("Název akce");
  fireEvent.change(pole, { target: { value: "Pátek" } });
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(onPrejmenovat).toHaveBeenCalledWith("Pátek");

  fireEvent.click(screen.getByRole("button", { name: "Čtvrtek" }));
  const znovu = screen.getByLabelText("Název akce");
  fireEvent.change(znovu, { target: { value: "Nic z toho" } });
  fireEvent.keyDown(znovu, { key: "Escape" });
  expect(onPrejmenovat).toHaveBeenCalledTimes(1);
});

// Prázdný název by server odmítl; ať Rob nekouká na chybu místo na to, že se
// prostě nic nestalo. Beze změny se taky nic neposílá.
it("prázdný ani nezměněný název se neposílá", () => {
  const onPrejmenovat = vi.fn();
  render(<NazevAkce nazev="Čtvrtek" onPrejmenovat={onPrejmenovat} />);

  fireEvent.click(screen.getByRole("button", { name: "Čtvrtek" }));
  fireEvent.change(screen.getByLabelText("Název akce"), { target: { value: "   " } });
  fireEvent.blur(screen.getByLabelText("Název akce"));
  expect(onPrejmenovat).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Čtvrtek" }));
  fireEvent.blur(screen.getByLabelText("Název akce"));
  expect(onPrejmenovat).not.toHaveBeenCalled();
});

// Hráč název jen čte; přejmenovat smí admin.
it("bez obsluhy je to jen nadpis, na který se nedá kliknout", () => {
  render(<NazevAkce nazev="Čtvrtek" />);
  expect(screen.getByTestId("nazev-akce")).toHaveTextContent("Čtvrtek");
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
