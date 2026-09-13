import { expect, it } from "vitest";
import { prevedSadu } from "./emoty.js";

// Ze sady 7TV se bere jméno, základ adresy na CDN (protokol doplněný) a
// příznak širokého emotu; položky bez hostitele se vynechají.
it("převede sadu 7TV na jména a adresy, široké emoty označí", () => {
  const emoty = prevedSadu({
    emote_set: {
      emotes: [
        { name: "DinkDonk", id: "a", data: { host: { url: "//cdn.7tv.app/emote/a" }, width: 32, height: 32 } },
        { name: "DinkDonkWIDE", id: "b", data: { host: { url: "//cdn.7tv.app/emote/b" }, width: 96, height: 32 } },
        { name: "bezHosta", id: "c", data: {} },
        { name: "RainTime", id: "d", flags: 1, data: { host: { url: "//cdn.7tv.app/emote/d" }, width: 32, height: 32 } },
        { name: "SnowTime", id: "e", data: { host: { url: "//cdn.7tv.app/emote/e" }, flags: 256, width: 32, height: 32 } },
      ],
    },
  });
  expect(emoty).toEqual([
    { jmeno: "DinkDonk", url: "https://cdn.7tv.app/emote/a", siroky: false, nulovaSirka: false },
    { jmeno: "DinkDonkWIDE", url: "https://cdn.7tv.app/emote/b", siroky: true, nulovaSirka: false },
    { jmeno: "RainTime", url: "https://cdn.7tv.app/emote/d", siroky: false, nulovaSirka: true },
    { jmeno: "SnowTime", url: "https://cdn.7tv.app/emote/e", siroky: false, nulovaSirka: true },
  ]);
});

it("prázdná odpověď dá prázdnou sadu", () => {
  expect(prevedSadu({})).toEqual([]);
});
