import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ZkusebniLista } from "./ZkusebniLista.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

it("nabídne přihlášení za každého zkušebního hráče", async () => {
  odpovez(true, { hraci: ["Pepa", "Jana"], admin: "76561198000000001" });
  render(<ZkusebniLista jaSteamId={null} />);

  const pepa = await screen.findByRole("link", { name: "Jsem Pepa" });
  expect(pepa).toHaveAttribute("href", "/api/dev/login?jmeno=Pepa");
  expect(screen.getByRole("link", { name: "Jsem Jana" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /nasypat 3/i })).toHaveAttribute(
    "href",
    "/api/dev/naplnit?pocet=3",
  );
});

// Bez tohohle je přihlášení za Pepu jednosměrka: vlastní session je pryč a
// Steam na localhostu zpátky nepomůže (návrat míří na veřejnou adresu).
it("nabídne cestu zpět na vlastní účet, ale ne když už na něm jsem", async () => {
  odpovez(true, { hraci: [], admin: "76561198000000001" });
  const { rerender } = render(<ZkusebniLista jaSteamId="test:pepa" />);
  expect(await screen.findByRole("link", { name: /zpět na svůj účet/i })).toHaveAttribute(
    "href",
    "/api/dev/login?steamId=76561198000000001",
  );

  rerender(<ZkusebniLista jaSteamId="76561198000000001" />);
  await waitFor(() =>
    expect(screen.queryByRole("link", { name: /zpět na svůj účet/i })).not.toBeInTheDocument(),
  );
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
