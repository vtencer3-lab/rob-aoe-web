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
      ],
    },
  });
  expect(emoty).toEqual([
    { jmeno: "DinkDonk", url: "https://cdn.7tv.app/emote/a", siroky: false },
    { jmeno: "DinkDonkWIDE", url: "https://cdn.7tv.app/emote/b", siroky: true },
  ]);
});

it("prázdná odpověď dá prázdnou sadu", () => {
  expect(prevedSadu({})).toEqual([]);
});
