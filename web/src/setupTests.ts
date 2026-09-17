import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom zná URL, ale ne createObjectURL a revokeObjectURL — ty patří prohlížeči.
// Push-to-talk je volá na nahraný Blob, takže od 1.7.2 každý běh frontendové sady
// končil nenulovým kódem, i když všech 298 testů prošlo. Rozbitá kontrolka je horší
// než žádná: „testy prošly?“ se přestane dát poznat právě ve chvíli, kdy na tom
// záleží. Adresa je smyšlená schválně — kdyby ji někdo zkusil načíst, ať je to vidět.
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => "blob:test/neexistujici";
  URL.revokeObjectURL = () => {};
}

// Bez tohohle zůstává DOM z předchozího testu ve stejném souboru — a testy,
// co v jednom souboru volají render() víckrát, pak najdou duplicitní prvky.
afterEach(() => {
  cleanup();
});
