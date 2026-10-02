import { isValidElement, type ReactElement } from "react";
import { expect, it } from "vitest";
import { ROZBOR } from "../../../src/shared/diplomacie/fixtures.js";
import type { ScenarVerze } from "../../../src/shared/diplomacie/typy.js";
import type { AkceStavPayload } from "../../../src/shared/types.js";
import { stavDiplo, VERZE, ZAPAS } from "../diplomacie/fixtury.js";
import { KartaRole } from "../diplomacie/KartaRole.js";
import { PultGm } from "../diplomacie/PultGm.js";
import { StazeniScenare } from "../diplomacie/StazeniScenare.js";
import { rezimKlienta } from "./index.js";

// Klasický večer nic do obrazovek jádra nepřidává; chybějící mód (starší
// snímek stavu bez `rezim`) je totéž co klasický.
it("klasický večer ani chybějící mód nic nepřidávají", () => {
  expect(rezimKlienta(undefined)).toEqual({});
  expect(rezimKlienta("klasicky")).toEqual({});
});

it("Diplomacie označí šedý slot jako GM, ostatní nechá bez štítku", () => {
  const rk = rezimKlienta("diplomacie");
  expect(rk.popisSlotu?.(7)).toBe("GM");
  expect(rk.popisSlotu?.(1)).toBeNull();
});

// Štítek u názvu v panelu akce dodává mód; klasický večer háček nemá (viz výš).
it("Diplomacie dodá panelu akce svůj štítek", () => {
  expect(rezimKlienta("diplomacie").stitek?.()).toBe("Diplomacie");
});

// Panel Nastavení lobby ukazuje v Custom Scenario podmínky vítězství z
// rozboru aktivní verze; bez verze (nebo u starého rozboru bez nich) nic.
it("Diplomacie dodá panelu nastavení popis vítězství z aktivní verze", () => {
  const rk = rezimKlienta("diplomacie");
  const aktivni: ScenarVerze = { id: 1, jmenoSouboru: "LLC.aoe2scenario", jmenoHry: "JIN_DIPLO_1.aoe2scenario", nahrano: "", nahralJmeno: "Jin", poznamka: null, aktivni: true, rozbor: ROZBOR, chybaRozboru: null, minimapaOtisk: null, minimapaVlastni: false, sonda: null };
  const stav = (a: ScenarVerze | null): AkceStavPayload => ({ akce: null, prihlaseni: [], zapasy: [], rezim: { id: "diplomacie", data: { aktivni: a, verze: {}, zapasy: [] } } });
  expect(rk.nastaveniScenare?.(stav(aktivni))).toEqual({ vitezstvi: "Vlastní podmínky scénáře" });
  expect(rk.nastaveniScenare?.(stav(null))).toEqual({ vitezstvi: null });
  expect(rk.nastaveniScenare?.(stav({ ...aktivni, rozbor: { ...ROZBOR, vitezstvi: undefined } }))).toEqual({ vitezstvi: null });
  // Snímek bez dat módu (starší stav) — nic k ukázání.
  expect(rk.nastaveniScenare?.({ akce: null, prihlaseni: [], zapasy: [] })).toBeNull();
});

// Karta role jen přihlášenému účastníkovi a jen se snímkem módu; veřejný
// řádek stačí snímek módu, divák může být anonym.
it("Diplomacie dodá kartu role a veřejný řádek jen se snímkem módu", () => {
  const rk = rezimKlienta("diplomacie");
  const hlidej = async () => {};
  const bezModu: AkceStavPayload = { akce: null, prihlaseni: [], zapasy: [] };
  const sModem: AkceStavPayload = { ...bezModu, rezim: { id: "diplomacie", data: { aktivni: null, verze: {}, zapasy: [] } } };
  expect(rk.kartaHrace?.({ zapas: ZAPAS, stav: bezModu, ja: "h2", hlidej })).toBeNull();
  expect(rk.kartaHrace?.({ zapas: ZAPAS, stav: sModem, ja: null, hlidej })).toBeNull();
  expect(isValidElement(rk.kartaHrace?.({ zapas: ZAPAS, stav: sModem, ja: "h2", hlidej }))).toBe(true);
  expect(rk.verejnyZapas?.({ zapas: ZAPAS, stav: bezModu, ja: null, hlidej })).toBeNull();
  expect(isValidElement(rk.verejnyZapas?.({ zapas: ZAPAS, stav: sModem, ja: null, hlidej }))).toBe(true);
});

// GM zápasu dostane místo karty role pult (spec §8.1); ostatní kartu.
it("Diplomacie dá GM zápasu pult, ostatním kartu role", () => {
  const rk = rezimKlienta("diplomacie");
  const hlidej = async () => {};
  const stav: AkceStavPayload = { akce: null, prihlaseni: [], zapasy: [], rezim: { id: "diplomacie", data: stavDiplo("priprava", []) } };
  expect((rk.kartaHrace?.({ zapas: ZAPAS, stav, ja: "h7", hlidej }) as ReactElement).type).toBe(PultGm);
  expect((rk.kartaHrace?.({ zapas: ZAPAS, stav, ja: "h2", hlidej }) as ReactElement).type).toBe(KartaRole);
});

// Host v kroku „Zakládáš!“ dostane stažení verze, kterou zápas hraje (spec
// §5.3) — jen se snímkem módu a jen přihlášený.
it("Diplomacie dá hostovi stažení verze zápasu", () => {
  const rk = rezimKlienta("diplomacie");
  const hlidej = async () => {};
  const bezModu: AkceStavPayload = { akce: null, prihlaseni: [], zapasy: [] };
  const stav: AkceStavPayload = { ...bezModu, rezim: { id: "diplomacie", data: stavDiplo("priprava", []) } };
  expect(rk.krokHosta?.({ zapas: ZAPAS, stav: bezModu, ja: "h7", hlidej })).toBeNull();
  expect(rk.krokHosta?.({ zapas: ZAPAS, stav, ja: null, hlidej })).toBeNull();
  const krok = rk.krokHosta?.({ zapas: ZAPAS, stav, ja: "h7", hlidej }) as ReactElement;
  expect(krok.type).toBe(StazeniScenare);
  expect(krok.props).toEqual({ verze: VERZE, ja: "h7" });
});
