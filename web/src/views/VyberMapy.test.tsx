import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { VyberMapy } from "./VyberMapy.js";

it("vypíše mapy s náhledy a „libovolnou“ napřed, klik vybere", () => {
  const onVybrat = vi.fn();
  render(<VyberMapy hodnota={10875} onVybrat={onVybrat} onZavrit={vi.fn()} />);
  const volby = screen.getAllByRole("option");
  expect(volby[0]).toHaveTextContent("libovolná");
  expect(volby.length).toBeGreaterThan(150);
  expect(screen.getByRole("option", { name: /^arabia$/i })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("option", { name: /^arabia$/i }).querySelector("img")).not.toBeNull();

  fireEvent.click(screen.getByRole("option", { name: /^arena$/i }));
  expect(onVybrat).toHaveBeenCalledWith(10895);
});

it("hledání filtruje bez ohledu na diakritiku a Enter bere první nález", () => {
  const onVybrat = vi.fn();
  render(<VyberMapy hodnota={null} onVybrat={onVybrat} onZavrit={vi.fn()} />);
  const pole = screen.getByRole("searchbox", { name: /hledat mapu/i });
  expect(pole).toHaveFocus();
  fireEvent.change(pole, { target: { value: "black for" } });
  expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Black Forest", "QS Black Forest"]);
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(onVybrat).toHaveBeenCalledWith(10878);

  fireEvent.change(pole, { target: { value: "xyzzy" } });
  expect(screen.queryAllByRole("option")).toHaveLength(0);
  expect(screen.getByText(/žádná mapa/i)).toBeInTheDocument();
});

it("Escape a klik do stínu zavřou bez výběru", () => {
  const onZavrit = vi.fn();
  const onVybrat = vi.fn();
  render(<VyberMapy hodnota={null} onVybrat={onVybrat} onZavrit={onZavrit} />);
  fireEvent.keyDown(window, { key: "Escape" });
  fireEvent.click(screen.getByTestId("vyber-mapy-stin"));
  expect(onZavrit).toHaveBeenCalledTimes(2);
  expect(onVybrat).not.toHaveBeenCalled();
});

it("pravé tlačítko do vyhledávání smaže text", () => {
  render(<VyberMapy hodnota={null} onVybrat={vi.fn()} onZavrit={vi.fn()} />);
  const pole = screen.getByRole("searchbox", { name: /hledat mapu/i });
  fireEvent.change(pole, { target: { value: "ara" } });
  fireEvent.contextMenu(pole);
  expect(pole).toHaveValue("");
});
