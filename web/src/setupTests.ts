import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Bez tohohle zůstává DOM z předchozího testu ve stejném souboru — a testy,
// co v jednom souboru volají render() víckrát, pak najdou duplicitní prvky.
afterEach(() => {
  cleanup();
});
