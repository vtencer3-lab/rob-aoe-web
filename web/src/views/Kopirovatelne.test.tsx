import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { Kopirovatelne } from "./Kopirovatelne.js";

function nastavSchranku(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}

it("kliknutí na samotnou hodnotu ji zkopíruje do schránky", async () => {
  const writeText = nastavSchranku();
  render(<Kopirovatelne hodnota="ROB-07" popis="název lobby" />);

  await userEvent.click(screen.getByText("ROB-07"));

  expect(writeText).toHaveBeenCalledWith("ROB-07");
});

it("tlačítko je pojmenované pro čtečky podle popisu", () => {
  nastavSchranku();
  render(<Kopirovatelne hodnota="k7rm2xq9" popis="heslo" />);
  expect(screen.getByRole("button", { name: /kopírovat heslo/i })).toBeInTheDocument();
});

it("po zkopírování vyskočí toast a po chvíli zmizí", async () => {
  nastavSchranku();
  render(<Kopirovatelne hodnota="k7rm2xq9" popis="heslo" />);

  await userEvent.click(screen.getByRole("button", { name: /kopírovat heslo/i }));
  expect(await screen.findByRole("status")).toHaveTextContent(/zkopírováno/i);

  // Skutečný čas: toast žije 1,5 s. Falešné časovače se s userEvent v jsdom
  // zasekly, tahle jedna a půl vteřina za to stojí.
  await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument(), {
    timeout: 3000,
  });
});

// Schránku prohlížeč povolí jen na https nebo localhostu. Když ji odmítne,
// hodnota zůstává na obrazovce k opsání — spadnout kvůli tomu nesmí nic.
it("odmítnutou schránku přejde bez pádu a bez toastu", async () => {
  nastavSchranku(vi.fn().mockRejectedValue(new Error("zakázáno")));
  render(<Kopirovatelne hodnota="ROB-07" popis="název lobby" />);

  await userEvent.click(screen.getByRole("button", { name: /název lobby/i }));

  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
