import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { PrihlaseniOkno } from "./PrihlaseniOkno.js";

it("Escape okno zavře", async () => {
  const zavrit = vi.fn();
  render(<PrihlaseniOkno onZavrit={zavrit} />);
  await userEvent.keyboard("{Escape}");
  expect(zavrit).toHaveBeenCalled();
});

it("obě volby jsou odkazy, ne tlačítka — přihlášení je odchod ze stránky", () => {
  render(<PrihlaseniOkno onZavrit={() => {}} />);
  expect(screen.getAllByRole("link")).toHaveLength(2);
});

it("ikony mají textovou alternativu, aby šlo okno ovládat i bez obrázků", () => {
  render(<PrihlaseniOkno onZavrit={() => {}} />);
  expect(screen.getByAltText(/Steam/)).toBeInTheDocument();
  expect(screen.getByAltText(/Xbox|Microsoft/)).toBeInTheDocument();
});
