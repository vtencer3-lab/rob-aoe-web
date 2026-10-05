// @vitest-environment node
import { gunzipSync } from "node:zlib";
import { expect, it } from "vitest";
import { importStreamerbotu } from "./streamerbot.js";

// Import pro Streamer.bot (uživatel 5. 10. 2026): rozbalí se stejně jako
// skutečné exporty Streamer.botu — base64 → „SBAE“ → gzip → JSON.
it("import má hlavičku SBAE, akci s kódem a klíčem, časovač 1 s a trigger na něj", async () => {
  const s = await importStreamerbotu("https://jouki.cz/aoe/api/diplo/hra-soubor", "KLIC123");
  const b = Buffer.from(s, "base64");
  expect(b.subarray(0, 4).toString()).toBe("SBAE");
  const j = JSON.parse(gunzipSync(b.subarray(4)).toString("utf8"));
  expect(j).toMatchObject({ version: 23, meta: { autoRunAction: null }, data: { queues: [], commands: [], websocketServers: [], websocketClients: [] } });
  const [akce] = j.data.actions;
  const [casovac] = j.data.timers;
  expect(casovac).toMatchObject({ enabled: true, repeat: true, interval: 1 });
  expect(akce.triggers).toEqual([expect.objectContaining({ type: 701, timerId: casovac.id, enabled: true })]);
  const kod = Buffer.from(akce.subActions[0].byteCode, "base64").toString("utf8");
  expect(akce.subActions[0].type).toBe(99999);
  expect(kod).toContain('const string Klic = "KLIC123";');
  expect(kod).toContain('const string Url = "https://jouki.cz/aoe/api/diplo/hra-soubor";');
  expect(kod).toContain("public class CPHInline");
  // Tep bez hry (zelená kontrolka v pultu GM) jde vedle souboru sondy.
  expect(kod).toContain('const string UrlTepu = "https://jouki.cz/aoe/api/diplo/most/tep";');
});
