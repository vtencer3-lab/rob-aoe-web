import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { jeSlozkaScenaru, nactiSlozku, ulozDoHry, umiSlozkuHry } from "./slozkaHry.js";
import { odpovedSeSouborem, PodvrzenaSlozka, podvrhniProhlizec, zavrenyDialog, type PodvrzenyProhlizec } from "./slozkaHryTest.js";

const SOUBOR = { url: "/api/diplo/scenar/3/soubor", jmeno: "JIN_DIPLO_3.aoe2scenario" };
const JA = "76561198014056480";

let prohlizec: PodvrzenyProhlizec;
beforeEach(() => {
  prohlizec = podvrhniProhlizec();
});
afterEach(() => {
  prohlizec.uklid();
  vi.restoreAllMocks();
});

const zapsano = (slozka: PodvrzenaSlozka) => slozka.soubory.get(SOUBOR.jmeno);

// Chrome a Edge na počítači složky umí; Firefox a Safari ne. Telefon se
// vynechává, i když API má — hra na něm není.
it("umiSlozkuHry: jen prohlížeč s výběrem složky a ne telefon", () => {
  expect(umiSlozkuHry()).toBe(true);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 14) Chrome/132 Mobile Safari/537.36");
  expect(umiSlozkuHry()).toBe(false);
  vi.restoreAllMocks();
  prohlizec.uklid();
  prohlizec = podvrhniProhlizec({ sVyberem: false });
  expect(umiSlozkuHry()).toBe(false);
});

it("složku scénářů pozná podle jména, na velikosti písmen nezáleží", () => {
  expect(jeSlozkaScenaru(new PodvrzenaSlozka("scenario").uchyt)).toBe(true);
  expect(jeSlozkaScenaru(new PodvrzenaSlozka("Scenario").uchyt)).toBe(true);
  expect(jeSlozkaScenaru(new PodvrzenaSlozka("Downloads").uchyt)).toBe(false);
});

it("poprvé nechá vybrat složku, soubor stáhne, zapíše pod jeho jménem a složku si zapamatuje", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "ulozeno", slozka: "scenario" });
  expect(prohlizec.vyber).toHaveBeenCalledWith({ id: "aoe2-scenare", mode: "readwrite" });
  expect(prohlizec.fetch).toHaveBeenCalledWith(SOUBOR.url);
  expect(slozka.getFileHandle).toHaveBeenCalledWith("JIN_DIPLO_3.aoe2scenario", { create: true });
  expect(zapsano(slozka)).toBe(prohlizec.obsah);
  expect(await nactiSlozku(JA)).toBe(slozka);
});

// Příště stačí jedno kliknutí: žádný dialog, existující soubor se přepíše.
it("podruhé zapíše do zapamatované složky bez dialogu a starou kopii přepíše", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  await ulozDoHry(JA, SOUBOR);
  const novaVerze = new Blob(["nová verze"]);
  prohlizec.fetch.mockResolvedValueOnce(odpovedSeSouborem(novaVerze));
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "ulozeno", slozka: "scenario" });
  expect(prohlizec.vyber).toHaveBeenCalledTimes(1);
  expect(zapsano(slozka)).toBe(novaVerze);
});

// Složka scénářů se jmenuje podle účtu ve hře — cizí hráč na témže
// prohlížeči nesmí zapsat do složky toho předchozího.
it("zapamatovaná složka patří hráči, ne prohlížeči", async () => {
  prohlizec.vyber.mockResolvedValueOnce(new PodvrzenaSlozka("scenario"));
  await ulozDoHry(JA, SOUBOR);
  expect(await nactiSlozku("xbox:2533274952064423")).toBeNull();
});

// Po restartu prohlížeče je povolení „zeptat se“ — prohlížeč ukáže dotaz
// jako u mikrofonu. Ptá se před stažením, dokud ještě platí kliknutí.
it("když povolení vyprší, požádá o něj; po souhlasu zapíše", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  await ulozDoHry(JA, SOUBOR);
  slozka.povoleni = "prompt";
  prohlizec.fetch.mockClear();
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "ulozeno", slozka: "scenario" });
  expect(slozka.requestPermission).toHaveBeenCalledWith({ mode: "readwrite" });
  expect(slozka.requestPermission.mock.invocationCallOrder[0]!).toBeLessThan(prohlizec.fetch.mock.invocationCallOrder[0]!);
});

it("odmítnuté povolení nic nestahuje ani nezapisuje a nabídne obyčejné stažení", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  await ulozDoHry(JA, SOUBOR);
  slozka.povoleni = "prompt";
  slozka.odpovedHrace = "denied";
  prohlizec.fetch.mockClear();
  slozka.getFileHandle.mockClear();
  const vysledek = await ulozDoHry(JA, SOUBOR);
  expect(vysledek).toEqual({ stav: "chyba", text: expect.stringMatching(/nedostal povolení.*stáhnout obyčejně/) });
  expect(prohlizec.fetch).not.toHaveBeenCalled();
  expect(slozka.getFileHandle).not.toHaveBeenCalled();
});

it("zavřený dialog výběru není chyba, jen se nic nestane", async () => {
  prohlizec.vyber.mockRejectedValueOnce(zavrenyDialog());
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "nevybrano" });
  expect(prohlizec.fetch).not.toHaveBeenCalled();
  expect(await nactiSlozku(JA)).toBeNull();
});

// Pojistka: do složky Stažené se scénář hře neobjeví. Nezapíše se nic,
// dokud hráč nepotvrdí.
it("složku s jiným jménem vrátí k potvrzení a nezapíše do ní", async () => {
  const stazene = new PodvrzenaSlozka("Downloads");
  prohlizec.vyber.mockResolvedValueOnce(stazene);
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "cizi-slozka", slozka: stazene });
  expect(stazene.soubory.size).toBe(0);
  expect(await nactiSlozku(JA)).toBeNull();
  // Potvrzená se použije bez dalšího dialogu a zapamatuje se.
  expect(await ulozDoHry(JA, SOUBOR, { potvrzena: stazene.uchyt })).toEqual({ stav: "ulozeno", slozka: "Downloads" });
  expect(prohlizec.vyber).toHaveBeenCalledTimes(1);
  expect(await nactiSlozku(JA)).toBe(stazene);
});

it("„změnit složku“ otevře dialog, i když je složka zapamatovaná", async () => {
  const stara = new PodvrzenaSlozka("scenario");
  const nova = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(stara).mockResolvedValueOnce(nova);
  await ulozDoHry(JA, SOUBOR);
  await ulozDoHry(JA, SOUBOR, { vybratZnovu: true });
  expect(prohlizec.vyber).toHaveBeenCalledTimes(2);
  expect(nova.soubory.has(SOUBOR.jmeno)).toBe(true);
  expect(await nactiSlozku(JA)).toBe(nova);
});

// Přeinstalovaná hra nebo odpojený disk: úchyt je k ničemu, tak ať se
// příště rovnou vybírá znovu.
it("zmizelou složku zapomene a řekne, ať ji hráč vybere znovu", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  await ulozDoHry(JA, SOUBOR);
  slozka.chybaZapisu = "NotFoundError";
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "chyba", text: expect.stringMatching(/už neexistuje/) });
  expect(await nactiSlozku(JA)).toBeNull();
});

it("když se soubor nestáhne, do složky se nesahá", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  prohlizec.fetch.mockResolvedValueOnce(odpovedSeSouborem(new Blob([]), 404));
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "chyba", text: expect.stringMatching(/nepodařilo stáhnout.*404/) });
  expect(slozka.getFileHandle).not.toHaveBeenCalled();
});

it("jiná chyba zápisu skončí hláškou s nabídkou obyčejného stažení, složka zůstává", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  slozka.chybaZapisu = "NoModificationAllowedError";
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "chyba", text: expect.stringMatching(/Zápis do složky se nepovedl.*stáhnout obyčejně/) });
});

// Rozepsaný proud se musí zahodit, jinak soubor zůstane zamčený (a Chrome
// nechá ve složce hry dočasný `.crswap`).
it("když selže zápis do rozepsaného souboru, proud zahodí a nic nezapíše", async () => {
  const slozka = new PodvrzenaSlozka("scenario");
  slozka.chybaProudu = "QuotaExceededError";
  prohlizec.vyber.mockResolvedValueOnce(slozka);
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "chyba", text: expect.stringMatching(/Zápis do složky se nepovedl/) });
  expect(slozka.zahozeno).toBe(1);
  expect(zapsano(slozka)).toBeUndefined();
});

// Anonymní okno nebo zakázaná data webu: IndexedDB není. Zápis má projít,
// jen si web složku nezapamatuje.
it("bez IndexedDB uloží, ale příště se ptá znovu", async () => {
  prohlizec.uklid();
  prohlizec = podvrhniProhlizec({ sDatabazi: false });
  vi.stubGlobal("indexedDB", undefined);
  const slozka = new PodvrzenaSlozka("scenario");
  prohlizec.vyber.mockResolvedValue(slozka);
  expect(await ulozDoHry(JA, SOUBOR)).toEqual({ stav: "ulozeno", slozka: "scenario" });
  expect(await nactiSlozku(JA)).toBeNull();
  await ulozDoHry(JA, SOUBOR);
  expect(prohlizec.vyber).toHaveBeenCalledTimes(2);
});
