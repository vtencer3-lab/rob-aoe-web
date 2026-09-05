import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { KopirovaciTlacitko } from "./KopirovaciTlacitko.js";

function nastavSchranku(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

it("zkopíruje hodnotu do schránky", async () => {
  const writeText = nastavSchranku();
  render(<KopirovaciTlacitko hodnota="ROB-07" popis="název lobby" />);

  await userEvent.click(screen.getByRole("button", { name: /název lobby/i }));

  expect(writeText).toHaveBeenCalledWith("ROB-07");
});

it("po zkopírování to dá najevo", async () => {
  nastavSchranku();
  render(<KopirovaciTlacitko hodnota="k7rm2xq9" popis="heslo" />);

  await userEvent.click(screen.getByRole("button", { name: /heslo/i }));

  expect(await screen.findByText(/zkopírováno/i)).toBeInTheDocument();
});

// Schránku prohlížeč povolí jen na https nebo localhostu. Když ji odmítne,
// hodnota zůstává na obrazovce k opsání — spadnout kvůli tomu nesmí nic.
it("odmítnutou schránku přejde bez pádu", async () => {
  nastavSchranku(vi.fn().mockRejectedValue(new Error("zakázáno")));
  render(<KopirovaciTlacitko hodnota="ROB-07" popis="název lobby" />);

  await userEvent.click(screen.getByRole("button", { name: /název lobby/i }));

  expect(screen.getByRole("button", { name: /název lobby/i })).toBeInTheDocument();
  expect(screen.queryByText(/zkopírováno/i)).not.toBeInTheDocument();
});
