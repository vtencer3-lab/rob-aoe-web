import { describe, expect, it } from "vitest";
import { assignSeats, generatePassword, lobbyName, seatCount } from "./composition.js";

const p = (steamId: string, odehranoHer: number | null) => ({ steamId, odehranoHer });

describe("seatCount", () => {
  it("zná velikost obou formátů", () => {
    expect(seatCount("1v1")).toBe(2);
    expect(seatCount("coop_kings_2v2")).toBe(4);
  });
});

describe("assignSeats — 1v1", () => {
  it("dá každému jiný tým a jinou barvu", () => {
    const seats = assignSeats("1v1", [p("A", 10), p("B", 50)]);
    expect(seats.map((s) => [s.steamId, s.tym, s.barva])).toEqual([
      ["A", 1, 1],
      ["B", 2, 2],
    ]);
  });
});

describe("assignSeats — Coop Kings", () => {
  it("dá dvojici stejnou barvu i tým a soupeřům druhou", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 1), p("B", 2), p("C", 3), p("D", 4)]);
    expect(seats.map((s) => [s.steamId, s.tym, s.barva])).toEqual([
      ["A", 1, 1],
      ["B", 1, 1],
      ["C", 2, 2],
      ["D", 2, 2],
    ]);
  });

  it("spoluhráči sdílí barvu, soupeři ne", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 1), p("B", 2), p("C", 3), p("D", 4)]);
    expect(seats[0]!.barva).toBe(seats[1]!.barva);
    expect(seats[2]!.barva).toBe(seats[3]!.barva);
    expect(seats[0]!.barva).not.toBe(seats[2]!.barva);
  });
});

describe("assignSeats — host", () => {
  it("hostem je hráč s nejvíc odehranými hrami", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 10), p("B", 900), p("C", 30), p("D", 40)]);
    expect(seats.filter((s) => s.jeHost).map((s) => s.steamId)).toEqual(["B"]);
  });

  it("při shodě vybere prvního", () => {
    const seats = assignSeats("1v1", [p("A", 5), p("B", 5)]);
    expect(seats.find((s) => s.jeHost)!.steamId).toBe("A");
  });

  it("neznámý počet her se počítá jako nula", () => {
    const seats = assignSeats("1v1", [p("A", null), p("B", 1)]);
    expect(seats.find((s) => s.jeHost)!.steamId).toBe("B");
  });

  it("host je vždy právě jeden", () => {
    const seats = assignSeats("coop_kings_2v2", [p("A", 1), p("B", 1), p("C", 1), p("D", 1)]);
    expect(seats.filter((s) => s.jeHost)).toHaveLength(1);
  });
});

describe("assignSeats — chyby", () => {
  it("odmítne špatný počet hráčů", () => {
    expect(() => assignSeats("1v1", [p("A", 1)])).toThrow(/2 hráče/);
    expect(() => assignSeats("coop_kings_2v2", [p("A", 1), p("B", 1)])).toThrow(/4 hráče/);
  });

  it("odmítne stejného hráče dvakrát", () => {
    expect(() => assignSeats("1v1", [p("A", 1), p("A", 1)])).toThrow(/dvakrát/);
  });
});

describe("lobbyName", () => {
  it("doplní nulu na dvě číslice", () => {
    expect(lobbyName(7)).toBe("ROB-07");
    expect(lobbyName(12)).toBe("ROB-12");
    expect(lobbyName(103)).toBe("ROB-103");
  });
});

describe("generatePassword", () => {
  it("má osm znaků", () => {
    expect(generatePassword()).toHaveLength(8);
  });

  it("neobsahuje zaměnitelné znaky", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePassword()).not.toMatch(/[ilo01]/);
    }
  });

  it("je deterministické při daném generátoru", () => {
    expect(generatePassword(() => 0)).toBe("aaaaaaaa");
  });

  it("ošetří generátor vracející hraniční hodnotu 1", () => {
    const heslo = generatePassword(() => 1);
    expect(heslo).toHaveLength(8);
    expect(heslo).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  });

  it("výchozí generátor vrací jen znaky z abecedy", () => {
    const heslo = generatePassword();
    expect(heslo).toHaveLength(8);
    expect(heslo).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{8}$/);
  });
});
