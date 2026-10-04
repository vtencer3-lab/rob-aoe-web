import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { TextSIkonami } from "./TextSIkonami.js";

// Ikonky rolí a relikvií v textech pravidel (uživatel 4. 10. 2026): role
// v jakémkoli pádě, text beze změny.
it("před role v různých tvarech a relikvie dá ikonku, text nemění", () => {
  const text = "Když zemře Královská Garda, tajně se stává novou Gardou a ztrácí výhody Šaška; Kata i Nástupce císaře se to netýká, relikvie ano. Kdokoli.";
  const { container } = render(<p><TextSIkonami text={text} /></p>);
  expect(container.textContent).toBe(text);
  expect([...container.querySelectorAll(".s-ikonou")].map((s) => s.textContent)).toEqual(["Královská Garda", "Gardou", "Šaška", "Kata", "Nástupce císaře", "relikvie"]);
});
