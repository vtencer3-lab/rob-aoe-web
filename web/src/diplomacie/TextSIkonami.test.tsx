import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { TextSIkonami } from "./TextSIkonami.js";

// Ikonky rolí a relikvií v textech pravidel (uživatel 4. 10. 2026): role
// v jakémkoli pádě, text beze změny.
it("před role v různých tvarech a relikvie dá ikonku, text nemění", () => {
  const text = "Když zemře Královská Garda, tajně se stává novou Gardou a ztrácí výhody Šaška; Popravčímu i Nástupce císaře se to netýká, relikvie ano. Kdokoli.";
  const { container } = render(<p><TextSIkonami text={text} /></p>);
  expect(container.textContent).toBe(text);
  expect([...container.querySelectorAll(".s-ikonou")].map((s) => s.textContent)).toEqual(["Královská Garda", "Gardou", "Šaška", "Popravčímu", "Nástupce císaře", "relikvie"]);
});

it("GM dostane šedý čtvereček s číslem 7", () => {
  const { container } = render(<p><TextSIkonami text="Začíná s 1 relikvií od GM." /></p>);
  expect(container.querySelector(".swatch")).toHaveClass("barva-7");
  expect(container.querySelector(".swatch")).toHaveAttribute("data-cislo", "7");
  expect(container.textContent).toBe("Začíná s 1 relikvií od GM.");
});
