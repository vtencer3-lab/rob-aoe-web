import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Podminky } from "./Podminky.js";
import { KONTAKT_SMAZANI } from "../pravniCesty.js";

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

// Bez adresy je věta „požádej provozovatele“ slepá ulička — čtenář nemá kam
// napsat. Ověřuje se zapojení konstanty, samotnou adresu hlídá pravniCesty.
it("u smazání účtu dává adresu, na kterou se dá napsat", () => {
  render(<Podminky />);
  expect(screen.getByRole("link", { name: KONTAKT_SMAZANI })).toHaveAttribute(
    "href",
    `mailto:${KONTAKT_SMAZANI}`,
  );
});
