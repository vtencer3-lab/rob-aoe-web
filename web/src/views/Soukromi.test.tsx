import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Soukromi } from "./Soukromi.js";
import { KONTAKT_SMAZANI } from "../pravniCesty.js";

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

// src/db/events.ts: smazAkciBezVysledku smaže celou akci (kaskádou i zápasy,
// přihlášky a chat), když admin ukončí večer, který nemá žádný dohraný zápas
// se zapsaným vítězem. Tvrzení „zprávy zůstávají" bez tyhle výjimky je lež.
it("říká, že zprávy zůstávají jen po večeru s dohraným zápasem — jinak zmizí s celou akcí", () => {
  render(<Soukromi />);
  expect(screen.getByText(/zůstávají v databázi i po skončení večera/i)).toBeInTheDocument();
  expect(screen.getByText(/dohraným zápasem/i)).toBeInTheDocument();
  expect(screen.getByText(/smaže se celá akce/i)).toBeInTheDocument();
});

// src/db/chat.ts: upravZpravu drží text_puvodni (dohledatelné), ale
// smazZpravu dělá tvrdé DELETE — řádek zmizí bezezbytku, nic nezůstává.
it("rozlišuje upravenou zprávu (dohledatelná) od smazané (zmizí úplně)", () => {
  render(<Soukromi />);
  expect(screen.getByText(/upraví.*dohledání/is)).toBeInTheDocument();
  expect(screen.getByText(/smazaná zpráva.*zmizí úplně/is)).toBeInTheDocument();
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

it("u smazání účtu dává adresu, na kterou se dá napsat", () => {
  render(<Soukromi />);
  expect(screen.getByRole("link", { name: KONTAKT_SMAZANI })).toHaveAttribute(
    "href",
    `mailto:${KONTAKT_SMAZANI}`,
  );
});
