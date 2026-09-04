import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ZkusebniLista } from "./ZkusebniLista.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

const INFO = {
  hraci: ["Pepa", "Jana"],
  reziser: { jmeno: "Rezie", steamId: "test:rezie" },
  skutecni: [{ steamId: "76561198000000001", alias: "Trokner" }],
  admin: "76561198000000001",
};

function odpovez(ok: boolean, telo: unknown = {}): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => telo }) as unknown as Response),
  );
}

// Na veřejné adrese server /api/dev/* zavírá. Lišta, která by tam zůstala
// viset, by nabízela odkazy vedoucí na 404 — a hlavně by komukoliv říkala,
// že tudy vede cesta dovnitř.
it("bez otevřených dveří nevykreslí vůbec nic", async () => {
  odpovez(false);
  const { container } = render(<ZkusebniLista jaSteamId={null} />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});

it("nabídne přihlášení za každého zkušebního hráče i za režiséra", async () => {
  odpovez(true, INFO);
  render(<ZkusebniLista jaSteamId={null} />);

  expect(await screen.findByRole("link", { name: "Jsem Pepa" })).toHaveAttribute(
    "href",
    "/api/dev/login?jmeno=Pepa",
  );
  expect(screen.getByRole("link", { name: "Jsem Rezie" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /nasypat 3/i })).toHaveAttribute(
    "href",
    "/api/dev/naplnit?pocet=3",
  );
});

// Bez tohohle je přihlášení za Pepu jednosměrka: vlastní session je pryč a
// Steam na localhostu zpátky nepomůže.
it("nabídne cestu zpět na skutečný účet, ale ne když už na něm jsem", async () => {
  odpovez(true, INFO);
  const { rerender } = render(<ZkusebniLista jaSteamId="test:pepa" />);
  expect(await screen.findByRole("link", { name: "Jsem Trokner" })).toHaveAttribute(
    "href",
    "/api/dev/login?steamId=76561198000000001",
  );

  rerender(<ZkusebniLista jaSteamId="76561198000000001" />);
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: "Jsem Trokner" })).not.toBeInTheDocument(),
  );
});

// Jádro toho, proč lišta vznikla: dokud režii drží vlastní účet, nejde si
// vyzkoušet pohled obyčejného hráče — panel režie svítí pořád.
it("ukáže, kdo drží režii, a nabídne její přenos oběma směry", async () => {
  odpovez(true, INFO);
  render(<ZkusebniLista jaSteamId="76561198000000001" />);

  expect(await screen.findByText(/Režii má: Trokner/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Režii dej účtu Rezie/ })).toHaveAttribute(
    "href",
    "/api/dev/rezie?steamId=test%3Arezie",
  );
  expect(screen.getByRole("link", { name: /Režii dej tomuhle účtu/ })).toHaveAttribute(
    "href",
    "/api/dev/rezie",
  );
});

it("bez admina si nikoho nevymýšlí", async () => {
  odpovez(true, { ...INFO, admin: null });
  render(<ZkusebniLista jaSteamId={null} />);
  expect(await screen.findByText(/Režii má: nikdo/)).toBeInTheDocument();
});

it("rozbité dveře stránku neshodí", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("síť spadla");
    }),
  );
  const { container } = render(<ZkusebniLista jaSteamId={null} />);
  await waitFor(() => expect(container).toBeEmptyDOMElement());
});
