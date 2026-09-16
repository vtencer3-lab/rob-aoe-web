import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Podminky } from "./Podminky.js";

it("vykreslí podmínky použití s odkazem zpátky na web", () => {
  render(<Podminky />);
  expect(screen.getByRole("heading", { name: "Podmínky použití" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /zpátky/i })).toBeInTheDocument();
  expect(document.title).toBe("Podmínky použití — RobDiesALot");
});

// Provozovatel je soukromá osoba, ne firma — přesně tohle se v textu nesmí
// ztratit, i když se formulace časem upraví.
it("říká, že web je zdarma a provozovatel je soukromá osoba", () => {
  render(<Podminky />);
  expect(screen.getByText(/zdarma/i)).toBeInTheDocument();
  expect(screen.getByText(/soukrom[áé] osoba/i)).toBeInTheDocument();
});

it("popisuje smazání účtu jako žádost provozovateli, ne samoobslužné tlačítko", () => {
  render(<Podminky />);
  expect(screen.getByText(/požád/i)).toBeInTheDocument();
});
