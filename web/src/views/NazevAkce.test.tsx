import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NazevAkce } from "./NazevAkce.js";

// Večer se často jmenuje podle toho, co se zrovna hraje. Tužka u nadpisu ho
// přepíše bez zakládání nové akce.
it("tužka přepíše název akce, Escape změnu zahodí", () => {
  const onPrejmenovat = vi.fn();
  render(<NazevAkce nazev="Čtvrtek" onPrejmenovat={onPrejmenovat} />);

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  const pole = screen.getByLabelText("Název akce");
  fireEvent.change(pole, { target: { value: "Pátek" } });
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(onPrejmenovat).toHaveBeenCalledWith("Pátek");

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
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

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  fireEvent.change(screen.getByLabelText("Název akce"), { target: { value: "   " } });
  fireEvent.blur(screen.getByLabelText("Název akce"));
  expect(onPrejmenovat).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: /přejmenovat akci/i }));
  fireEvent.blur(screen.getByLabelText("Název akce"));
  expect(onPrejmenovat).not.toHaveBeenCalled();
});

// Hráč název jen čte; přejmenovat smí admin.
it("bez obsluhy je to jen nadpis, bez tužky", () => {
  render(<NazevAkce nazev="Čtvrtek" />);
  expect(screen.getByTestId("nazev-akce")).toHaveTextContent("Čtvrtek");
  expect(screen.queryByRole("button", { name: /přejmenovat akci/i })).not.toBeInTheDocument();
});
