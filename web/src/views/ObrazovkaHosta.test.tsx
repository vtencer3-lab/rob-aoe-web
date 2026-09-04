import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import type { ZapasView } from "../../../src/shared/types.js";
import { ObrazovkaHosta } from "./ObrazovkaHosta.js";

const zaklad: ZapasView = {
  id: 1,
  poradi: 7,
  format: "coop_kings_2v2",
  stav: "vyhlaseny",
  nazevLobby: "ROB-07",
  heslo: "k7rm2xq9",
  lobbyId: null,
  joinUri: null,
  spectatorUri: null,
  viteznyTym: null,
  hostPotvrdil: null,
  ucastnici: [
    { steamId: "ja", alias: "TenceR", tym: 1, barva: 1, jeHost: true, kliknulPripojit: null },
    { steamId: "b", alias: "Pepa_CZ", tym: 1, barva: 1, jeHost: false, kliknulPripojit: null },
    { steamId: "c", alias: "Marek", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
    { steamId: "d", alias: "Lukas", tym: 2, barva: 2, jeHost: false, kliknulPripojit: null },
  ],
};

it("diktuje nastavení, které jinak lidi kazí", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByText(/veřejná/i)).toBeInTheDocument();
  expect(screen.getByText(/allow spectators/i)).toBeInTheDocument();
  expect(screen.getByText("ROB-07")).toBeInTheDocument();
  expect(screen.getByText("k7rm2xq9")).toBeInTheDocument();
});

it("ukáže zrcadlo lobby se všemi barvami a týmy", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  const radky = screen.getAllByTestId("radek-lobby");
  expect(radky).toHaveLength(4);
  expect(radky[0]).toHaveTextContent("modrá");
  expect(radky[2]).toHaveTextContent("červená");
});

it("dokud není vložený odkaz, nejde potvrdit", () => {
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /sedí to/i })).toBeDisabled();
});

it("po vložení odkazu jde potvrdit", () => {
  const sLobby = { ...zaklad, stav: "lobby_otevrena", lobbyId: "234230181" };
  render(<ObrazovkaHosta zapas={sLobby} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByRole("button", { name: /sedí to/i })).toBeEnabled();
});

it("odešle vložený odkaz", async () => {
  const onVlozitOdkaz = vi.fn();
  render(<ObrazovkaHosta zapas={zaklad} ja="ja" onVlozitOdkaz={onVlozitOdkaz} onPotvrdit={vi.fn()} />);

  await userEvent.type(screen.getByLabelText(/odkaz/i), "aoe2de://0/234230181");
  await userEvent.click(screen.getByRole("button", { name: /uložit odkaz/i }));

  expect(onVlozitOdkaz).toHaveBeenCalledWith(1, "aoe2de://0/234230181");
});

it("po potvrzení to dá najevo", () => {
  const potvrzeny = { ...zaklad, stav: "lobby_otevrena", lobbyId: "234230181", hostPotvrdil: "2026-09-03T12:00:00.000Z" };
  render(<ObrazovkaHosta zapas={potvrzeny} ja="ja" onVlozitOdkaz={vi.fn()} onPotvrdit={vi.fn()} />);
  expect(screen.getByText(/potvrzeno/i)).toBeInTheDocument();
});
