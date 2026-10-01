import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Zakryti } from "./Zakryti.js";

it("je zakryté, kliknutí odkryje, další zakryje", () => {
  render(<Zakryti popisek="Tvá tajná role — klikni pro odkrytí"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Tvá tajná role — klikni pro odkrytí" }));
  expect(screen.getByText("KAT")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zakrýt" }));
  expect(screen.queryByText("KAT")).toBeNull();
});

it("nový mount (obnovení stránky) začíná zakrytý", () => {
  const { unmount } = render(<Zakryti popisek="Odkrýt"><p>KAT</p></Zakryti>);
  fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
  unmount();
  render(<Zakryti popisek="Odkrýt"><p>KAT</p></Zakryti>);
  expect(screen.queryByText("KAT")).toBeNull();
});

// Rub karty je vidět jen zakrytý — po odkrytí ho střídá obsah.
it("zakrytá karta ukáže rub, odkrytá obsah", () => {
  render(
    <Zakryti popisek="Odkrýt" rub={<p>RUB</p>}>
      <p>KAT</p>
    </Zakryti>,
  );
  expect(screen.getByText("RUB")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Odkrýt" }));
  expect(screen.queryByText("RUB")).not.toBeInTheDocument();
  expect(screen.getByText("KAT")).toBeInTheDocument();
});
