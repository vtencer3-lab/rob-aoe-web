import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { NastaveniUzivatele } from "./NastaveniUzivatele.js";

// Hlasitost chatu je podíl z Master Volume: 70 × 50 → 35 (uživatel 13. 9. 2026).
it("posuvník chatu ukládá podíl a ukazuje výslednou hlasitost z Master Volume", () => {
  const onHlasitostChatu = vi.fn();
  render(<NastaveniUzivatele hlasitost={70} onHlasitost={vi.fn()} hlasitostChatu={50} onHlasitostChatu={onHlasitostChatu} onZavrit={vi.fn()} />);
  expect(screen.getByText(/35 % z master volume/i)).toBeInTheDocument();
  fireEvent.change(screen.getByRole("slider", { name: /hlasitost chatu/i }), { target: { value: "20" } });
  expect(onHlasitostChatu).toHaveBeenCalledWith(20);
  expect(localStorage.getItem("zvuk.hlasitost-chat")).toBe("20");
  expect(screen.getByText(/14 % z master volume/i)).toBeInTheDocument();
});

it("posuvník hlasitosti ukládá do prohlížeče a hlásí hodnotu", () => {
  const onHlasitost = vi.fn();
  render(<NastaveniUzivatele hlasitost={70} onHlasitost={onHlasitost} hlasitostChatu={50} onHlasitostChatu={vi.fn()} onZavrit={vi.fn()} />);
  const posuvnik = screen.getByRole("slider", { name: /master volume/i });
  expect(posuvnik).toHaveValue("70");
  fireEvent.change(posuvnik, { target: { value: "35" } });
  expect(onHlasitost).toHaveBeenCalledWith(35);
  expect(localStorage.getItem("zvuk.hlasitost")).toBe("35");
  expect(screen.queryByRole("group", { name: /lhůta/i })).not.toBeInTheDocument();
  localStorage.clear();
});

it("admin krokuje lhůtu po minutě v mezích 2–120", () => {
  const onLhuta = vi.fn();
  const { rerender } = render(<NastaveniUzivatele hlasitost={70} onHlasitost={vi.fn()} hlasitostChatu={50} onHlasitostChatu={vi.fn()} lhutaMinut={15} onLhuta={onLhuta} onZavrit={vi.fn()} />);
  expect(screen.getByTestId("lhuta-minut")).toHaveValue("15 min");
  fireEvent.click(screen.getByRole("button", { name: /více/i }));
  expect(onLhuta).toHaveBeenCalledWith(16);
  fireEvent.click(screen.getByRole("button", { name: /méně/i }));
  expect(onLhuta).toHaveBeenCalledWith(14);
  rerender(<NastaveniUzivatele hlasitost={70} onHlasitost={vi.fn()} hlasitostChatu={50} onHlasitostChatu={vi.fn()} lhutaMinut={2} onLhuta={onLhuta} onZavrit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /méně/i })).toBeDisabled();
  rerender(<NastaveniUzivatele hlasitost={70} onHlasitost={vi.fn()} hlasitostChatu={50} onHlasitostChatu={vi.fn()} lhutaMinut={120} onLhuta={onLhuta} onZavrit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /více/i })).toBeDisabled();
});

it("kolečko myši nad lhůtou krokuje po minutě", () => {
  const onLhuta = vi.fn();
  render(<NastaveniUzivatele hlasitost={70} onHlasitost={vi.fn()} hlasitostChatu={50} onHlasitostChatu={vi.fn()} lhutaMinut={15} onLhuta={onLhuta} onZavrit={vi.fn()} />);
  const pole = screen.getByTestId("lhuta-minut");
  fireEvent.wheel(pole, { deltaY: -100 });
  expect(onLhuta).toHaveBeenLastCalledWith(16);
  fireEvent.wheel(pole, { deltaY: 100 });
  expect(onLhuta).toHaveBeenLastCalledWith(14);
});

it("náhled ukazuje, od kolika minut je „Jsem tu!“ a zvonek; kolečko mění hlasitost po procentu", () => {
  const onHlasitost = vi.fn();
  render(<NastaveniUzivatele hlasitost={70} onHlasitost={onHlasitost} hlasitostChatu={50} onHlasitostChatu={vi.fn()} lhutaMinut={15} onLhuta={vi.fn()} onZavrit={vi.fn()} />);
  const nahled = screen.getByTestId("nahled-lhuty");
  expect(nahled).toHaveTextContent("od 14 min");
  expect(nahled).toHaveTextContent("od 10 min");
  expect(screen.queryByText(/platí pro celý večer/i)).not.toBeInTheDocument();
  fireEvent.wheel(screen.getByRole("slider", { name: /master volume/i }), { deltaY: -100 });
  expect(onHlasitost).toHaveBeenLastCalledWith(71);
  localStorage.clear();
});
