import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Soukromi } from "./Soukromi.js";

it("vykreslí zásady soukromí s odkazem zpátky na web", () => {
  render(<Soukromi />);
  expect(screen.getByRole("heading", { name: "Zásady soukromí" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /zpátky/i })).toBeInTheDocument();
  expect(document.title).toBe("Zásady soukromí — RobDiesALot");
});

// Tohle je věc, která lidi u „přihlášení Microsoftem“ mile překvapí — má být
// vidět, ne schovaná v odstavci o cookies.
it("zdůrazňuje, že se Microsoft token neukládá a scope je jen XboxLive.signin", () => {
  render(<Soukromi />);
  expect(screen.getByText(/XboxLive\.signin/)).toBeInTheDocument();
  expect(screen.getByText(/token.*neuklád/is)).toBeInTheDocument();
});

it("uvádí konkrétní délku života přihlašovací cookie, ne obecnou frázi", () => {
  render(<Soukromi />);
  expect(screen.getByText(/30 dní/)).toBeInTheDocument();
});

it("uvádí, že krátkodobá cookie z Microsoft přihlášení žije 10 minut", () => {
  render(<Soukromi />);
  expect(screen.getByText(/10 minut/)).toBeInTheDocument();
});

it("říká, že zprávy z chatu zůstávají v databázi i po skončení večera", () => {
  render(<Soukromi />);
  expect(screen.getByText(/zprávy/i)).toBeInTheDocument();
  expect(screen.getByText(/zůstávají/i)).toBeInTheDocument();
});

it("říká, že statistiky jsou z veřejného žebříčku hry, ne z něčeho soukromého", () => {
  render(<Soukromi />);
  expect(screen.getByText(/veřejn(ý|ého) žebříčk/i)).toBeInTheDocument();
});

it("nezmiňuje sledování, analytiku ani cookies třetích stran", () => {
  render(<Soukromi />);
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/analytik/i);
  expect(text).not.toMatch(/sledová/i);
  expect(text).not.toMatch(/třetí strana/i);
  expect(text).not.toMatch(/třetích stran/i);
});
