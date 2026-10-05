import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { prectiSnimek } from "../shared/diplomacie/hra.js";
import { teloZXsdat } from "./xsdat.js";

// Skutečný soubor sondy z hry (formát 8, 4. 10. 2026) a tělo, které z něj
// složil pythonový most (nastroje/diplomacie/most.py) — TS čtečka musí dát totéž.
const SOUBOR = await readFile(new URL("./fixtures/ROB_DIPLO_3.xsdat", import.meta.url));
const OCEKAVANE = JSON.parse(await readFile(new URL("./fixtures/ROB_DIPLO_3.xsdat.json", import.meta.url), "utf8")) as Record<string, unknown>;

it("soubor sondy dá stejné tělo jako pythonový most a projde kontrolou tvaru", () => {
  const telo = teloZXsdat(SOUBOR, "ROB_DIPLO_3.xsdat", "test");
  expect(telo).toEqual(OCEKAVANE);
  expect(() => prectiSnimek(telo)).not.toThrow();
});

it("cizí, zkrácený a rozepsaný soubor odmítne českou větou", () => {
  expect(() => teloZXsdat(Buffer.from("nesmysl-nesmysl"), "x.xsdat", "t")).toThrow("chybí značka ROBD");
  expect(() => teloZXsdat(SOUBOR.subarray(0, 200), "x.xsdat", "t")).toThrow("zkrácený");
  const rozepsany = Buffer.from(SOUBOR);
  rozepsany.writeInt32LE(123456, rozepsany.length - 4);
  expect(() => teloZXsdat(rozepsany, "x.xsdat", "t")).toThrow("zrovna zapisuje");
});
