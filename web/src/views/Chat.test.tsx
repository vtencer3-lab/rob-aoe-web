import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { Chat } from "./Chat.js";
import { zapomenEmoty } from "../emoty.js";

vi.mock("../api.js", () => ({
  api: { emoty: vi.fn().mockResolvedValue({ emoty: [{ jmeno: "DinkDonk", url: "https://cdn.7tv.app/emote/dink", siroky: false, nulovaSirka: false }, { jmeno: "KEKW", url: "https://cdn.7tv.app/emote/kekw", siroky: false, nulovaSirka: false }] }) },
}));

afterEach(() => zapomenEmoty());

// 7TV emoty a taunty (uživatel 13. 9. 2026): samotný vykřičník admina je
// DinkDonk (větší), slovo se jménem emotu je obrázek, číslo tauntu je taunt.
it("vykřičník admina je DinkDonk, KEKW je obrázek, 11 je taunt Laugh", async () => {
  const zpravy: NonNullable<ZapasView["zpravy"]> = [
    { id: 1, steamId: "76561198147631465", jmeno: "Rob", jeAdmin: true, barva: null, tym: null, text: "!", poslano: "2026-09-12T12:01:00.000Z" },
    { id: 2, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3, tym: 1, text: "to je KEKW fakt", poslano: "2026-09-12T12:02:00.000Z" },
    { id: 3, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3, tym: 1, text: "11", poslano: "2026-09-12T12:03:00.000Z" },
  ];
  render(<Chat ja="a" onOdeslat={vi.fn()} zapas={zapas(zpravy)} />);
  const dink = await screen.findByAltText("DinkDonk");
  expect(dink).toHaveClass("velky");
  expect(dink).toHaveAttribute("src", "https://cdn.7tv.app/emote/dink/3x.webp");
  expect(screen.getByAltText("KEKW")).toHaveAttribute("src", "https://cdn.7tv.app/emote/kekw/2x.webp");
  expect(screen.getByTestId("taunt")).toHaveTextContent("11 Laugh");
});

const zapas = (zpravy: ZapasView["zpravy"]): ZapasView => ({
  id: 7,
  poradi: 2,
  stav: "bezi",
  nazevLobby: "ROB-02",
  heslo: "",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  vitez: null,
  ucastnici: [],
  zpravy,
});

it("kreslí zprávy s barvou slotu, admini svou barvou a září", () => {
  render(
    <Chat
      ja="a"
      onOdeslat={vi.fn()}
      zapas={zapas([
        { id: 1, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3, tym: 1, text: "jdu", poslano: "2026-09-12T12:00:00.000Z" },
        { id: 2, steamId: "76561198147631465", jmeno: "Rob", jeAdmin: true, barva: null, tym: null, text: "zakládám", poslano: "2026-09-12T12:01:00.000Z" },
        { id: 3, steamId: "x", jmeno: "Jiný admin", jeAdmin: true, barva: null, tym: null, text: "ok", poslano: "2026-09-12T12:02:00.000Z" },
      ])}
    />,
  );
  const radky = screen.getAllByTestId("zprava");
  expect(radky).toHaveLength(3);
  expect(radky[0]).toHaveClass("moje");
  expect(radky[0]!.querySelector(".autor")).toHaveClass("barva-3");
  expect(radky[1]!.querySelector(".autor")).toHaveClass("admin", "rob");
  expect(radky[2]!.querySelector(".autor")).toHaveClass("admin", "admin-jiny");
  expect(radky[1]).toHaveTextContent("zakládám");
});

// Důležitá zpráva: admin + vykřičník na začátku → tučně bez vykřičníku;
// u hráče vykřičník nic nedělá. Admin při psaní vidí poznámku.
it("admin s vykřičníkem píše důležitou zprávu — tučně, s poznámkou; hráči vykřičník nic nedělá", () => {
  const zpravy: NonNullable<ZapasView["zpravy"]> = [
    { id: 1, steamId: "76561198147631465", jmeno: "Rob", jeAdmin: true, barva: null, tym: null, text: "!go", poslano: "2026-09-12T12:01:00.000Z" },
    { id: 2, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3, tym: 1, text: "!ok", poslano: "2026-09-12T12:02:00.000Z" },
  ];
  render(<Chat ja="76561198147631465" jaAdmin onOdeslat={vi.fn()} zapas={zapas(zpravy)} />);
  const texty = screen.getAllByTestId("zprava").map((li) => li.querySelector(".text")!);
  expect(texty[0]).toHaveClass("dulezita");
  expect(texty[0]).toHaveTextContent(/^go$/);
  expect(texty[1]).not.toHaveClass("dulezita");
  expect(texty[1]).toHaveTextContent("!ok");
  expect(screen.queryByTestId("dulezita-poznamka")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: /zpráva do chatu/i }), { target: { value: "!pozor" } });
  expect(screen.getByTestId("dulezita-poznamka")).toBeInTheDocument();
});

it("prázdný chat vyzve k první zprávě a prázdnou neodešle", () => {
  const onOdeslat = vi.fn();
  render(<Chat ja="a" onOdeslat={onOdeslat} zapas={zapas([])} />);
  expect(screen.getByText(/zatím ticho/i)).toBeInTheDocument();
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i });
  expect(screen.getByRole("button", { name: /odeslat/i })).toBeDisabled();
  fireEvent.change(pole, { target: { value: "   " } });
  fireEvent.submit(pole.closest("form")!);
  expect(onOdeslat).not.toHaveBeenCalled();
});

it("Enter odešle oříznutý text a pole vyprázdní", async () => {
  const onOdeslat = vi.fn(async () => undefined);
  render(<Chat ja="a" onOdeslat={onOdeslat} zapas={zapas([])} />);
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i });
  fireEvent.change(pole, { target: { value: "  za chvíli  " } });
  fireEvent.submit(pole.closest("form")!);
  await vi.waitFor(() => expect(onOdeslat).toHaveBeenCalledWith("za chvíli", null));
  await vi.waitFor(() => expect(pole).toHaveValue(""));
});

it("admin má u zprávy křížek, hráč ne; debug nabídne přepnutí autora", () => {
  const onSmazat = vi.fn();
  const zpravy = [{ id: 1, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3 as const, tym: 1 as const, text: "jdu", poslano: "2026-09-12T12:00:00.000Z" }];
  const { rerender } = render(<Chat ja="a" onOdeslat={vi.fn()} zapas={zapas(zpravy)} />);
  expect(screen.queryByRole("button", { name: /smazat zprávu/i })).not.toBeInTheDocument();
  rerender(<Chat ja="rob" onOdeslat={vi.fn()} onSmazat={onSmazat} ladeni zapas={zapas(zpravy)} />);
  fireEvent.click(screen.getByRole("button", { name: /smazat zprávu/i }));
  expect(onSmazat).toHaveBeenCalledWith(1);
  fireEvent.change(screen.getByRole("combobox", { name: /debug: autor/i }), { target: { value: "76561198147631465" } });
  expect(screen.getByTestId("zprava").querySelector(".autor")).toHaveClass("admin", "rob");
  expect(screen.getByTestId("zprava")).toHaveTextContent("Rob");
});

it("šipka nahoru v prázdném poli načte poslední vlastní zprávu, Uložit ji pošle k úpravě", async () => {
  const onUpravit = vi.fn(async () => undefined);
  const zpravy = [
    { id: 1, steamId: "a", jmeno: "Já", jeAdmin: false, barva: 1 as const, tym: 1 as const, text: "prvni", poslano: "2026-09-12T12:00:00.000Z" },
    { id: 2, steamId: "b", jmeno: "Jiný", jeAdmin: false, barva: 2 as const, tym: 2 as const, text: "cizi", poslano: "2026-09-12T12:01:00.000Z" },
    { id: 3, steamId: "a", jmeno: "Já", jeAdmin: false, barva: 1 as const, tym: 1 as const, text: "moje posledni", poslano: "2026-09-12T12:02:00.000Z", upraveno: true },
  ];
  render(<Chat ja="a" onOdeslat={vi.fn()} onUpravit={onUpravit} zapas={zapas(zpravy)} />);
  expect(screen.getAllByText("(editováno)")).toHaveLength(1);
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i });
  fireEvent.keyDown(pole, { key: "ArrowUp" });
  expect(pole).toHaveValue("moje posledni");
  expect(screen.getByRole("button", { name: /uložit/i })).toBeInTheDocument();
  fireEvent.change(pole, { target: { value: "opravena" } });
  fireEvent.submit(pole.closest("form")!);
  await vi.waitFor(() => expect(onUpravit).toHaveBeenCalledWith(3, "opravena"));
  await vi.waitFor(() => expect(pole).toHaveValue(""));
});

it("admini mají twitch odznak: Rob vysílající, Jouki moderátor", () => {
  const zpravy = [
    { id: 1, steamId: "76561198147631465", jmeno: "Rob", jeAdmin: true, barva: null, tym: null, text: "a", poslano: "2026-09-12T12:00:00.000Z" },
    { id: 2, steamId: "76561198014056480", jmeno: "Jouki", jeAdmin: true, barva: null, tym: null, text: "b", poslano: "2026-09-12T12:01:00.000Z" },
  ];
  render(<Chat ja="x" onOdeslat={vi.fn()} zapas={zapas(zpravy)} />);
  expect(screen.getByTestId("twitch-broadcaster")).toBeInTheDocument();
  expect(screen.getByTestId("twitch-moderator")).toBeInTheDocument();
});


// Odpověď na zprávu (uživatel 14. 9. 2026): ↩ u zprávy otevře pruh s náhledem,
// odeslání nese id původní; náhled u odpovědi skočí na původní a ta blikne.
it("odpověď: pruh nad polem, odeslání s id původní, klik na náhled bliká", async () => {
  const onOdeslat = vi.fn().mockResolvedValue(undefined);
  const zpravy: NonNullable<ZapasView["zpravy"]> = [
    { id: 5, steamId: "b", jmeno: "Pepa", jeAdmin: false, barva: 2, tym: 2, text: "jdeme?", poslano: "2026-09-12T12:00:00.000Z" },
    { id: 6, steamId: "a", jmeno: "Hráč", jeAdmin: false, barva: 3, tym: 1, text: "jo", poslano: "2026-09-12T12:01:00.000Z", odpovedNa: { id: 5, jmeno: "Pepa", text: "jdeme?" } },
  ];
  render(<Chat ja="a" onOdeslat={onOdeslat} zapas={zapas(zpravy)} />);
  fireEvent.click(screen.getByRole("button", { name: /odpovědět na zprávu pepa/i }));
  expect(screen.getByTestId("odpoved-lista")).toHaveTextContent("Odpověď pro Pepa");
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i });
  fireEvent.change(pole, { target: { value: "za chvíli" } });
  fireEvent.submit(pole.closest("form")!);
  await vi.waitFor(() => expect(onOdeslat).toHaveBeenCalledWith("za chvíli", 5));
  await vi.waitFor(() => expect(screen.queryByTestId("odpoved-lista")).not.toBeInTheDocument());
  // Náhled u odpovědi: skok na původní + bliknutí.
  Element.prototype.scrollIntoView = vi.fn();
  fireEvent.click(screen.getByTestId("odpoved-na"));
  await vi.waitFor(() => expect(screen.getAllByTestId("zprava")[0]).toHaveClass("blika"));
});

// Našeptávání (po vzoru UnityChat): Tab vloží první emote + mezeru, další
// Tab cykluje, Escape zavře; @ se otevře při psaní a Enter jen zavře.
it("Tab dokončí emote a cykluje, @ nabídne hráče při psaní", async () => {
  const onOdeslat = vi.fn().mockResolvedValue(undefined);
  const sHracem = { ...zapas([]), ucastnici: [{ steamId: "a", alias: "Hráč", steamName: null, tym: 1 as const, barva: 3 as const, civ: null, jeHost: false, poradi: 0, kliknulPripojit: null }] };
  render(<Chat ja="a" onOdeslat={onOdeslat} zapas={sHracem} />);
  await screen.findByRole("textbox", { name: /zpráva do chatu/i });
  const pole = screen.getByRole("textbox", { name: /zpráva do chatu/i }) as HTMLInputElement;
  // Emoty ze sady (mock api): DinkDonk, KEKW — čekat, až se načtou.
  fireEvent.change(pole, { target: { value: "hele ke" } });
  pole.setSelectionRange(7, 7);
  // Emoty se načítají asynchronně: napřed počkat, až sada dorazí (obrázek v jiné zprávě není, tak přes Tab).
  await vi.waitFor(() => {
    fireEvent.keyDown(pole, { key: "Tab" });
    expect(pole.value).toBe("hele KEKW ");
  });
  expect(screen.getByTestId("naseptavac")).toBeInTheDocument();
  fireEvent.keyDown(pole, { key: "Escape" });
  expect(screen.queryByTestId("naseptavac")).not.toBeInTheDocument();
  fireEvent.change(pole, { target: { value: "hele KEKW @h" } });
  expect(screen.getByTestId("naseptavac")).toHaveTextContent("@Hráč");
  fireEvent.keyDown(pole, { key: "Enter" });
  expect(pole.value).toBe("hele KEKW @Hráč ");
  expect(onOdeslat).not.toHaveBeenCalled();
});
